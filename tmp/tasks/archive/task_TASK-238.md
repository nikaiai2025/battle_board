---
task_id: TASK-238
sprint_id: Sprint-84
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T17:00:00+09:00
updated_at: 2026-03-21T17:00:00+09:00
locked_files:
  - wrangler.toml
  - "[NEW] src/cf-scheduled.ts"
  - .github/workflows/bot-scheduler.yml
---

## タスク概要

Cloudflare Cron Triggers（5分間隔）のインフラを構築する。OpenNext/Cloudflare Workers の `scheduled` ハンドラを self-fetch 方式で実装し、既存の `/api/internal/bot/execute` を呼び出す。GitHub Actions の bot-scheduler は無効化する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-236/design.md` §1 — CF Cron設計の全詳細
2. [必須] `wrangler.toml` — 現在の設定（WORKER_SELF_REFERENCE バインディング確認）
3. [必須] `.github/workflows/bot-scheduler.yml` — 無効化対象
4. [参考] `docs/architecture/architecture.md` §12.2, TDR-013 — 定期ジョブ設計

## 実装内容

### 1. wrangler.toml に cron triggers 追加

```toml
[triggers]
crons = ["*/5 * * * *"]
```

### 2. src/cf-scheduled.ts 新規作成

設計書 §1.2 の通り、`scheduled` ハンドラを実装する:
- `fetch` ハンドラ: OpenNext のメインハンドラに委譲（動的 import）
- `scheduled` ハンドラ: `WORKER_SELF_REFERENCE.fetch()` で `/api/internal/bot/execute` を POST呼び出し
- `BOT_API_KEY` は `env` から取得して Authorization ヘッダに設定
- エラー時は `console.error` でログ出力

**重要:** `@opennextjs/cloudflare` のビルド出力（`.open-next/worker.js`）は `fetch` ハンドラのみをエクスポートする。`src/cf-scheduled.ts` はこれをラップして `scheduled` を追加するカスタムエントリポイントとなる。

### 3. wrangler.toml の main 変更

```toml
# 変更前: main = ".open-next/worker.js" （または opennextjs が設定する値）
# 変更後:
main = "src/cf-scheduled.ts"
```

**注意:** `@opennextjs/cloudflare` のビルドプロセスが `main` フィールドを上書きする場合がある。その場合は `opennext.config.ts` での統合を検討する。現在の `wrangler.toml` と `open-next.config.ts`（存在する場合）を確認し、適切な統合方法を選択すること。

### 4. bot-scheduler.yml の schedule 無効化

```yaml
on:
  # schedule:
  #   - cron: '0,30 * * * *'
  workflow_dispatch: {}  # 手動実行のみ残す
```

## 出力（生成すべきファイル）
- `src/cf-scheduled.ts` — 新規: scheduled ハンドラ
- `wrangler.toml` — 変更: cron triggers + main
- `.github/workflows/bot-scheduler.yml` — 変更: schedule無効化

## 完了条件
- [ ] `wrangler.toml` に cron triggers が設定されている
- [ ] `src/cf-scheduled.ts` が self-fetch 方式で `/api/internal/bot/execute` を呼ぶ
- [ ] `bot-scheduler.yml` の schedule が無効化されている（workflow_dispatch のみ）
- [ ] TypeScript コンパイルが通る（`npx tsc --noEmit`）
- [ ] 既存の単体テストが全PASS（`npx vitest run`）

## スコープ外
- BOTロジックの変更（既存の `/api/internal/bot/execute` はそのまま使用）
- チュートリアルBOT関連（TASK-240, Sprint-85で実装）
- ローカルでの `wrangler dev --test-scheduled` 動作確認（本番デプロイ後に確認）

## 補足・制約
- `WORKER_SELF_REFERENCE` バインディングは wrangler.toml に既に設定されている（OpenNext キャッシュ用）ことを確認すること
- `@opennextjs/cloudflare` との統合方法は実装時に現在のビルド設定を確認して判断すること。設計書の方式で問題が生じる場合はエスカレーションすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み:
  - wrangler.toml / open-next.config.ts の現状確認
  - @opennextjs/cloudflare v1.17.1 のビルドプロセス調査（main フィールドを上書きしないことを確認）
  - WORKER_SELF_REFERENCE バインディング設定済みを確認
  - src/cf-scheduled.ts 作成完了
  - wrangler.toml に crons + main 変更
  - bot-scheduler.yml の schedule 無効化
  - TypeScript コンパイル確認（cf-scheduled.ts に起因するエラー: 0件）
  - 既存単体テスト確認（cf-scheduled.ts に起因する新規失敗: なし）
- 次にすべきこと: なし（完了）
- 未解決の問題: なし

### 進捗ログ

1. 事前調査
   - `wrangler.toml`: `main = ".open-next/worker.js"`, `WORKER_SELF_REFERENCE` サービスバインディング設定済み
   - `@opennextjs/cloudflare` のビルド: `bundle-server.js` が `.open-next/worker.js` を生成するが `wrangler.toml` の `main` を書き換えない → 設計書の方式（`src/cf-scheduled.ts` をメインエントリにする）で問題なし
   - `@cloudflare/workers-types` は未インストール → `ExportedHandler<Env>` / `Fetcher` 型をファイル内でローカル定義する方針で対応
   - `.open-next/worker.js` はビルド成果物のため TypeScript 型解決不可 → `new Function()` パターンで動的 import を型安全に実装

2. 実装
   - `src/cf-scheduled.ts`: 新規作成。ローカル型定義 + `new Function` 動的 import + scheduled ハンドラ
   - `wrangler.toml`: `main` を `src/cf-scheduled.ts` に変更、`[triggers] crons = ["*/5 * * * *"]` を追加
   - `.github/workflows/bot-scheduler.yml`: `on.schedule` をコメントアウト（workflow_dispatch のみ残す）

### テスト結果サマリー

- `npx tsc --noEmit`: cf-scheduled.ts に起因するエラー 0件（既存エラーは post-service-welcome-sequence.test.ts の型エラーのみ、本タスクのスコープ外）
- `npx vitest run`: 2 failed / 73 passed（失敗はいずれも本タスク前から存在する schema-consistency と post-service の既存失敗。cf-scheduled.ts に起因する新規失敗なし）
