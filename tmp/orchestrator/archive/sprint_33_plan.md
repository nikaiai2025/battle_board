# Sprint-33 計画書

> 作成日: 2026-03-16
> ステータス: completed

## 目的

2ストリーム並行: (A) Bot system v5 実装（設計完了済み → DB基盤 → サービス → BDD）、(B) user_registration.feature のBDDステップ定義

## 背景

- Bot v5設計はSprint-31/32で完了。DBマイグレーション・サービス・ハンドラ・BDDの順で実装する
- user_registration機能はSprint-30〜32でAPI/UI/専ブラ統合が完了済み。featureファイルが未実装/にあるためBDDステップ定義を作成する
- bot_system.featureも未実装/にあるため、実装完了後にBDDステップ定義を作成する

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-094 | Bot v5 DB基盤: マイグレーション + ドメインモデル + リポジトリ + bot_profiles.yaml | bdd-coding | なし | completed |
| TASK-095 | Bot v5 サービス層: BotService拡張 + AttackHandler + CommandService統合 | bdd-coding | TASK-094 | completed |
| TASK-096 | bot_system.feature BDDステップ定義 | bdd-coding | TASK-095 | completed |
| TASK-097 | user_registration.feature BDDステップ定義 | bdd-coding | なし | completed |

## locked_files 競合マトリクス

- TASK-094: DB/リポジトリ/ドメイン層 → TASK-097と重複なし → **並行可能**
- TASK-095: サービス層 → TASK-094完了後 → **直列**
- TASK-096: BDDステップ → TASK-095完了後 → **直列**
- TASK-097: BDDステップ(user_registration) → 独立 → **TASK-094と並行可能**

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-094 | completed | 889テスト全PASS(31ファイル)、BDD回帰なし。マイグレーション+モデル+リポジトリ+bot_profiles.yaml+インメモリモック完了 |
| TASK-095 | completed | 950テスト全PASS(34ファイル)。BotService+AttackHandler+CommandService統合+elimination-reward純粋関数。skipDebit機構追加 |
| TASK-096 | completed | 27シナリオ(18 passed, 9 pending UI/GHA)。3回ワーカーでバグ修正完了。0 failed達成 |
| TASK-097 | completed | 27シナリオ(24 passed, 2 pending Discord OAuth, 1 escalation→resolved)。mypage課金ガード実装済み。vitest 950 PASS |

## 最終テスト結果
- vitest: 34ファイル / 950テスト / 全PASS
- cucumber-js: 190シナリオ (0 failed, 2 undefined, 9 pending, 179 passed)
  - 2 undefined: mypage草カウント（次スプリントスコープ）
  - 9 pending: bot_system UI/GitHub Actions（インフラ依存、想定通り）
  - 0 failed

## エスカレーション

- ESC-TASK-097-1: mypage課金ガード仕様衝突 → オーケストレーター自律解決（選択肢A採用）。mypage-service + mypage.steps修正で0 failed達成
