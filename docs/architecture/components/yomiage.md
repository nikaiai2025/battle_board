# D-08 コンポーネント境界設計書: Yomiage（レス読み上げコマンド）

> ステータス: 実装済み（2026-04-19 Sprint-155 リリース）
> 関連D-07: §3.2 CommandService / §12.2 非同期処理トポロジ / TDR-018
> 関連D-08: `command.md` §5「非同期副作用のキューイングパターン」
> 関連feature: `features/command_yomiage.feature`

---

## 1. 分割方針

`!yomiage >>N` は **Gemini TTS で音声ファイルを生成し、一時公開ストレージにアップロードし、ダウンロードURLを★システムレスで配布する**非同期コマンドである。

`command.md` §5「非同期副作用のキューイングパターン」および TDR-017「workflow_dispatch パターン」を前提とし、以下の分担で実装する:

| フェーズ | 実行場所 | 責務 |
|---|---|---|
| 同期 | Vercel (PostService → CommandService → YomiageHandler) | コマンド解析・対象レス検証・通貨消費・pending INSERT・workflow_dispatch |
| 非同期 | GitHub Actions (`scripts/yomiage-worker.ts`) | pending 取得 → Gemini TTS 呼び出し → WAVヘッダ付与 → MP4（AAC）変換 → 音声配信ストレージアップロード → 結果送信 |
| 完了反映 | Vercel (`/api/internal/yomiage/complete`) | ★システムレス投稿・失敗時の通貨返却・pending 削除 |

`!newspaper` / `!hiroyuki` と同じ非同期パターンを採用するが、**音声バイナリを外部ストレージに逃がす追加ステップ**が存在する点が既存コマンドと異なる。

---

## 2. 公開インターフェース

### 2.1 YomiageHandler（CommandHandler 実装）

```
commandName:  "yomiage"
execute(ctx: CommandContext): CommandHandlerResult
```

`command.md` §2.2 の `CommandHandler` インターフェースに準拠する。Handler 本体の責務は同期フェーズに限られ、AI 呼び出し・音声処理・アップロードは含まない。

### 2.2 YomiageService — 完了処理

```
completeYomiageCommand(deps, params): YomiageResult
```

`completeNewspaperCommand` と同じ形状のエントリポイント。GH Actions worker からの完了通知（成功: 音声URL, 失敗: エラー文字列）を受けて、★システムレス投稿・通貨返却・pending 削除を行う。

### 2.3 Internal API

| メソッド | パス | 呼び出し元 | 責務 |
|---|---|---|---|
| `GET`  | `/api/internal/yomiage/pending`  | GH Actions worker | `pending_async_commands` から `commandType="yomiage"` を返す（`command_type` カラムで区別する既存パターン） |
| `POST` | `/api/internal/yomiage/complete` | GH Actions worker | 完了結果（成功URLまたはエラー）を受け取り DB 反映 |

認証は既存の `BOT_API_KEY` を Bearer で共用する（`verifyInternalApiKey`）。

**`/complete` のリクエストボディ（成功時）:**
```
{
  pendingId:     string,
  threadId:      string,
  invokerUserId: string,
  targetPostNumber: number,
  success: true,
  audioUrl: string       // 音声配信ストレージのダウンロードURL（不透明文字列として扱う）
}
```

**`/complete` のリクエストボディ（失敗時）:**
```
{
  pendingId:     string,
  threadId:      string,
  invokerUserId: string,
  targetPostNumber: number,
  success: false,
  error:   string,
  stage:   "tts" | "compress" | "upload"   // エラー発生フェーズ（観測用・振る舞いには影響しない）
}
```

TDR-018 要件 #4「API 契約のベンダー非依存」に従い、`audioUrl` は文字列として受け渡すだけで URL 構造の検証・パースは行わない。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| CommandService | CommandHandler Registry に YomiageHandler を登録 |
| CurrencyService | 同期フェーズの通貨消費（CommandService 共通処理経由）、完了処理の失敗時返却（`credit`） |
| PostService (createPost) | ★システムレスの投稿（成功通知・失敗通知とも） |
| PendingAsyncCommandRepository | `pending_async_commands` の INSERT / SELECT / DELETE（`command_type="yomiage"`） |
| PostRepository | 同期フェーズの対象レス検証（削除済み・システムメッセージ判定）、非同期フェーズの対象レス本文取得 |
| GithubWorkflowTrigger | pending INSERT 直後の `workflow_dispatch("yomiage-scheduler.yml")` 発火（`withWorkflowTrigger` デコレータ経由） |
| IGeminiTtsAdapter | Gemini TTS 呼び出し（GH Actions worker 内のみ） |
| IAudioStorageAdapter | 音声配信ストレージへのアップロード（GH Actions worker 内のみ） |
| ffmpeg (CLI) | MP4（AAC）変換（GH Actions worker 内のみ。`ubuntu-latest` ランナーには**同梱されておらず**、ワークフロー内で明示インストールが必要: `sudo apt-get install -y ffmpeg`） |

