# Sprint-148: BOTスケジューラ障害修正（チュートリアルBOTブロック + キュレーションBOT認証エラー）

> 開始: 2026-03-29

## スコープ

bot-scheduler cron 実行時に発生している2件のエラーを修正する。

### 問題1: チュートリアルBOTがスケジューラをブロック
- `processPendingTutorials()` の Step 2d（`updateNextPostAt(null)`）に到達しないケースで `next_post_at` が残存
- `findDueForPost()` で投稿対象として拾われ、`TutorialBehaviorStrategy` が tutorialThreadId 未設定で throw
- MAX_BOTS_PER_EXECUTION=5 の枠を毎回消費

### 問題2: キュレーションBOTの createThread 認証エラー
- `BotService.executeBotPost()` → `createThreadFn(null, "bot-{id}")` → `PostService.createThread()` → `resolveAuth(null, ipHash, false)`
- edgeToken=null で認証フローが発火 → `{ success: false, authRequired: {...} }` が返される
- error フィールドが undefined → 「不明」エラー

## 修正方針

### 修正A: findDueForPost でチュートリアルBOTを除外
`bot-repository.ts` の `findDueForPost()` に `bot_profile_key != 'tutorial'` 条件を追加。
チュートリアルBOTは1回限りの使い捨てであり、定期投稿の対象にすべきでない。

### 修正B: processPendingTutorials のリセット堅牢化
`bot-service.ts` の `processPendingTutorials()` で、executeBotPost 実行後の `updateNextPostAt(null)` を try ブロックの早い段階で実行するか、finally ブロックで確実に実行する。

### 修正C: createThread の BOT書き込み対応
`post-service.ts` の `createThread()` に `isBotWrite` パラメータを追加し、BOT書き込み時は認証フローをスキップする。
`bot-service.ts` の `createThreadFn` 呼び出しで `isBotWrite: true` を渡す。

### 修正D: CreateThreadResult のエラーメッセージ改善
`post-service.ts` の authRequired 返却時に `error: "認証が必要です"` を設定。undefined → "不明" の落とし穴を防止。

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/infrastructure/repositories/bot-repository.ts` | `findDueForPost()` にtutorial除外条件追加 |
| `src/lib/services/bot-service.ts` | `processPendingTutorials()` のnullリセット堅牢化 + `createThreadFn` 呼び出し修正 |
| `src/lib/services/post-service.ts` | `createThread()` に isBotWrite パラメータ追加、authRequired 時の error 設定 |

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 |
|---|---|---|---|
| TASK-375 | BOTスケジューラ障害修正（修正A〜D） | bdd-coding (opus) | - |

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-375 | `src/lib/infrastructure/repositories/bot-repository.ts`, `src/lib/services/bot-service.ts`, `src/lib/services/post-service.ts` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-375 | completed | 修正A〜D完了。vitest 2225 / cucumber 412 PASS。新規テスト7件追加 |
| TASK-SMOKE-148 | completed | 30/35 PASS（5件ローカル限定スキップ） |
