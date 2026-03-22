---
task_id: TASK-267
sprint_id: Sprint-95
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T23:00:00+09:00
updated_at: 2026-03-22T23:00:00+09:00
locked_files:
  - scripts/upsert-pinned-thread.ts
  - src/__tests__/scripts/upsert-pinned-thread.test.ts
---

## タスク概要

固定案内板の【リンク】セクションで `/mypage` `/dev/` がパス文字列のまま表示されており、クリック不可。フルURL（`https://battleboard.vercel.app/mypage` 等）に変更することで、Web版では `parsePostBody` が自動リンク化し、専ブラではURL自動検出でリンクになる。

## 修正内容

`scripts/upsert-pinned-thread.ts` の `generateAnnouncementBody` 関数内、【リンク】セクション:

```typescript
// Before:
"  マイページ: /mypage",
"  開発連絡板: /dev/",

// After:
"  マイページ: https://battleboard.vercel.app/mypage",
"  開発連絡板: https://battleboard.vercel.app/dev/",
```

## 完了条件

- [ ] リンクがフルURLで記述されている
- [ ] `npx vitest run` 全テストPASS
- [ ] 既存のupsert-pinned-thread関連テストがあれば整合性確認

## スコープ外

- PostItem.tsx のURL検出ロジック変更（既にフルURL自動リンク機能あり）
- スクリプトの再実行（GitHub Actions "Seed Pinned Thread" が次回pushで自動実行）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: リンクをフルURLに修正、全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `scripts/upsert-pinned-thread.ts` 112-113行目のリンクをフルURLに修正
  - `/mypage` → `https://battleboard.vercel.app/mypage`
  - `/dev/` → `https://battleboard.vercel.app/dev/`
- `src/__tests__/scripts/upsert-pinned-thread.test.ts` は存在しないことを確認（テストファイルは locked_files に含まれているが、今回の変更に対して既存テストへの影響なし）

### テスト結果サマリー

- `npx vitest run`: 82 test files passed, 1675 tests passed（FAILなし）
