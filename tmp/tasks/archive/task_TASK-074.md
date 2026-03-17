---
task_id: TASK-074
sprint_id: Sprint-25
status: completed
assigned_to: bdd-coding
depends_on: [TASK-072]
created_at: 2026-03-16T18:30:00+09:00
updated_at: 2026-03-16T18:30:00+09:00
locked_files:
  - src/lib/services/__tests__/admin-service.test.ts
---

## タスク概要

TASK-072でadmin-service.tsのフォールバックメッセージ形式を変更したが、対応する単体テストファイルadmin-service.test.tsの期待値が未更新のため2件失敗している。テスト期待値を新しい形式に合わせて修正する。

## 失敗内容

2件とも `deletePost > システムレス挿入` のテスト:

1. **commentが指定された場合** — 期待値 body が旧形式。新形式: `🗑️ {comment}`
2. **commentが未指定の場合** — 期待値 body が `管理者によりレスが削除されました`。新形式: `🗑️ レス >>{postNumber} は管理者により削除されました`

## 必読ドキュメント

1. [必須] `src/lib/services/__tests__/admin-service.test.ts` — 修正対象
2. [参考] `src/lib/services/admin-service.ts` — 修正済みの実装（TASK-072で変更）

## 完了条件

- [ ] `npx vitest run src/lib/services/__tests__/admin-service.test.ts` 全PASS
- [ ] `npx vitest run` 全PASS（672テスト）

## スコープ外

- admin-service.ts自体の変更
- BDDステップ定義の変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 2件の期待値修正 + 全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `admin-service.test.ts` 275行目: comment指定時の期待値を `スパム投稿のため削除` → `🗑️ スパム投稿のため削除` に修正
- `admin-service.test.ts` 305行目: フォールバックの期待値を `管理者によりレスが削除されました` → `🗑️ レス >>5 は管理者により削除されました` に修正（postNumberのデフォルト値5を使用）

### テスト結果サマリー

- admin-service.test.ts: 26テスト PASS
- 全体: 672テスト PASS (20ファイル)
