# Sprint-80 計画書

> 作成日: 2026-03-22

## 目標
フェーズ5検証で検出されたHIGH指摘5件 + APIテスト失敗3件を修正する差し戻しスプリント。

## 背景
Sprint-79完了後のフェーズ5検証で以下が検出された:
- bdd-gate: APIテスト3件FAIL（既存問題）
- bdd-code-reviewer: HIGH 2件（コード品質）
- bdd-doc-reviewer: HIGH 3件（D-06陳腐化）
- bdd-architect ダブルチェック: 全8件妥当、誤検知なし

## タスク分解

| TASK_ID | 担当 | 内容 | locked_files |
|---|---|---|---|
| TASK-226 | bdd-coding | コード修正6件（テスト修正 + hissi-handler + attack-handler + CreditReason型） | auth-cookie.spec.ts, senbra-compat.spec.ts, hissi-handler.ts, attack-handler.ts, currency.ts |
| TASK-227 | bdd-coding | D-06 thread-view.yaml 3箇所修正 | docs/specs/screens/thread-view.yaml |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-226 | completed | コード修正6件、vitest 1535 PASS、tsc 0エラー |
| TASK-227 | completed | D-06 thread-view.yaml 3箇所修正、YAML構文PASS |

## テスト結果
- vitest: 72ファイル / 1535テスト / 全PASS
- tsc: 0エラー
- APIテスト: TASK-226でauth-cookie + senbra-compat修正済み（コミット後に再検証）
