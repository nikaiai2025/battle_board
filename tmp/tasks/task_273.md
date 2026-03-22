---
task_id: TASK-273
sprint_id: Sprint-98
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T22:00:00+09:00
updated_at: 2026-03-22T22:00:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - docs/architecture/components/command.md
---

## タスク概要

Phase 5 検証で検出された HIGH 指摘3件の修正。コード修正1件（processAoriCommands のエラー時 pending 未削除）+ ドキュメント修正2件（D-08 command.md の矛盾修正）。

## 修正内容

### 1. Code HIGH-1: processAoriCommands エラー時 pending 未削除

**ファイル**: `src/lib/services/bot-service.ts` の `processAoriCommands()`

**問題**: catch ブロックで pending レコードが削除されない。Cron 実行のたびに同一の失敗 pending が無限に再処理される。

**修正方針**: `newspaper-service.ts` の processNewspaperCommands() と同じ防御パターンを適用する。catch ブロック内で `deletePendingAsyncCommand(pending.id)` を呼び出す（try-catch で囲む）。

**参考**: `src/lib/services/newspaper-service.ts` の L186-198（エラー時 pending 削除パターン）

### 2. Doc HIGH-1: D-08 stealth記述矛盾

**ファイル**: `docs/architecture/components/command.md`

**問題**: フィールド定義表の注記に「Phase 2ではすべてfalse」とあるが、!iamsystem (stealth:true) / !aori (stealth:true) と矛盾。

**修正方針**: 時限的な注釈「Phase 2ではすべてfalse」を削除する。§5でステルスの設計原則を詳述しているため、フィールド定義表にはステルスの意味の説明のみ残す。

### 3. Doc HIGH-2: D-08 tellコスト乖離

**ファイル**: `docs/architecture/components/command.md`

**問題**: サンプルYAMLの tell cost が 50 だが、正本 `config/commands.yaml` では 10。

**修正方針**: サンプルYAMLの cost を 10 に修正する。サンプルの目的はフォーマット例示であり、値は正本と一致させる。

## 必読ドキュメント
1. [必須] `src/lib/services/bot-service.ts` — processAoriCommands の catch ブロック
2. [必須] `src/lib/services/newspaper-service.ts` — エラー時 pending 削除パターン（参考）
3. [必須] `docs/architecture/components/command.md` — 修正対象箇所
4. [参考] `tmp/workers/bdd-architect_P5-DC/doublecheck.md` — ダブルチェック結果

## 完了条件
- [ ] bot-service.ts processAoriCommands の catch ブロックに pending 削除を追加
- [ ] command.md の stealth 注記矛盾を修正
- [ ] command.md のサンプルYAML tell cost を修正
- [ ] 単体テスト全件PASS（`npx vitest run`）
- [ ] BDDテスト既存シナリオに回帰なし（`npx cucumber-js`）

## スコープ外
- MEDIUM 以下の指摘（将来スプリントで対応）
- BDDシナリオの変更
- locked_files 外のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3件の修正 + 単体テスト・BDDテスト確認
- 次にすべきこと: なし

### 進捗ログ

1. bot-service.ts の processAoriCommands catch ブロック（1120行付近）に pending 削除を追加
   - newspaper-service.ts の Step 6 パターン（L189-198）と同一実装
   - `this.pendingAsyncCommandRepository!.deletePendingAsyncCommand(pending.id)` を try-catch で囲んで追加
2. command.md の stealth フィールド説明から「Phase 2ではすべてfalse」を削除し、§5参照リンクに変更
3. command.md のサンプルYAML tell cost: 50 → 10 に修正（config/commands.yaml の正本値に合わせる）

### テスト結果サマリー

**単体テスト（npx vitest run）**
- テストファイル: 1 failed / 84 passed（計85）
- テストケース: 1 failed / 1724 passed（計1725）
- 失敗の内容: `schema-consistency.test.ts` の「pending_async_commands テーブルが OpenAPI スキーマに未登録」
  - これは今回の修正前から既存の失敗（Sprint-97時点から継続）であり、今回の修正による回帰ではないことをスタッシュ検証で確認済み

**BDDテスト（npx cucumber-js）**
- 313 scenarios (16 pending, 297 passed)
- 1661 steps (16 pending, 37 skipped, 1608 passed)
- FAIL: 0件。今回の修正による回帰なし
