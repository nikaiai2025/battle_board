---
task_id: TASK-391
sprint_id: Sprint-155
status: completed
assigned_to: bdd-coding
depends_on: [TASK-390]
created_at: 2026-04-18
updated_at: 2026-04-18
locked_files:
  - "[NEW] src/lib/infrastructure/adapters/gemini-tts-adapter.ts"
  - "[NEW] src/lib/infrastructure/adapters/audio-storage-adapter.ts"
  - "[NEW] src/lib/infrastructure/adapters/audio-compressor.ts"
  - "[NEW] src/__tests__/lib/infrastructure/adapters/gemini-tts-adapter.test.ts"
  - "[NEW] src/__tests__/lib/infrastructure/adapters/audio-storage-adapter.test.ts"
  - "[NEW] src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts"
---

## タスク概要

GH Actions yomiage-worker が使用する3つのインフラアダプタを実装する。
いずれも `IAudioStorageAdapter` / `IGeminiTtsAdapter` / `IAudioCompressor` インターフェースとその本番実装（LitterboxAdapter / GeminiTtsAdapter / AudioCompressor）をセットで作成する。
TASK-394（ワーカー実装）がこれらを DI で注入する。

## 対象BDDシナリオ

- `features/command_yomiage.feature`
  - `GitHub Actions上でWAV生成・軽量化・アップロードが順に行われる`
  - `対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない`
  - `Gemini API呼び出しが失敗した場合は通貨返却・システム通知`
  - `軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される`

（BDD を直接通す責務は TASK-395。本タスクは単体テストのみで完了とする）

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/yomiage.md §5.3` — IGeminiTtsAdapter インターフェース定義
2. [必須] `docs/architecture/components/yomiage.md §5.5` — ffmpeg 軽量化設定（WAV 形式維持・16kHz ダウンサンプル方針）
3. [必須] `docs/architecture/components/yomiage.md §5.6` — IAudioStorageAdapter インターフェース定義
4. [必須] `tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md` — Litterbox API 仕様・リトライ方針・Node.js 実装雛形
5. [参考] `src/lib/infrastructure/adapters/google-ai-adapter.ts` — リトライ戦略・API キー選択ロジックの参考実装

## 入力（前工程の成果物）

- `config/yomiage.ts`（TASK-390）— `YOMIAGE_MODEL_ID` / `YOMIAGE_VOICE_NAMES` 等をインポートして使用

## 出力（生成すべきファイル）

### 1. `src/lib/infrastructure/adapters/gemini-tts-adapter.ts`

**インターフェース:**
```typescript
export interface IGeminiTtsAdapter {
  synthesize(params: {
    text:      string;    // 音声タグプレフィックス付きの読み上げ対象テキスト
    voiceName: string;    // 30種からランダム選択済みの音声名
    modelId:   string;    // 通常は YOMIAGE_MODEL_ID 定数
  }): Promise<{
    pcmBuffer: Uint8Array; // 24kHz mono 16bit PCM（WAVヘッダなし）
    voiceName: string;     // 使用された音声名（ログ用）
  }>;
}
```

**本番実装（GeminiTtsAdapter クラス）:**
- `@google/genai` を使用（既存 `GoogleAiAdapter` と同じパッケージ）
- `responseModalities: ['AUDIO']` + `speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }` を使用
- API キー: 環境変数 `GEMINI_API_KEYS`（カンマ区切り）からランダム選択（`GoogleAiAdapter` と同じ方式）
- リトライ: 最大3回、指数バックオフ 1s/2s/4s、対象は 429/500/503

**注意点（`litterbox_api_handoff.md §2.1` より）:**
Gemini TTS の PoC 出力は完全な RIFF/WAVE ヘッダ付きであることが確認済み。
synthesize() の返却型は `pcmBuffer` だが、実際に Gemini が返すデータが raw PCM か完全 WAV かを
**実装時に Gemini レスポンスの生データをダンプして確認**すること。
- raw PCM の場合: pcmBuffer に raw PCM を格納（ワーカー側で wrapPcmAsWav を適用）
- 完全 WAV の場合: pcmBuffer に WAV を格納し、ワーカー側の wrapPcmAsWav は no-op 化でよい
いずれの場合も インターフェースの型は変えない（`pcmBuffer: Uint8Array` に格納するのみ）。

### 2. `src/lib/infrastructure/adapters/audio-storage-adapter.ts`

**インターフェース:**
```typescript
export interface IAudioStorageAdapter {
  upload(params: {
    data:       Uint8Array;
    filename:   string;      // 例: "yomiage-{pendingId}.wav"
    mimeType:   string;      // 例: "audio/wav"
    expiresAt?: Date;        // TTL ヒント（対応していない場合は無視）
  }): Promise<{
    url: string;             // 公開ダウンロードURL（呼び出し元は不透明文字列として扱う）
  }>;
}
```

**本番実装（LitterboxAdapter クラス）:**
- エンドポイント: `https://litterbox.catbox.moe/resources/internals/api.php`
- `POST multipart/form-data`（reqtype=fileupload, time=72h, fileToUpload=<Blob>）
- 成功判定: HTTP 200 かつレスポンス本文が `https://` で始まる文字列
- エラー判定: HTTP 非200 または `https://` で始まらないレスポンス
- リトライ: 最大3回、指数バックオフ 1s/2s/4s、対象は 5xx / ネットワークエラー
- 実装雛形: `litterbox_api_handoff.md §1.4` を参照