### 3.2 被依存

```
PostService  →  CommandService  →  YomiageHandler         （同期）
GH Actions   →  yomiage-worker  →  IGeminiTtsAdapter       （非同期）
                                 →  IAudioStorageAdapter
GH Actions   →  Vercel (/complete) → YomiageService
```

---

## 4. 同期フェーズ設計（YomiageHandler）

`command.md §5` で定義された `preValidate` / `execute` の2段構えで実装する。`preValidate` は通貨消費前に呼ばれるため、対象レスのバリデーション失敗時は通貨を消費しない（feature 記述と一致）。

### 4.1 preValidate: 対象レスバリデーション

以下のケースで `{ success: false, systemMessage }` を返す。いずれも通貨消費前に判定される。

| 条件 | systemMessage |
|---|---|
| `>>N` 引数が存在しない | `"対象レスを指定してください"` |
| `postNumber` が数値として不正（0以下、NaN） | `"無効なレス番号です"` |
| 対象レスが `isDeleted` | `"削除されたレスは対象にできません"` |
| 対象レスが `isSystemMessage` | `"システムメッセージは対象にできません"` |

対象レス取得は `postRepository.findByThreadIdAndPostNumber(threadId, postNumber)` を使用する（`!hiroyuki` と同じ抽象）。存在しない postNumber は CommandService Step 1.5 (`PostNumberResolver`) が先に弾くため、preValidate 内では `null` 返却時の追加処理は不要（防御的に `null` なら OK とする）。

### 4.2 execute: pending INSERT

preValidate 通過後、通貨消費を経て呼ばれる。execute は以下のみを行う:

1. `rawArgs[0]` から `postNumber` を取得
2. `pending_async_commands` に INSERT（`command_type="yomiage"`, `payload` は §6.1 参照）
3. `{ success: true, systemMessage: null }` を返す（非ステルス・インライン出力なし）

pending INSERT は `withWorkflowTrigger` デコレータでラップされた `PendingAsyncCommandRepository` を経由するため、INSERT 成功時に `workflow_dispatch("yomiage-scheduler.yml")` が fire-and-forget で発火する（TDR-017 準拠）。

### 4.3 通貨返却の責務分離

- **バリデーション失敗** (preValidate): 通貨は最初から消費されない
- **pending INSERT 失敗** (execute): 既存ポリシー通り通貨は消費されたまま（DB 障害時の例外）
- **非同期フェーズ失敗** (worker → /complete): 完了通知API側で明示的に `credit` で返却（§5.1 + YomiageService）

この責務分離により、feature 各シナリオの期待と実装が一致する。

---

## 5. 非同期フェーズ設計（yomiage-worker.ts）

### 5.1 ワーカー処理フロー

`scripts/newspaper-worker.ts` のテンプレートを踏襲する。1回の `workflow_dispatch` で `MAX_PROCESS_PER_EXECUTION` 件（= 10）まで処理する。

1. `GET /api/internal/yomiage/pending` で pending リスト取得
2. 各 pending について下記を実行:
   1. 対象レス本文を取得（`payload.targetPostNumber` を用いて `GET /api/internal/yomiage/target`。または pending 側で取得済み本文を payload 埋め込み。§6.1 参照）
   2. `ttsAdapter.synthesize({ text, voiceName })` で PCM 音声を生成（§5.3 参照）
   3. PCM に WAV ヘッダを付与して WAV バッファ化（§5.4 参照）
   4. ffmpeg で MP4（AAC）に変換（§5.5 参照）
   5. `audioStorageAdapter.upload(mp4Buffer)` でアップロードし URL 取得（§5.6 参照）
   6. `POST /api/internal/yomiage/complete` に成功通知（`audioUrl`, `targetPostNumber`）
