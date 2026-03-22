# INCIDENT-CRON500: Cron Triggers bot/execute HTTP 500

**日時:** 2026-03-21 13:36 UTC ~ 19:36 UTC (確認範囲)
**影響:** BOT自動投稿が大半失敗 (72/75回 = 96% 失敗率)
**ステータス:** 原因特定済み、修正待ち

## 症状

Cloudflare Workers の Cron Triggers (*/5 * * * *) から `WORKER_SELF_REFERENCE.fetch()` 経由で呼び出される `/api/internal/bot/execute` が HTTP 500 を返す。

scheduled ハンドラのログ:
```
[scheduled] bot/execute failed: 500
```

## 根本原因

**Cloudflare Workers の subrequest 上限に到達している。**

### エラーチェーン

1. scheduled ハンドラが `WORKER_SELF_REFERENCE.fetch()` で `/api/internal/bot/execute` を呼び出す
2. route.ts が `executeBotPost()` を最大5BOT分ループ実行する
3. 各BOT投稿で `PostService.createPost()` が呼ばれる
4. PostService 内で `IncentiveService.evaluateOnPost()` が呼ばれる (isBotWrite でもスキップされない)
5. IncentiveService が BOT の botUserId で Supabase にクエリを発行する
   - `IncentiveLogRepository.findByUserIdAndDate()` -- 1回
   - `UserRepository.findById()` -- 1回
   - `IncentiveLogRepository.create()` (daily_login) -- 1回 → **FK制約違反** (botId が users テーブルに存在しない)
   - `IncentiveLogRepository.create()` (new_thread_join) -- 1回 → **FK制約違反**
   - その他の判定クエリ
6. BOT投稿 x 4-5回 で Supabase への外部リクエストが累積し、**Workers の subrequest 上限 (50) に到達**
7. `processPendingTutorials()` の `PendingTutorialRepository.findAll()` が上限超過エラーで throw
8. route.ts の外側 catch で捕捉 → HTTP 500 を返す

### wrangler tail で取得したエラーログ

```json
{
  "logs": [
    {"message": ["[IncentiveService] daily_login ボーナス付与中にエラー:", "Error: IncentiveLogRepository.create failed: insert or update on table \"incentive_logs\" violates foreign key constraint \"incentive_logs_user_id_fkey\""]},
    {"message": ["[IncentiveService] new_thread_join ボーナス付与中にエラー:", "Error: IncentiveLogRepository.create failed: insert or update on table \"incentive_logs\" violates foreign key constraint \"incentive_logs_user_id_fkey\""]},
    // ... (4BOT分 x 2 = 8回繰り返し)
    {"message": ["[PostService] IncentiveService.evaluateOnPost (sync) failed:", "Error: IncentiveLogRepository.findByUserIdAndDate failed: Error: Too many subrequests by single Worker invocation."]},
    {"message": ["[POST /api/internal/bot/execute] Unhandled error:", "Error: PendingTutorialRepository.findAll failed: Error: Too many subrequests by single Worker invocation."]}
  ],
  "event": {"request": {"url": "https://dummy-host/api/internal/bot/execute", "method": "POST"}}
}
```

## 問題の所在 (2つの問題)

### 問題1: BOT書き込みでIncentiveServiceが呼ばれている

`src/lib/services/post-service.ts` Line 533:
```typescript
if (!isSystemMessage) {  // isBotWrite のチェックがない
    // ... IncentiveService.evaluateOnPost() が呼ばれる
}
```

BOT書き込み (`isBotWrite=true`) でも IncentiveService が実行される。BOTの botUserId は users テーブルに存在しないため:
- FK制約違反で全ボーナスが失敗する (無駄なクエリ)
- 失敗しても catch されて続行するが、Supabase への subrequest は消費済み

### 問題2: subrequest 消費量がWorkers上限に近い

1回の cron 発火で最大5BOT x 各BOTの Supabase クエリ (10+回) で、50 subrequest 上限にすぐ到達する。
仮に問題1を修正しても、BOT数が増えれば同じ問題が再発しうる。

## 修正方針

### 必須修正 (問題1)

`src/lib/services/post-service.ts` の IncentiveService 呼び出し箇所 (Line 533付近) で `isBotWrite` チェックを追加する。

```typescript
// Before:
if (!isSystemMessage) {

// After:
if (!isSystemMessage && !input.isBotWrite) {
```

同様に、遅延評価ボーナス (Line 683付近) にも同じガードが必要。

### 推奨修正 (問題2)

`route.ts` の `MAX_BOTS_PER_EXECUTION` を 5 → 2 に減らす、または `processPendingTutorials()` を個別の try-catch で囲んで、BOT投稿が成功した分は 500 にしない。

## 該当ファイル

| ファイル | 修正内容 |
|---|---|
| `src/lib/services/post-service.ts` L533, L683 | `isBotWrite` チェック追加 |
| `src/app/api/internal/bot/execute/route.ts` L95 | `processPendingTutorials` の個別 try-catch |
