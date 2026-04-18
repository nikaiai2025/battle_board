---
task_id: TASK-376
sprint_id: Sprint-148
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T20:00:00+09:00
updated_at: 2026-03-29T20:00:00+09:00
locked_files:
  - config/commands.yaml
  - config/commands.ts
  - src/lib/services/handlers/help-handler.ts
  - e2e/flows/basic-flow.spec.ts
---

## タスク概要

!help コマンド実装のレビュー指摘3点を修正する。

## 修正内容

### 1. help をコマンド一覧の先頭に移動

`config/commands.yaml` と `config/commands.ts` の両方で、`help` エントリを `commands:` 直下の最初のエントリに移動する。
JavaScriptのオブジェクトプロパティ列挙順（挿入順）により、`generateAnnouncementBody` で生成されるコマンド一覧の先頭に表示されるようになる。

### 2. help-handler.ts のJSDoc修正

`src/lib/services/handlers/help-handler.ts` の冒頭JSDoc:
- 「隠しコマンド（裏技）」→「案内表示コマンド」に修正
- L9 の `hidden: true（コマンドヘルプに表示されない）` を削除

### 3. E2E basic-flow テスト追加

`e2e/flows/basic-flow.spec.ts` に !help コマンドのテストケースを追加。
既存の !abeshinzo テストケースと同様のパターンで、!help を投稿して「案内板」を含むシステムレスが表示されることを確認する。
他のコマンドのテストを参考にすること。

## 完了条件

- [ ] `npx vitest run` 全テストPASS
- [ ] commands.yaml と commands.ts で help が先頭にあること
- [ ] help-handler.ts のJSDocに「隠しコマンド」が含まれないこと

## スコープ外

- help-handler.ts のロジック変更（eliminationNotice の使用は現状維持）
- announcement-text.ts の内容変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 修正1〜3 + E2Eテスト追加
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `config/commands.yaml`: `help` エントリを `commands:` 直下の先頭に移動
- `config/commands.ts`: `help` エントリを `commands:` 直下の先頭に移動
- `src/lib/services/handlers/help-handler.ts`: JSDoc修正（「隠しコマンド（裏技）」→「案内表示コマンド」、`hidden: true` 行削除、タグ更新）
- `e2e/flows/basic-flow.spec.ts`: `!help` テストケースを追加（テスト3）、テスト番号コメントを繰り下げ

### テスト結果サマリー

- `npx vitest run`: 117ファイル / 2231テスト 全PASS
- E2Eテスト（basic-flow.spec.ts）: ローカル環境での実行は未実施（本番E2Eは実環境必要）
