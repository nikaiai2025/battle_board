# Sprint-81 計画書

> 作成日: 2026-03-22

## 目標
Sprint-80再検証で検出されたゲートFAIL1件 + ドキュメントMEDIUM1件を修正する差し戻しスプリント。

## 背景
Sprint-80再検証（フェーズ5）で以下が検出された:
- bdd-gate: senbra-compat APIテスト18件FAIL（cleanupDatabaseにgrass_reactions削除が未実装）
- bdd-doc-reviewer: MEDIUM-005（D-06 !w説明文が正本と不一致）

## タスク分解

| TASK_ID | 担当 | 内容 | locked_files |
|---|---|---|---|
| TASK-232 | bdd-coding | senbra-compat cleanupDatabase修正 + D-06 !w説明文修正 | e2e/api/senbra-compat.spec.ts, docs/specs/screens/thread-view.yaml |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-232 | completed | cleanupDatabase FK制約修正（4テーブル追加）+ !w説明文修正。vitest 1535 PASS、API 29/29 PASS |

## テスト結果
- vitest: 72ファイル / 1535テスト / 全PASS
- playwright API: 29/29 全PASS
- 本番スモーク: 30/35 PASS（5 skip）
- コミット: a54a86c
