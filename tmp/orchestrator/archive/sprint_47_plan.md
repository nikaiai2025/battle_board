# Sprint-47 計画書: 統合テスト基本CRUDカバレッジ + CI自動マイグレーション

> 作成日: 2026-03-17
> ステータス: completed

## 背景

2026-03-17本番障害の再発防止策（残り2件）:
1. 統合テストに基本CRUDを追加し、DBスキーマ動作不整合を検知する
2. CIでマイグレーションを自動適用し、コードとDBのタイムラグを解消する

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-136 | bdd-coding | 統合テスト基本CRUDシナリオ追加 | なし | completed |
| TASK-137 | bdd-coding | CI自動マイグレーション（GitHub Actions） | なし | completed |

## 結果

### TASK-136 (bdd-coding) — completed

- 方針A（統合テスト専用ステップ）を採用
- `features/integration/crud.feature` 新規作成（3シナリオ: スレッド作成、レス書き込み、一覧取得）
- `features/step_definitions/integration-setup.steps.ts` 新規作成（サービス層経由のデータセットアップ）
- `cucumber.js` integrationプロファイル更新
- テスト結果:
  - integration: 7 scenarios / 30 steps PASS（4→7に拡大）
  - default: 221 passed, 7 pending（影響なし）
  - vitest: 1141 PASS

### TASK-137 (bdd-coding)
<!-- 完了後に記入 -->

## 判定
<!-- 全タスク完了後に記入 -->