**TDR-018 要件（移行容易性）:**
- インターフェース経由のみでアクセスし、`LitterboxAdapter` を直接 import する箇所はワーカー（TASK-394）のみ
- `litter.catbox.moe` ドメインの検証・パースを行わない
- API キー不要（Litterbox は匿名アップロード）

### 3. `src/lib/infrastructure/adapters/audio-compressor.ts`

**インターフェース:**
```typescript
export interface IAudioCompressor {
  compress(params: {
    input:    Uint8Array;   // 元の WAV バイト列
    filename: string;       // 一時ファイル名のベース（拡張子なし）
  }): Promise<{
    output: Uint8Array;     // 軽量化後の WAV バイト列
  }>;
}
```

**本番実装（AudioCompressor クラス）:**
- `child_process.spawn` で `ffmpeg` CLI を呼び出す
- 入力: 一時ファイルに書き出し → ffmpeg stdin または temp file 経由
- 軽量化設定（yomiage.md §5.5 推奨）: サンプルレート 16kHz へのダウンサンプル + 16bit 維持（WAV 形式維持）
  - `ffmpeg -i input.wav -ar 16000 -acodec pcm_s16le output.wav`
- feature の「URLが指すファイルは WAV 形式である」に準拠するため、AAC/MP3 変換は行わない
- タイムアウト: 30秒（GH Actions ubuntu-latest 上での ffmpeg 処理上限として余裕を持った値）
- 一時ファイルは処理後に必ず削除（try/finally）

## 完了条件

- [ ] `npx vitest run src/__tests__/lib/infrastructure/adapters/gemini-tts-adapter.test.ts` 全 PASS
- [ ] `npx vitest run src/__tests__/lib/infrastructure/adapters/audio-storage-adapter.test.ts` 全 PASS
- [ ] `npx vitest run src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts` 全 PASS
- [ ] `npx vitest run` 全体で回帰なし

### テストで検証すべき観点

**gemini-tts-adapter.test.ts（`@google/genai` をモック）:**
- 正常系: `pcmBuffer` が返ること
- 429 → リトライ後成功（2回目で成功する場合）
- 全試行失敗時: 例外を throw すること
- `text` が `speechConfig` とは別パラメータで渡されること（プロンプトインジェクション設計の確認）

