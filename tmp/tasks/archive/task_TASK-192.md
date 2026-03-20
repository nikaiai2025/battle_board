---
task_id: TASK-192
sprint_id: Sprint-70
status: completed
assigned_to: bdd-coding
depends_on: [TASK-191]
created_at: 2026-03-19T12:00:00+09:00
updated_at: 2026-03-19T12:00:00+09:00
locked_files:
  - features/step_definitions/bot_system.steps.ts
---

## タスク概要

`bot_system.feature` の「荒らし役ボットはスレッドを作成しない」シナリオのステップ定義が `assert(true)` で空検証になっているバグを修正する。
設計上の保証（`executeBotPost` は既存スレッドIDを引数として受け取る設計）は存在するが、テストとしての検証が形骸化している。

## 対象BDDシナリオ

- `features/bot_system.feature` L135-139 @荒らし役ボットはスレッドを作成しない

## 必読ドキュメント（優先度順）

1. [必須] `docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md` — 問題 #2 の記述
2. [必須] `features/bot_system.feature` L135-139 — 対象シナリオ
3. [参考] `src/lib/services/bot-service.ts` — `executeBotPost` の設計（既存スレッドID引数）

## 修正方針

`bot_system.steps.ts` L796-808 の2つのステップ定義を実検証に格上げする:

**案1（推奨）:** `executeBotPost` を呼び出した前後でスレッド数が変化しないことを検証する

```typescript
Then("ボットは既存のスレッドに書き込む", async function (this: BattleBoardWorld) {
  // InMemory ThreadRepository のスレッド数が変化しないことを確認
  // executeBotPost が既存スレッドIDのみ受け取る設計を検証
});

Then("新しいスレッドの作成は行わない", async function (this: BattleBoardWorld) {
  // InMemory ThreadRepository のスレッド数が変化しないことを確認
});
```

**案2:** BotService の `create_thread` アクション時にエラーが発生することを検証する

ワーカーは最適な方式を判断して実装すること。

## 出力（生成すべきファイル）

- `features/step_definitions/bot_system.steps.ts` — L796-808 のスタブ→実検証

## 完了条件

- [ ] `npx cucumber-js --tags @荒らし役ボットはスレッドを作成しない` がPASS
- [ ] `npx vitest run` 全件PASS
- [ ] `assert(true)` が残存していないこと

## スコープ外

- BDDシナリオ（`features/*.feature`）の変更
- BotService本体の変更
- 問題 #1 → TASK-191で対応済み

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 実装・全テスト確認済み
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 関連ファイル調査: bot_system.steps.ts L831-843, bot_system.feature L135-139, bot-service.ts L708-713 を確認
- 実装: L831-868 の2ステップを実検証ロジックに置き換え
  - `Then ボットは既存のスレッドに書き込む`: botPostNumberToId(100) から postId を取得し、InMemoryPostRepo.findByThreadId でそのレスが currentThreadId に存在することを検証
  - `Then 新しいスレッドの作成は行わない`: InMemoryThreadRepo.findByBoardId で TEST_BOARD_ID のスレッドが1件のみかつ currentThreadId と一致することを検証
- assert(true) の完全排除を確認

### テスト結果サマリー

- BDDテスト: 254 scenarios (16 pending, 238 passed, 0 failed)
  - 対象シナリオ「荒らし役ボットはスレッドを作成しない」: PASS
- 単体テスト: 64 test files passed, 1381 tests passed, 0 failed
- assert(true) 残存: なし
