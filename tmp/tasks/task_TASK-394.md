---
task_id: TASK-394
sprint_id: Sprint-155
status: completed
assigned_to: bdd-coding
depends_on: [TASK-390, TASK-391, TASK-393]
created_at: 2026-04-18
updated_at: 2026-04-18
locked_files:
  - "[NEW] scripts/yomiage-worker.ts"
  - "[NEW] .github/workflows/yomiage-scheduler.yml"
  - ".github/workflows/ci-failure-notifier.yml"
  - "[NEW] docs/operations/runbooks/yomiage.md"
  - "src/lib/infrastructure/adapters/audio-storage-adapter.ts"
  - "src/__tests__/lib/infrastructure/adapters/audio-storage-adapter.test.ts"
  - "src/__tests__/lib/infrastructure/adapters/gemini-tts-adapter.test.ts"
---

## タスク概要

GH Actions 上で実行される yomiage-worker スクリプトと、
それを起動するワークフローを作成する。
また `.claude/rules/github-workflows.md` の規約に従い `ci-failure-notifier.yml` を更新し、
`LITTERBOX_ADOPTION` エスカレーション後続タスクの運用ランブックを作成する。

## 対象BDDシナリオ

- `features/command_yomiage.feature`:
  - `GitHub Actions上でWAV生成・軽量化・アップロードが順に行われる`
  - `対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない`
  - `Gemini API呼び出しが失敗した場合は通貨返却・システム通知`
  - `軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される`

（BDD を直接通す責務は TASK-395。本タスクはワーカー実装と CI 整備）

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/yomiage.md §5.1` — ワーカー処理フロー（6ステップ）
2. [必須] `docs/architecture/components/yomiage.md §5.2〜§5.6` — 各アダプタの呼び出し方法
3. [必須] `docs/architecture/components/yomiage.md §7` — 環境変数一覧
4. [必須] `scripts/newspaper-worker.ts` — ワーカースクリプトのテンプレート
5. [必須] `.github/workflows/hiroyuki-scheduler.yml` — ワークフローの参考
6. [必須] `.claude/rules/github-workflows.md` — ci-failure-notifier.yml との同期ルール
7. [必須] `tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §2.1` — WAV ヘッダの注意点

## 入力（前工程の成果物）

- `config/yomiage.ts`（TASK-390）— YOMIAGE_MODEL_ID, YOMIAGE_VOICE_NAMES, YOMIAGE_VOICE_TAGS
- `src/lib/domain/rules/wav-encoder.ts`（TASK-390）— wrapPcmAsWav
- `src/lib/domain/rules/yomiage-voice-picker.ts`（TASK-390）— pickVoice
- `src/lib/infrastructure/adapters/gemini-tts-adapter.ts`（TASK-391）— IGeminiTtsAdapter, GeminiTtsAdapter
- `src/lib/infrastructure/adapters/audio-storage-adapter.ts`（TASK-391）— IAudioStorageAdapter, LitterboxAdapter
- `src/lib/infrastructure/adapters/audio-compressor.ts`（TASK-391）— IAudioCompressor, AudioCompressor
- `src/app/api/internal/yomiage/pending/route.ts`（TASK-393）— pending 取得 API
- `src/app/api/internal/yomiage/complete/route.ts`（TASK-393）— 完了通知 API
- `src/app/api/internal/yomiage/target/route.ts`（TASK-393）— 対象レス本文取得 API

## 出力（生成すべきファイル）

### 1. `scripts/yomiage-worker.ts`

`scripts/newspaper-worker.ts` をベースに以下の差異を実装する。

**処理フロー（yomiage.md §5.1 の6ステップ）:**
```
1. GET /api/internal/yomiage/pending → pending リスト取得（最大 MAX_PROCESS_PER_EXECUTION=10 件）
2. 各 pending について:
  a. GET /api/internal/yomiage/target?threadId=...&postNumber=... → 対象レス本文取得
  b. pickVoice() でランダム選択（voiceName, voiceTag）
  c. ttsAdapter.synthesize({ text: "[voiceTag] {body}", voiceName, modelId }) → pcmBuffer 取得
  d. wrapPcmAsWav(pcmBuffer, { sampleRate: 24000, numChannels: 1, bitDepth: 16 }) → WAV バッファ化
  e. compressor.compress({ input: wavBuffer }) → 軽量化 WAV
  f. storageAdapter.upload({ data: compressed, filename: "yomiage-{pendingId}.wav", mimeType: "audio/wav" }) → URL 取得
  g. POST /api/internal/yomiage/complete （成功: { audioUrl, targetPostNumber }）
3. 例外発生時:
  POST /api/internal/yomiage/complete （失敗: { error, stage: "tts"|"compress"|"upload" }）
```

**ステップ (d) の WAV ヘッダ判定:**
`litterbox_api_handoff.md §2.1` に記載の通り、Gemini TTS が完全 WAV を返す場合は
`wrapPcmAsWav` が no-op（入力そのまま返す）になる。実装者は Gemini レスポンスを確認した上で
`wrapPcmAsWav` を呼ぶか否かを決定すること（インターフェースは変えない）。

**text パラメータ構成（プロンプトインジェクション対策）:**
```typescript
const text = `${voiceTag} ${targetPostBody}`;
// voiceTag: "[amazed]" 等のシステム側制御値
// targetPostBody: 対象レス本文（読み上げ対象テキスト）
// 音声設定は speechConfig パラメータで別途制御されるため、テキスト内容は出力形式に影響しない
```

**環境変数:**
```
DEPLOY_URL      — Vercel デプロイ URL
BOT_API_KEY     — Internal API 認証キー
GEMINI_API_KEYS — Gemini API キー（カンマ区切り）
```

**エラーハンドリング:**
- 各ステップは独立した try/catch で囲む
- 例外が発生した場合は `stage` を特定して `/complete` に失敗通知を送る
- pending は必ず削除される（Vercel の /complete ハンドラが担当）

### 2. `.github/workflows/yomiage-scheduler.yml`

`hiroyuki-scheduler.yml` のパターンをそのままコピーし以下を差し替える:

```yaml
name: Yomiage Scheduler

