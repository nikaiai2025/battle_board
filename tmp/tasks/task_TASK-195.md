---
task_id: TASK-195
sprint_id: Sprint-72
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T04:20:00+09:00
updated_at: 2026-03-20T04:20:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - features/support/in-memory/bot-repository.ts
---

## タスク概要
BOT投稿時の `total_posts` インクリメント漏れを修正する。`IBotRepository` インターフェースに `incrementTotalPosts` を追加し、`executeBotPost` の bot_posts INSERT 成功直後に呼び出す。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_ANALYSIS-TOTAL-POSTS/analysis.md` — 根本原因分析・修正方針
2. [必須] `src/lib/services/bot-service.ts` — 修正対象（IBotRepository + executeBotPost）
3. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` — インフラ層の既存 incrementTotalPosts 実装（L324-326）

## 出力（生成すべきファイル）
- `src/lib/services/bot-service.ts` — IBotRepository に incrementTotalPosts 追加 + executeBotPost 内の呼び出し追加
- `src/__tests__/lib/services/bot-service.test.ts` — 単体テスト2件追加
- `features/support/in-memory/bot-repository.ts` — InMemory版に incrementTotalPosts 実装追加

## 完了条件
- [ ] `IBotRepository` インターフェースに `incrementTotalPosts(botId: string): Promise<void>` が追加されている
- [ ] `executeBotPost` の bot_posts INSERT 成功直後（Step 8の try ブロック内）で `incrementTotalPosts` が呼び出されている
- [ ] InMemory版 BotRepository に `incrementTotalPosts` が実装されている
- [ ] 単体テスト: `executeBotPost` 成功時に `incrementTotalPosts` が1回呼ばれることを検証
- [ ] 単体テスト: `botPostRepository.create` 失敗時に `incrementTotalPosts` が呼ばれないことを検証
- [ ] `npx vitest run` が全件PASS
- [ ] `npx cucumber-js` が既存シナリオを壊していない（238 passed, 16 pending, 0 failed）

## スコープ外
- 本番データの補正SQL実行（デプロイ後に手動で実施）
- `accused_count` の同種問題の調査（別タスクで対応）
- BDDシナリオの変更

## 補足・制約
- `bot-repository.ts` のインフラ層実装（L324-326の `incrementTotalPosts` 関数）は既に存在する。新規実装は不要
- RPC関数 `increment_bot_column` も `total_posts` カラムに対応済み
- `incrementTotalPosts` は bot_posts INSERT と同一 try ブロック内に配置すること（分析 §4.1 参照）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: bot-service-scheduling.test.ts のモックが IBotRepository に incrementTotalPosts を未実装（locked_files 外のため修正対象外。テスト自体はPASSしているが、実行時エラーログが stderr に出力される。次スプリントで修正推奨）

### 進捗ログ

1. タスク指示書・分析書・対象ファイル（bot-service.ts, bot-service.test.ts, in-memory/bot-repository.ts）を読み込み
2. `IBotRepository` インターフェースに `incrementTotalPosts(botId: string): Promise<void>` を追加（bot-service.ts L112-117）
3. `executeBotPost` の Step 8 tryブロック内で `botPostRepository.create()` 成功直後に `this.botRepository.incrementTotalPosts(botId)` の呼び出しを追加（bot-service.ts L752-767）
4. InMemory版に `incrementTotalPosts` を実装（features/support/in-memory/bot-repository.ts L185-196）
5. `createMockBotRepository` ヘルパーに `incrementTotalPosts` モックを追加（bot-service.test.ts L91）
6. 単体テスト2件を追加（bot-service.test.ts L897-955）:
   - `PostService 成功後に botRepository.incrementTotalPosts が1回呼ばれる`
   - `botPostRepository.create が失敗した場合は incrementTotalPosts が呼ばれない`

### テスト結果サマリー

- **npx vitest run**: 65 ファイル / 1388 テスト - 全件PASS
  - 備考: `bot-service-scheduling.test.ts` のモックに `incrementTotalPosts` が未定義のため実行時エラーログが stderr に出るが、テスト自体はPASS（locked_files 外のため修正対象外）
- **npx cucumber-js**: 256 scenarios (240 passed, 16 pending, 0 failed) - 既存シナリオ壊れなし