3. いずれかのステップで例外発生時、`POST /complete` に失敗通知（`stage` 付き）を送る

各ステップは独立した try/catch で囲み、失敗時は `stage` を特定して失敗通知を送る。リトライは各アダプタ内部で実施し、ワーカー層では行わない（§5.3-5.6 参照）。

### 5.2 Gemini TTS モデル・音声構成

- **MODEL_ID**: `"gemini-3.1-flash-tts-preview"`（設定層で定数化、§5.7）
- **音声構成（30種）**: Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Callirrhoe, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalgethi, Laomedeia, Achernar, Alnilam, Schedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat
- **音声タグ（17種）**: `[amazed]`, `[crying]`, `[curious]`, `[excited]`, `[excitedly]`, `[sighs]`, `[gasp]`, `[giggles]`, `[laughs]`, `[mischievously]`, `[panicked]`, `[sarcastic]`, `[serious]`, `[shouting]`, `[tired]`, `[trembling]`, `[whispers]`
- **出力形式**: PCM 24kHz mono 16bit（Gemini TTS 仕様。WAV ヘッダは別途付与）

voiceName と voice tag はワーカー実行時にランダムに選択する。選択ロジックは純粋関数として `src/lib/domain/rules/yomiage-voice-picker.ts` に配置する（ドメイン層・外部依存なし・単体テスト可能）。

### 5.3 IGeminiTtsAdapter インターフェース

Gemini TTS は既存の `GoogleAiAdapter.generate()` と構造的に異なる（`responseModalities: ['AUDIO']` + `speechConfig`）ため、**専用アダプタを新設する**。既存 `GoogleAiAdapter` に機能追加するとテキスト生成の契約が汚染されるため分離する。

```
interface IGeminiTtsAdapter {
  synthesize(params: {
    text:       string     // 音声タグプレフィックス付きの読み上げ対象テキスト
    voiceName:  string     // 30種からランダム選択済みの音声名
    modelId:    string     // 通常は YOMIAGE_MODEL_ID 定数
  }): Promise<{
    pcmBuffer:  Uint8Array // 24kHz mono 16bit PCM（WAVヘッダなし）
    voiceName:  string     // 使用された音声名（ログ用）
  }>
}
```

**配置**: `src/lib/infrastructure/adapters/gemini-tts-adapter.ts`
**リトライ戦略**: `GoogleAiAdapter` と同一（最大3回、指数バックオフ 1s/2s/4s、429/500/503 対象）。Gemini TTS プレビューは不定期に 500 を返すため、リトライ必須。
**API キー**: `GEMINI_API_KEYS`（既存）をカンマ区切りからランダム選択。

### 5.4 WAV ヘッダ付与

Gemini TTS の応答は生 PCM のため、一般的な WAV プレーヤで再生可能にするには RIFF/WAVE ヘッダを付与する必要がある。ヘッダ付与は純粋関数として分離する:

**配置**: `src/lib/domain/rules/wav-encoder.ts`
**関数**: `wrapPcmAsWav(pcm: Uint8Array, { sampleRate: 24000, numChannels: 1, bitDepth: 16 }): Uint8Array`
**単体テストで検証する観点**:
- RIFF ヘッダサイズが `data` チャンクサイズ + 36 と一致する
- `fmt` チャンクの AudioFormat=1（PCM）, ChannelCount=1, SampleRate=24000, BitsPerSample=16
- 実 PCM バイト長が `data` チャンクサイズと一致する

### 5.5 MP4（AAC）変換（ffmpeg）

**配置**: `src/lib/infrastructure/adapters/audio-compressor.ts`
**依存**: `ffmpeg` CLI を `child_process.spawn` 経由で呼び出す。`ubuntu-latest` GH Actions ランナーには同梱されていないため、`yomiage-scheduler.yml` 内で明示インストールする:
```yaml
- name: Install ffmpeg
  run: |
    sudo apt-get update
    sudo apt-get install -y ffmpeg
```
**変換設定**:
- 入力: WAV（PCM 24kHz mono 16bit）
- 出力: MP4（AAC コーデック、64kbps、拡張子 `.mp4`）
- モノラル維持、サンプルレート 24000 Hz 維持
- ブラウザ音声プレーヤー（`<audio>` タグ）での埋め込み再生に対応した形式

### 5.6 IAudioStorageAdapter インターフェース（TDR-018 要件 #1）