**audio-storage-adapter.test.ts（`fetch` をモック）:**
- 正常系: URL が返ること
- HTTP 200 だが `https://` で始まらないレスポンス → エラー
- HTTP 500 → リトライ → 最終失敗で例外
- HTTP 400 → リトライしない（即エラー）

**audio-compressor.test.ts（`child_process.spawn` をモック）:**
- 正常系: 出力 Uint8Array が返ること
- ffmpeg 終了コード非0 → エラー
- タイムアウト → エラー
- 一時ファイルが削除されること（モックで確認）

## スコープ外

- GH Actions ワーカー本体（TASK-394）
- BDD ステップ定義（TASK-395）
- 実 Gemini API / 実 Litterbox への接続（全テストはモック）

## 補足・制約

- ソースレイアウトガイドの `src/lib/infrastructure/adapters/` に配置（依存方向: adapters は外部ライブラリに依存してよい）
- `IAudioStorageAdapter` / `IGeminiTtsAdapter` / `IAudioCompressor` はファイル内でインターフェースとして export する（別ファイルに分けない）
- **セキュリティ制約**: `GEMINI_API_KEYS` はサーバーサイドのみ（`NEXT_PUBLIC_` プレフィックス禁止）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み:
  - `GeminiTtsAdapter` / `LitterboxAdapter` / `AudioCompressor` を実装
  - 対応する Vitest 単体テストを追加
  - `npx vitest run` 全体回帰確認を実施
- 次にすべきこと: なし
- 未解決の問題:
  - Gemini 実 API の生レスポンス実測は未実施。実装側で MIME / RIFF ヘッダ有無をログ出力する形にしたため、TASK-394 以降の実接続時に確認可能。

### 進捗ログ
<!-- ワーカーが作業中に逐次追記 -->
- 2026-04-18 仕様確認を開始。`docs/architecture/components/yomiage.md §5.3/§5.5/§5.6`、`tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md`、`src/lib/infrastructure/adapters/google-ai-adapter.ts`、`config/yomiage.ts` を読了。
- 2026-04-18 実装方針を整理。`GeminiTtsAdapter` / `LitterboxAdapter` / `AudioCompressor` を新規追加し、Vitest で外部依存をモックする。
- 2026-04-18 単体テストを先に追加し、実装未作成状態で RED（module not found）を確認。
- 2026-04-18 `src/lib/infrastructure/adapters/gemini-tts-adapter.ts` を実装。Gemini TTS 呼び出し、音声バイト列抽出、429/500/503 リトライ、MIME/RIFF ログ出力を追加。
- 2026-04-18 `src/lib/infrastructure/adapters/audio-storage-adapter.ts` を実装。Litterbox multipart upload、HTTP/本文の成否判定、5xx/ネットワークエラーのリトライを追加。
- 2026-04-18 `src/lib/infrastructure/adapters/audio-compressor.ts` を実装。ffmpeg による 16kHz/mono/pcm_s16le 再エンコード、30 秒タイムアウト、一時ディレクトリ削除を追加。
- 2026-04-18 `audio-compressor` テストのイベント同期を修正し、対象3テストをすべて GREEN 化。

### テスト結果サマリー
<!-- テスト実行後にワーカーが追記 -->
- RED確認:
  - `npx vitest run src/__tests__/lib/infrastructure/adapters/gemini-tts-adapter.test.ts` → FAIL（実装ファイル未作成）
  - `npx vitest run src/__tests__/lib/infrastructure/adapters/audio-storage-adapter.test.ts` → FAIL（実装ファイル未作成）
  - `npx vitest run src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts` → FAIL（実装ファイル未作成）
- GREEN:
  - `npx vitest run src/__tests__/lib/infrastructure/adapters/gemini-tts-adapter.test.ts` → PASS（5 tests）
  - `npx vitest run src/__tests__/lib/infrastructure/adapters/audio-storage-adapter.test.ts` → PASS（4 tests）
  - `npx vitest run src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts` → PASS（3 tests）
  - `npx vitest run` → PASS（全体回帰なし）
