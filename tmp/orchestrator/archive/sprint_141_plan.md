---
sprint_id: Sprint-141
status: completed
created_at: 2026-03-29
---

# Sprint-141 計画書 — 開発連絡板 BDD ステップ定義

## 背景・目的

`features/dev_board.feature`（承認済み v2）に6シナリオが定義されているが、
ステップ定義が存在せず全て undefined。バックエンド実装（Service + Repository + API Route + Page）は既に完了済み。
InMemory DevPostRepository と BDD ステップ定義を追加し、全6シナリオを PASS にする。

## スコープ

| TASK_ID | 担当 | 内容 | ステータス | depends_on |
|---------|------|------|-----------|------------|
| TASK-363 | bdd-coding | InMemory DevPostRepository + BDD ステップ定義（全6シナリオ） | assigned | - |

## locked_files

### TASK-363
- `[NEW] features/step_definitions/dev_board.steps.ts`
- `[NEW] features/support/in-memory/dev-post-repository.ts`
- `features/support/world.ts`

## 完了条件

- `npx cucumber-js features/dev_board.feature` 全6シナリオ PASS
- `npx vitest run` 回帰なし
- `npx cucumber-js` 既存 PASS 数維持（389 passed）+ 6シナリオ追加

## 結果

| TASK_ID | 結果 | 備考 |
|---------|------|------|
| TASK-363 | completed | InMemory DevPostRepository + BDD ステップ定義6件。register-mocks.js キャッシュ差し込み方式。395 passed (+6) |