```
interface IAudioStorageAdapter {
  upload(params: {
    data:     Uint8Array
    filename: string         // 例: "yomiage-{pendingId}.mp4"
    mimeType: string         // 例: "audio/mp4"
    expiresAt?: Date         // TTL ヒント（アダプタが対応していれば尊重、そうでなければ無視）
  }): Promise<{
    url: string              // 公開ダウンロードURL（呼び出し元は不透明文字列として扱う）
  }>
}
```

**配置**: `src/lib/infrastructure/adapters/audio-storage-adapter.ts` にインターフェースと `LitterboxAdapter`（暫定実装）を配置
**将来の差し替え**: TDR-018 の移行条件成立時に `R2StorageAdapter` を追加し、`yomiage-worker.ts` の DI を差し替える。他コンポーネント・DB スキーマ・API 契約は無変更で完結する。
**エラー処理**: HTTP 5xx / ネットワーク系はアダプタ内で最大3回リトライ（指数バックオフ）。全試行失敗時は例外を投げ、ワーカーが失敗通知を送る。

### 5.7 設定層

- **`config/yomiage.ts`**: モデル ID・音声名リスト（30種）・音声タグリスト（17種）の定数エクスポート。`newspaper-categories.ts` と同じ型付き `as const` パターン。

### 5.8 ユーザー入力の扱い（プロンプトインジェクション整合）

CLAUDE.md 横断的制約「ユーザー入力をそのままLLMに渡すことを禁止」への適合:

- Gemini TTS はプロンプト従属型の LLM とは異なり、`text` パラメータは **読み上げ対象テキストとしてのみ解釈される**（音声設定や出力形式は `speechConfig` による別パラメータで制御）
- システム側が制御する可変パラメータ: `modelId`、`voiceName`、voice tag プレフィックス、`sampleRate` 等（全てハードコード or ランダム選択）
- ユーザー由来の可変データ: 対象レス本文のみ（`text` パラメータの末尾に結合）
- feature シナリオ `対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない` はこの構造により自然に満たされる

---

## 6. データモデル

### 6.1 `pending_async_commands` 利用

既存テーブルを流用する（新規テーブルは作らない。`command.md` §5 方針）。`command_type="yomiage"` で識別。

**`payload` JSON:**
```
{
  model_id:         "gemini-3.1-flash-tts-preview",
  targetPostNumber: 5      // 対象レス番号（対象レス本文は非同期フェーズで都度取得）
}
```

対象レス本文を payload に埋め込まない理由: (a) pending INSERT 時点の本文と非同期実行時点の本文がズレる可能性（削除・編集）があり、都度取得が安全、(b) payload サイズを最小化する。

### 6.2 音声ファイル自体のDB保存はしない

音声バイナリは DB に保存せず、`posts.body` に公開URL文字列のみを含める（TDR-018 要件 #3）。`posts` テーブルへのカラム追加は行わない。

### 6.3 ★システムレスの本文構成

**成功時の例:**
```
>>5 の読み上げ音声ができたよ
https://litterbox.catbox.moe/xxxxxxxx.mp4
※ 音声は一定期間（約72時間）後に取得不可になります
```

- `>>5` で対象レスが分かる（feature要件）
- URL 行を独立させ、5ch 専ブラでも自動リンク化されやすくする
- 期限表記で UX 期待値を揃える（TDR-018 リスク対処）
- Web UI（PostItem.tsx）では `.mp4` URL を検出して `<audio>` タグで埋め込み再生する（`url-detector.ts` で URL 種別判定）

**失敗時の例:**
```
>>5 の読み上げに失敗しました。通貨は返却されました。
```

---

## 7. 秘密情報・環境変数

### 7.1 GH Actions 側（`yomiage-scheduler.yml`）

| 変数 | 用途 | 管理場所 |
|---|---|---|
| `DEPLOY_URL` | Vercel API への向き先 | GH Secrets（既存共用） |
| `BOT_API_KEY` | Internal API 認証 | GH Secrets（既存共用） |
| `GEMINI_API_KEYS` | Gemini TTS 呼び出し | GH Secrets（既存共用） |
| （音声配信ストレージ用キー） | 暫定採用アダプタは API キー不要。将来の R2 移行時に追加（例: `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`） | GH Secrets |

### 7.2 Vercel 側

| 変数 | 用途 | 管理場所 |
|---|---|---|
| `GITHUB_PAT` | `workflow_dispatch` 発火（既存） | Vercel Env |
| `BOT_API_KEY` | Internal API 認証（既存） | Vercel Env |

