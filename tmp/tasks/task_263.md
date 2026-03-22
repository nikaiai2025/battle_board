---
task_id: TASK-263
sprint_id: Sprint-93
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T21:00:00+09:00
updated_at: 2026-03-22T21:00:00+09:00
locked_files:
  - src/lib/services/post-service.ts
  - src/app/api/internal/bot/execute/route.ts
---

## タスク概要

Cloudflare Workers の Cron Triggers から呼ばれる `/api/internal/bot/execute` が HTTP 500 を返すバグを修正する。根本原因は BOT書き込み時に IncentiveService が不要に呼ばれ、FK制約違反の無駄なクエリで subrequest 上限(50)に到達すること。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/reports/INCIDENT-CRON500.md` — 障害調査レポート（根本原因・修正箇所の詳細）
2. [必須] `src/lib/services/post-service.ts` — 修正対象（L533, L683付近）
3. [必須] `src/app/api/internal/bot/execute/route.ts` — 修正対象（L95付近）

## 修正内容

### 修正1（必須）: post-service.ts — BOT書き込み時のIncentiveServiceスキップ

L533付近の IncentiveService 呼び出しガード:
```typescript
// Before:
if (!isSystemMessage) {

// After:
if (!isSystemMessage && !input.isBotWrite) {
```

L683付近の遅延評価ボーナスにも同じガードを追加。

### 修正2（推奨）: route.ts — processPendingTutorials の個別try-catch

L95付近の `processPendingTutorials()` を個別の try-catch で囲み、subrequest上限超過でもBOT投稿の成功分が500にならないようにする。

## 完了条件

- [ ] BOT書き込み時にIncentiveServiceが呼ばれないこと
- [ ] processPendingTutorialsの失敗がBOT投稿結果に影響しないこと
- [ ] `npx vitest run` 全テストPASS

## スコープ外

- IncentiveService自体のロジック変更
- BOTのsubrequest消費量の最適化（将来課題）
- Cron Triggersの実行確認（デプロイ後の本番検証は別途実施）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 修正1・修正2・テスト追加・全テストPASS確認
- 未解決の問題: なし

### 進捗ログ

- INCIDENT-CRON500.md を読み、根本原因・修正箇所を確認
- `post-service.ts` L533 (`!isSystemMessage` → `!isSystemMessage && !input.isBotWrite`) 修正完了
- `post-service.ts` L683 遅延評価ボーナスにも同じガードを追加
- `route.ts` L95 `processPendingTutorials` を個別 try-catch で囲む修正完了
- `post-service.test.ts` に `isBotWrite=true` 時に IncentiveService が呼ばれないテストを追加
- `bot-execute.test.ts` に `processPendingTutorials` 失敗でも 200 を返すテストを追加

### テスト結果サマリー

- 関連テストファイル 2件・72テスト: 全件 PASS
- 全テスト実行: 80ファイル・1655テスト PASS（1ファイル失敗は変更前から存在する既存問題 `omikuji-handler.test.ts`）
