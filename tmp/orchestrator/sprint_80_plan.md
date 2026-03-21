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
- 本番スモーク: 30/35 PASS（5 skip）
- コミット: 288da80

## フェーズ5再検証結果

| TASK_ID | エージェント | 結果 | 備考 |
|---|---|---|---|
| TASK-228 | bdd-gate | **FAIL** | senbra-compat 18件失敗（grass_reactions FK制約違反） |
| TASK-229 | bdd-code-reviewer | APPROVE | HIGH 0件、LOW 2件のみ |
| TASK-230 | bdd-doc-reviewer | APPROVE | HIGH 0件、MEDIUM 1件（!w説明文不一致） |
| TASK-231 | bdd-test-auditor | APPROVE | HIGH 0件、MEDIUM 1件（継続） |

→ Sprint-81で修正