Vercel は音声生成・アップロードには一切関与しないため、`GEMINI_API_KEYS` や音声ストレージ用秘密情報を Vercel 側に配置しない（D-07 §12.2 準拠）。

---

## 8. 隠蔽する実装詳細

- voice name / voice tag の選択アルゴリズム（一様ランダム / 重み付き等）
- Gemini TTS のリトライ回数・バックオフ間隔（アダプタ内部）
- ffmpeg の具体的なオプション文字列
- 音声配信ストレージの具体ベンダー名・API仕様（TDR-018 要件 #2）
- `pending_async_commands` のポーリング間隔（GH Actions のトリガ契約に委ねる）

---

## 9. 設計上の判断

### 9.1 既存 GoogleAiAdapter に統合せず、GeminiTtsAdapter を新設する

- **メリット**: `generateWithSearch` / `generate` の返り値型が `{ text, ... }` であるのに対し、TTS は `{ pcmBuffer, ... }` と本質的に異なる。1つのアダプタに同居させると契約が汚染され、テストモックが複雑化する
- **デメリット**: 内部的には同じ `@google/genai` を使用するため、リトライ戦略・API キー選択ロジックの実装が重複する
- **対処**: リトライ戦略は両アダプタで共通の純粋関数（`retryWithBackoff` 等）にリファクタリング候補として残置。今回の yomiage 実装ではアダプタ内に独立実装し、後続タスクで共通化を検討

### 9.2 対象レス本文を payload に埋め込まず都度取得する

- **メリット**: 削除・編集との整合性。削除済みレスがキュー後に発覚した場合、非同期フェーズ側で再検出して適切にエラー化できる
- **デメリット**: 非同期フェーズで DB 参照が増える（1レス/1pending）
- **判断**: 非同期頻度が低いこと（ユーザーコマンド起動のみ）と、整合性を優先して都度取得を採用

### 9.3 Audio storage 側の公開URL 構造を API 契約で検証しない

- TDR-018 要件 #4。Litterbox → R2 移行時に URL ドメインや形状が変わるため、API 契約側が構造を前提とすると移行コストが増大する
- `audioUrl: string` の単純な受け渡しに限定し、ドメイン制約等のバリデーションはアダプタ側のみに閉じる

### 9.4 Vercel 側で音声処理を一切行わない

- Vercel Hobby は 10秒制約（D-07 §12.2）。Gemini TTS は単発でも 5-15 秒を要する可能性があり、完全に GH Actions に逃がす
- Vercel の API Route は (a) pending INSERT、(b) workflow_dispatch、(c) 完了通知の受付、の3種の軽量処理のみ担当

### 9.5 feature の承認ゲート（完了済み）

- 本feature は非同期コマンド・外部ストレージ連携・TTS 新導入という複合要素を含み、feature 承認と同時に本D-08設計書と TDR-018 のレビューを伴った
- Sprint-155 にて人間レビューを経て `features/ドラフト_実装禁止/` から `features/command_yomiage.feature` へ昇格済み

---

## 10. ファイル配置

新規作成:

```
config/
  yomiage.ts                              # モデルID、音声名30種、voice tag 17種

src/lib/
  domain/rules/
    wav-encoder.ts                        # PCM → WAV ヘッダ付与（純粋関数）
    yomiage-voice-picker.ts               # voice name / tag のランダム選択（純粋関数）
    url-detector.ts                       # URL 種別判定（音声URLかどうかの検出）
  infrastructure/adapters/
    gemini-tts-adapter.ts                 # IGeminiTtsAdapter + 本番実装
    audio-storage-adapter.ts              # IAudioStorageAdapter + LitterboxAdapter（暫定）
    audio-compressor.ts                   # ffmpeg 呼び出しラッパ（WAV → MP4/AAC 変換）
  services/
    yomiage-service.ts                    # completeYomiageCommand
    handlers/yomiage-handler.ts           # YomiageHandler（CommandHandler 実装）

src/app/
  (web)/_components/
    PostItem.tsx                          # 音声URLを <audio> タグで埋め込み再生（既存ファイルに追加）
  api/internal/yomiage/
    pending/route.ts                      # GET
    complete/route.ts                     # POST
    target/route.ts                       # GET（対象レス本文取得。pending と分離する場合）

scripts/
  yomiage-worker.ts                       # GH Actions ワーカー

.github/workflows/
  yomiage-scheduler.yml                   # workflow_dispatch 専用（ffmpeg 明示インストール含む）

src/__tests__/
  lib/domain/rules/
    wav-encoder.test.ts
    yomiage-voice-picker.test.ts
  lib/services/
    yomiage-service.test.ts
    handlers/yomiage-handler.test.ts

features/step_definitions/
  command_yomiage.steps.ts                # feature ステップ定義
```

