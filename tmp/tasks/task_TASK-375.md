---
task_id: TASK-375
sprint_id: Sprint-148
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T19:00:00+09:00
updated_at: 2026-03-29T19:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/bot-repository.ts
  - src/lib/services/bot-service.ts
  - src/lib/services/post-service.ts
---

## タスク概要

bot-scheduler cron 実行時に発生している2件のエラーを修正する:
1. チュートリアルBOTが `findDueForPost()` で拾われてスケジューラを毎回ブロックしている
2. キュレーションBOTの `createThread` が認証エラー（edgeToken=null）で失敗している

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` — `findDueForPost()` の実装（行543-556付近）
2. [必須] `src/lib/services/bot-service.ts` — `executeBotPost()` の createThread 呼び出し（行1134-1148付近）、`processPendingTutorials()` の nullリセット
3. [必須] `src/lib/services/post-service.ts` — `createThread()` の認証フロー（行917-1049付近、特に行944の resolveAuth 呼び出しと行986-990のauthRequired返却）
4. [参考] `src/app/api/internal/bot/execute/route.ts` — cronからの呼び出しフロー

## 本番エラーログ（証拠）

bot-scheduler の直近2回の実行結果（2026-03-29 05:00, 06:43 UTC）:
```json
{
  "totalDue": 2,
  "processed": 2,
  "successCount": 0,
  "failureCount": 2,
  "results": [
    {
      "botId": "4bbd6620-...",
      "error": "TutorialBehaviorStrategy.decideAction: tutorialThreadId が未設定です"
    },
    {
      "botId": "29d49124-...",
      "error": "BotService.executeBotPost: createThread が失敗しました: 不明"
    }
  ]
}
```

## 修正内容

### 修正A: findDueForPost() でチュートリアルBOTを除外

`src/lib/infrastructure/repositories/bot-repository.ts` の `findDueForPost()`:
- クエリに `.neq("bot_profile_key", "tutorial")` または `.not("bot_profile_key", "eq", "tutorial")` を追加
- チュートリアルBOTは1回限りの使い捨てで定期投稿の対象にすべきでない

### 修正B: processPendingTutorials のnullリセット堅牢化

`src/lib/services/bot-service.ts` の `processPendingTutorials()`:
- `executeBotPost()` 実行後の `updateNextPostAt(botId, null)` を確実に実行するよう、finallyブロックに移動するか、try内の早い段階で実行する
- 設計上、executeBotPost内部のStep 9で`next_post_at`が更新されるが、processPendingTutorialsではその直後にnullに戻す必要がある。この順序を壊さないこと

### 修正C: createThread の BOT書き込み対応

**根本原因**: `PostService.createThread()` （行944付近）が `resolveAuth(edgeToken, ipHash, false)` を呼んでいる。edgeToken=null の場合、resolveAuth は認証要求（authRequired）を返す。BOT書き込み時はこの認証をスキップすべき。

修正方針: `createThread` のシグネチャに `isBotWrite` パラメータを追加し、BOT書き込み時は resolveAuth をスキップ（または isBotWrite=true で resolveAuth を呼ぶ）。

注意: `createThread` は以下から呼ばれている:
1. `src/app/api/threads/route.ts` — Web API経由（人間ユーザー）→ isBotWrite=false
2. `src/lib/services/bot-service.ts` — BOT書き込み → isBotWrite=true

既存の呼び出し元すべてに `isBotWrite` パラメータを追加すること。デフォルト値は `false` にして後方互換を保つ。

`bot-service.ts` の `createThreadFn` の型定義も更新が必要。

### 修正D: CreateThreadResult のエラーメッセージ改善

`post-service.ts` の authRequired 返却箇所（行986-990付近）:
- `error: "認証が必要です"` を追加して、undefined → "不明" の落とし穴を防止

## 完了条件

- [ ] `npx vitest run` 全テストPASS（回帰なし）
- [ ] `npx cucumber-js` 全テストPASS（回帰なし）
- [ ] findDueForPost() がチュートリアルBOTを除外する単体テストが存在すること
- [ ] createThread が isBotWrite=true で認証スキップする単体テストが存在すること

## スコープ外

- DB上の既存チュートリアルBOTの `next_post_at` クリーンアップ（コード修正で今後の再発を防止。既存データはfindDueForPostの除外条件で無害化される）
- execute/route.ts の変更（エラーハンドリングは現状で十分）
- bot-scheduler.yml の変更

## 補足・制約

- `createThread` のシグネチャ変更は影響範囲が広いため、慎重にすすめること
- `resolveAuth` の内部ロジックは変更しない。createThread 側で分岐するだけ
- BOT書き込み時は edge-token の発行・検証は不要。ipHash に `bot-{botId}` が渡される既存の仕組みを維持
- `createPost`（レス書き込み）は既に `isBotWrite` パラメータが存在している可能性がある。存在するなら同じパターンに合わせること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 修正A/B/C/D 全て完了、全テストPASS
- 未解決の問題: なし

### 進捗ログ

- 修正A: `bot-repository.ts` findDueForPost() に `.neq("bot_profile_key", "tutorial")` 追加
- 修正B: `bot-service.ts` processPendingTutorials() の updateNextPostAt を finally ブロックに移動
- 修正C: `post-service.ts` createThread() に `isBotWrite` パラメータ追加（デフォルト false）
  - `bot-service.ts` CreateThreadFn 型に `isBotWrite?` 追加
  - `bot-service.ts` executeBotPost() の createThreadFn 呼び出しに `true` 追加
  - createThread 内の createPost 呼び出しに isBotWrite を伝播
- 修正D: `post-service.ts` createThread() の authRequired 返却2箇所に `error: "認証が必要です"` 追加
- 既存テスト更新: bot-service.test.ts の processPendingTutorials テストを finally ブロック対応に修正

### テスト結果サマリー

- `npx vitest run`: 116 test files, 2225 tests PASS (0 failed)
- `npx cucumber-js`: 433 scenarios (412 passed, 18 pending, 3 undefined), 2344 steps (2275 passed)
- 新規テスト追加:
  - `bot-repository.test.ts` findDueForPost: 4 tests (正常系、空配列、neq条件検証、DB異常系)
  - `post-service.test.ts` createThread isBotWrite: 3 tests (BOT書き込み成功、デフォルト認証エラー、isBotWrite伝播)