on:
  workflow_dispatch: {}

jobs:
  process-yomiage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Process yomiage commands
        env:
          DEPLOY_URL: ${{ secrets.DEPLOY_URL }}
          BOT_API_KEY: ${{ secrets.BOT_API_KEY }}
          GEMINI_API_KEYS: ${{ secrets.GEMINI_API_KEYS }}
        run: npx tsx scripts/yomiage-worker.ts
```

ffmpeg は `ubuntu-latest` に同梱済みのため、追加インストール不要。

### 3. `.github/workflows/ci-failure-notifier.yml`（既存ファイル追記）

`.claude/rules/github-workflows.md` の規約に従い、`workflows:` リストに追加:
```yaml
      - "Yomiage Scheduler"
```

### 4. `docs/operations/runbooks/yomiage.md`

`tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §5.2` の監視内容を元に、
以下のセクションを持つランブックを作成:

- **目的**: yomiage の定常運用と障害対応手順
- **監視対象**: GH Actions `Yomiage Scheduler` 成功率 / pending 滞留 / Litterbox 応答
- **障害対応手順**:
  - Gemini TTS 障害: `config/commands.yaml` で `yomiage.enabled: false` に変更する手順
  - Litterbox 障害: TDR-018 移行条件・移行手順への参照（`docs/architecture/architecture.md §13`）
  - pending 詰まり: 手動で `/api/internal/yomiage/pending` を確認 → 手動 `/complete` で回収する手順

## 完了条件

- [ ] `yomiage-scheduler.yml` が構文エラーなく CI で読み取れること（`yamllint` 等で確認）
- [ ] `ci-failure-notifier.yml` に `"Yomiage Scheduler"` が追加されていること
- [ ] `docs/operations/runbooks/yomiage.md` が作成されていること
- [ ] `npx vitest run` 全体で回帰なし
- [ ] TypeScript コンパイルエラーなし（`npx tsc --noEmit`）

（ワーカースクリプト自体の単体テストは本タスクのスコープ外。実 API 接続は本番 PoC で確認）

## スコープ外

- BDD ステップ定義（TASK-395）
- Litterbox 実 API との結合テスト（手動 PoC で確認）
- Gemini TTS の実 API 結合テスト（同上）
- GH Actions Secrets の設定（GEMINI_API_KEYS は既存 Secrets を共用。新規 Secrets 不要）

## 補足・制約

- ffmpeg は `ubuntu-latest` ランナーに同梱済みのため `run: sudo apt-get install ffmpeg` 不要
- worker スクリプトは Node.js `child_process.spawn` で ffmpeg を呼ぶ（AudioCompressor 経由）
- **セキュリティ制約**: 環境変数はクライアントサイドに流出しないこと（worker はサーバーサイドのみで実行）
- TDR-018 移行容易性: `yomiage-worker.ts` 内の `LitterboxAdapter` 組み立て箇所が将来の R2 移行時の唯一の変更点になるよう設計すること（インターフェース経由）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: ワーカー実装、ワークフロー追加、failure notifier 同期、runbook 作成、追加許可された3ファイルの型エラー修正、`npx tsc --noEmit` / `npx vitest run` / YAML 構文確認の全PASS。
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
<!-- ワーカーが作業中に逐次追記 -->
- 2026-04-18: 起動。必読資料（`docs/architecture/components/yomiage.md`、`scripts/newspaper-worker.ts`、`.github/workflows/hiroyuki-scheduler.yml`、`.claude/rules/github-workflows.md`、`tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md`）と既存 `yomiage` 実装（adapter / internal API）を確認し、ワーカー・workflow・runbook の実装方針を確定。
- 2026-04-18: `scripts/yomiage-worker.ts` を実装。pending 取得、対象レス取得、voice 選択、Gemini TTS、WAV 正規化、ffmpeg 圧縮、Litterbox upload、`/complete` 通知までのフローを追加。
- 2026-04-18: `.github/workflows/yomiage-scheduler.yml` を追加し、`.github/workflows/ci-failure-notifier.yml` の `workflows:` に `Yomiage Scheduler` を同期。
- 2026-04-18: `docs/operations/runbooks/yomiage.md` を追加。監視対象、Gemini/Litterbox 障害対応、pending 手動回収手順を記述。
- 2026-04-18: `npx tsc --noEmit` 実行で `locked_files` 外の既存型エラーを検出。`tmp/escalations/escalation_ESC-TASK-394-1.md` を起票。
- 2026-04-18: 人間の指示により `src/lib/infrastructure/adapters/audio-storage-adapter.ts` と関連テスト2件が `locked_files` に追加されたため、TASK-394 を再開。
- 2026-04-18: `audio-storage-adapter.ts` の `BlobPart` 型不整合を修正し、関連テスト2件の private `_sleep` 差し替え方法を直接代入へ変更して TypeScript エラーを解消。
- 2026-04-18: `npx tsc --noEmit` と `npx vitest run` を再実行し、いずれも PASS を確認。

### テスト結果サマリー
<!-- テスト実行後にワーカーが追記 -->
- `npx vitest run`: PASS
- YAML 構文確認（`.github/workflows/yomiage-scheduler.yml`, `.github/workflows/ci-failure-notifier.yml`）: PASS
- `npx tsc --noEmit`: PASS