既存の変更:

- `config/commands.yaml`: `yomiage` エントリ追加済み（コミット未適用）
- `src/lib/services/command-service.ts`: YomiageHandler の DI 登録・`withWorkflowTrigger("yomiage-scheduler.yml")` の追加
- `.github/workflows/ci-failure-notifier.yml`: `workflows:` リストに `Yomiage Scheduler` を追加（`.claude/rules/github-workflows.md` ルール準拠）

---

## 11. テスト戦略

| レベル | 対象 | モック |
|---|---|---|
| 単体（Vitest） | `wav-encoder`, `yomiage-voice-picker` | 外部依存なし（純粋関数） |
| 単体（Vitest） | `YomiageHandler.preValidate` | `IYomiagePostRepository` モック。4ケース（引数なし / 不正番号 / 削除済み / システムメッセージ）+ 正常系をカバー |
| 単体（Vitest） | `YomiageHandler.execute` | `IPendingRepository` モック。pending INSERT が正しい commandType・payload で呼ばれることを検証 |
| 単体（Vitest） | `YomiageService.completeYomiageCommand` | `createPostFn` / `creditFn` / `pendingAsyncCommandRepository` を DI モック |
| 単体（Vitest） | `GeminiTtsAdapter` | `@google/genai` を fetch モック（429/500 リトライ検証含む） |
| 単体（Vitest） | `AudioCompressor`, `LitterboxAdapter` | `child_process.spawn` / `fetch` をモック |
| BDD（Cucumber） | feature 全シナリオ | `IGoogleAiAdapter` / `IAudioStorageAdapter` / `IAudioCompressor` / `IGeminiTtsAdapter` をインメモリ実装 |
| E2E（Playwright） | `e2e/flows/basic-flow.spec.ts` に基本フロー1本（`.claude/rules/command-handler.md` 準拠） | 実Gemini API・実ストレージは呼ばない（モックサーバへの迂回または e2e 用 feature flag で無効化） |

---

## 12. 運用

### 12.1 監視対象

- GH Actions `Yomiage Scheduler` の成功率（既存 `ci-failure-notifier.yml` のリスト追加で自動カバー）
- `pending_async_commands` の `command_type="yomiage"` の滞留件数（1時間以上滞留 → 異常）
- Gemini TTS の 500 エラー連続率（API キー障害・モデル障害の検出）
- 音声配信ストレージのアップロード失敗率（アダプタ差し替え判断材料）

### 12.2 障害対応

- **Gemini TTS 障害**: 通貨返却 + ★システム通知（既存エラーパターン）。長期障害時は `config/commands.yaml` で `yomiage.enabled: false` に切替
- **音声配信ストレージ障害**: 同上。TDR-018 移行条件に該当する場合は R2 移行判断へ
- **GH Actions ランナー待ち長期化**: `!newspaper` と同パターン。ユーザーへのタイムアウト通知機能は本 MVP スコープ外

ランブック `docs/operations/runbooks/yomiage.md` を実装完了前に整備する（TDR-018 後続タスク）。

---

## 13. 関連

- **D-07 `architecture.md`**:
  - §2.2 外部サービス表（Litterbox 追加済み）
  - §12.2 非同期処理トポロジ（yomiage 行追加済み）
  - TDR-015（Gemini 採用）、TDR-017（workflow_dispatch パターン）、TDR-018（Litterbox 暫定採用）
- **D-08 `command.md`**:
  - §2.2 CommandHandler インターフェース
  - §5 非同期副作用のキューイングパターン
  - §5 ターゲット任意パターン（yomiage は `targetFormat: ">>postNumber"` の必須指定、省略時は本設計§4.1-Step2 でエラー返却）
- **エスカレーション**: `tmp/escalations/archive/escalation_LITTERBOX_ADOPTION.md`（解決・アーカイブ済み）
- **feature**: `features/command_yomiage.feature`
