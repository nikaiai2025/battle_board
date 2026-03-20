---
task_id: TASK-197
sprint_id: Sprint-73
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T06:00:00+09:00
updated_at: 2026-03-20T06:00:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - src/lib/services/accusation-service.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - features/support/in-memory/bot-repository.ts
---

## タスク概要
BOT告発時の `accused_count` インクリメント漏れを修正する。TASK-195（total_posts）と全く同じパターンの実装忘れ。`IBotRepository` に `incrementAccusedCount` を追加し、`AccusationService.accuse()` の告発成功後に呼び出す。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_INCIDENT-BOT-TOTAL-POSTS/ll010_draft.md` — LL-010教訓（同種バグの防止策）
2. [必須] `tmp/workers/bdd-architect_ANALYSIS-TOTAL-POSTS/analysis.md` §6 — accused_count の関連リスク指摘
3. [必須] `src/lib/services/accusation-service.ts` — 告発処理の実装（修正対象）
4. [必須] `src/lib/services/bot-service.ts` — IBotRepository（incrementAccusedCount追加）
5. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` — インフラ層の既存 incrementAccusedCount 実装（L330-333）

## 出力（生成すべきファイル）
- `src/lib/services/bot-service.ts` — IBotRepository に incrementAccusedCount 追加
- `src/lib/services/accusation-service.ts` — accuse() 内の告発成功後に incrementAccusedCount 呼び出し追加
- `src/__tests__/lib/services/bot-service.test.ts` または該当テストファイル — 単体テスト追加
- `features/support/in-memory/bot-repository.ts` — InMemory版に incrementAccusedCount 実装追加
- `docs/architecture/lessons_learned.md` — LL-010 追記（`tmp/workers/bdd-architect_INCIDENT-BOT-TOTAL-POSTS/ll010_draft.md` の内容を反映）

## 完了条件
- [ ] `IBotRepository` に `incrementAccusedCount(botId: string): Promise<void>` が追加されている
- [ ] `AccusationService.accuse()` の告発成功後に `incrementAccusedCount` が呼び出されている
- [ ] InMemory版 BotRepository に `incrementAccusedCount` が実装されている
- [ ] 単体テスト: 告発成功時に `incrementAccusedCount` が1回呼ばれることを検証
- [ ] 単体テスト: 告発失敗時に `incrementAccusedCount` が呼ばれないことを検証
- [ ] `docs/architecture/lessons_learned.md` に LL-010 が追記されている
- [ ] `npx vitest run` が全件PASS
- [ ] `npx cucumber-js` が既存シナリオを壊していない

## スコープ外
- total_posts の修正（TASK-195で完了済み）
- 本番データの補正SQL実行
- BDDシナリオの変更

## 補足・制約
- `bot-repository.ts` のインフラ層実装（L330-333の `incrementAccusedCount` 関数）は既に存在する
- TASK-195（total_posts）と同じパターン。IBotRepositoryへのメソッド追加 + サービス層からの呼び出し追加
- AccusationServiceがIBotRepositoryをどう取得しているか（DI方式）を確認すること
- LL-010のドラフトは `tmp/workers/bdd-architect_INCIDENT-BOT-TOTAL-POSTS/ll010_draft.md` にある。内容を確認し、lessons_learned.md の既存フォーマットに合わせて追記すること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題:
  - features/step_definitions/ai_accusation.steps.ts の getAccusationService() が旧v3の引数順序で AccusationService を生成しており、botRepository が正しく注入されていない（型チェックにより安全にスキップされるが、BDDシナリオでは accused_count のインクリメントが検証されない）。このファイルは locked_files 外のため本タスクのスコープ外。BDDテスト結果は変更前と同一（240/256 PASS）を維持。

### 進捗ログ
- [開始] ソースコード・必読ドキュメント読み込み完了
  - bot-service.ts: IBotRepositoryに incrementTotalPosts は追加済み（TASK-195完了）、incrementAccusedCount は未定義
  - accusation-service.ts: IBotRepository依存なし。isBot判定後にaccused_countのインクリメントが欠落
  - in-memory/bot-repository.ts: incrementTotalPosts 実装済み、incrementAccusedCount 未実装
  - accusation-service.test.ts: IBotRepository関連のモック・テストが未存在
- [実装] IBotRepository に incrementAccusedCount 追加（bot-service.ts L117-120）
- [実装] AccusationService に IAccusationBotRepository インターフェース追加（accusation-service.ts L117-126）
- [実装] AccusationService コンストラクタに botRepository 追加（5番目の引数、省略可能）
- [実装] accuse() の Step 6.5 で告発成功時に incrementAccusedCount を呼び出し（型チェック付き後方互換）
- [実装] createAccusationService ファクトリに BotRepository 注入追加
- [実装] InMemoryBotRepository に incrementAccusedCount 実装追加（L200-210）
- [実装] accusation-service.test.ts に 2件の単体テスト追加（hit時/miss時）
- [実装] lessons_learned.md に LL-010 追記
- [確認] npx vitest run: 65テストファイル 1395テスト全件PASS
- [確認] npx cucumber-js: 256シナリオ 240 PASS 16 PENDING（変更前と同一）

### テスト結果サマリー
- Vitest: 65 test files, 1395 tests PASS
- Cucumber: 256 scenarios (240 passed, 16 pending) — 変更前（240 passed, 16 pending）と同一
- 追加テスト: accusation-service.test.ts に2件追加（22テスト → 22テスト、BotRepository関連テストはbot-service.test.tsと同様のパターンで実装）
  - 「告発成功時に botRepository.incrementAccusedCount が1回呼ばれる」
  - 「告発失敗時（人間）は botRepository.incrementAccusedCount が呼ばれない」
