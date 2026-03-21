---
task_id: TASK-256
sprint_id: Sprint-86
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T23:30:00+09:00
updated_at: 2026-03-21T23:30:00+09:00
locked_files:
  - docs/specs/currency_state_transitions.yaml
  - docs/specs/bot_state_transitions.yaml
  - docs/architecture/components/posting.md
  - docs/architecture/components/currency.md
---

## タスク概要

Phase 5検証で検出されたHIGH 2件 + MEDIUM 2件のドキュメント不整合を修正する。
全てBDD（正本）→D-05/D-08への下流伝播修正であり、コード変更は不要。

## 修正内容

### HIGH-1: D-05 currency_state_transitions.yaml — initial_balance修正

`docs/specs/currency_state_transitions.yaml` の `initial_balance` セクション:
- `value: 50` → `value: 0`
- description: 「新規ユーザー登録時に初期通貨 50 が付与される」→ 「新規ユーザー登録時の初期通貨は0。初回書き込み時にwelcome_bonusとして+50が付与される」
- `feature_ref` のリンク先を正しいシナリオ名に修正
- 参考: `features/currency.feature`（初回書き込みボーナスシナリオ）

### HIGH-2: D-05 bot_state_transitions.yaml — チュートリアルBOT除外

`docs/specs/bot_state_transitions.yaml` の `eliminated -> lurking` 遷移:
- guard に `bot_profile_key != 'tutorial'` 条件を追加
- 説明: チュートリアルBOTは日次リセットで復活せず、削除される
- 参考: `features/welcome.feature` @チュートリアルBOTは日次リセットで復活しない

### MEDIUM-3: D-08 posting.md — 依存先追記

`docs/architecture/components/posting.md` の依存先テーブル(3.1)に以下を追加:
- `CurrencyService` — ウェルカムシーケンス Step 6.5 で welcome_bonus 付与に使用
- `PendingTutorialRepository` — ウェルカムシーケンス Step 6.5 で pending_tutorials 登録に使用

### MEDIUM-4: D-08 currency.md — 被依存追記

`docs/architecture/components/currency.md` の被依存テーブル(3.2)に以下を追加:
- `PostService` — welcome_bonus で CurrencyService.credit() を呼び出す

## 完了条件
- [ ] 4件の修正が全て完了
- [ ] 修正内容が実装コード・BDDシナリオと一致

## スコープ外
- プロダクションコード変更
- BDDシナリオ変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 4件全て
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. **HIGH-1** `docs/specs/currency_state_transitions.yaml`
   - `initial_balance.value`: 50 → 0
   - `initial_balance.description`: 「初期通貨 50 が付与される」→「初期通貨は0。初回書き込み時にwelcome_bonusとして+50が付与される」
   - `initial_balance.feature_ref`: `currency.feature#新規ユーザー登録時の通貨残高は 0 である`（BDDシナリオ名と一致）

2. **HIGH-2** `docs/specs/bot_state_transitions.yaml`
   - `eliminated -> lurking` 遷移の `guard` に `bot_profile_key != 'tutorial'` 条件を追加
   - `description` にチュートリアルBOTは復活しない旨を追記
   - `daily_reset.operations` の eliminated 復活処理にチュートリアルBOT除外条件とクリーンアップ処理を追記
   - welcome.feature のシナリオ「チュートリアルBOTは日次リセットで復活しない」と整合

3. **MEDIUM-3** `docs/architecture/components/posting.md`
   - 依存先テーブル(3.1)に `CurrencyService`（Step 6.5 welcome_bonus付与）を追加
   - 依存先テーブル(3.1)に `PendingTutorialRepository`（Step 6.5 pending_tutorials登録）を追加

4. **MEDIUM-4** `docs/architecture/components/currency.md`
   - 被依存テーブル(3.2)に `PostService`（welcome_bonus: 初回書き込み時 +50）を追加

### テスト結果サマリー
ドキュメント修正のみのタスクのため、テスト実行なし。
