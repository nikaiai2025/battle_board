---
task_id: TASK-232
sprint_id: Sprint-81
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T02:10:00+09:00
updated_at: 2026-03-22T02:10:00+09:00
locked_files:
  - "e2e/api/senbra-compat.spec.ts"
  - "docs/specs/screens/thread-view.yaml"
---

## タスク概要
Sprint-80再検証で検出された2件を修正する。(1) senbra-compat.spec.ts cleanupDatabaseのFK制約違反修正、(2) D-06 !wコマンド説明文修正。

## 修正項目

### 1. senbra-compat.spec.ts cleanupDatabase FK制約修正
- ファイル: `e2e/api/senbra-compat.spec.ts`
- 問題: `cleanupDatabase()` で `posts` を削除する前に `grass_reactions` テーブルを削除していないため、FK制約違反（PostgreSQL 23503）で409エラーが発生する
- 修正: `posts` 削除の**前**に `grass_reactions` テーブルの全レコードを削除するステップを追加する
- 参考: DBスキーマ上、`grass_reactions.target_post_id` は `posts(id)` を参照する外部キー制約 `grass_reactions_target_post_id_fkey` を持つ
- cleanupDatabaseの既存の削除順序パターン（子テーブル→親テーブル）に倣い、同じSupabase REST API呼び出しパターンで実装する
- 削除対象テーブルの確認: `grass_reactions`以外にも`posts`への外部キー制約を持つテーブルがないか、supabaseのマイグレーションファイルで確認すること。漏れがあれば同時に対応する

### 2. D-06 !wコマンド説明文修正
- ファイル: `docs/specs/screens/thread-view.yaml`
- 問題: `!w` の説明が「今日の草履歴（指定レスの投稿者の当日書き込み一覧）」となっているが、正本 (`config/commands.yaml`, `features/reactions.feature`) では「指定レスに草を生やす」
- 修正: `!w` の説明を「指定レスに草を生やす」に修正する
- 照合先: `config/commands.yaml` の!w定義、`features/reactions.feature` の草リアクション関連シナリオ

## 必読ドキュメント
1. [必須] `e2e/api/senbra-compat.spec.ts` — cleanupDatabase関数（42〜84行付近）
2. [必須] `docs/specs/screens/thread-view.yaml` — command-helpセクション
3. [参考] `supabase/migrations/` — 外部キー制約の確認
4. [参考] `config/commands.yaml` — コマンド定義正本
5. [参考] `features/reactions.feature` — 草リアクション仕様

## 完了条件
- [ ] `npx playwright test --project=api` 全テストPASS（29/29）
- [ ] `npx vitest run` 全テストPASS
- [ ] thread-view.yaml の !w 説明文が正本と一致

## スコープ外
- featureファイルの変更
- cleanupDatabase以外のテストロジック変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全修正項目
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- `e2e/api/senbra-compat.spec.ts` の `cleanupDatabase()` を修正
  - `grass_reactions`（target_post_id -> posts FK）の削除ステップを追加
  - `attacks`（post_id -> posts FK）の削除ステップを追加（漏れ対応）
  - `accusations`（target_post_id -> posts FK）の削除ステップを追加（漏れ対応）
  - `bot_posts`（post_id -> posts FK）の削除ステップを追加（漏れ対応）
  - 削除順序: grass_reactions → attacks → accusations → bot_posts → posts → threads → edge_tokens
- `docs/specs/screens/thread-view.yaml` の `!w` 説明文を修正
  - 変更前: `今日の草履歴（指定レスの投稿者の当日書き込み一覧）`
  - 変更後: `指定レスに草を生やす`（config/commands.yaml の正本に一致）

### テスト結果サマリー
- `npx vitest run`: 72ファイル / 1535テスト 全PASS
- `npx playwright test --project=api`: 29/29 全PASS
