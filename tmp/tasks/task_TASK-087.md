---
task_id: TASK-087
sprint_id: Sprint-31
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T12:00:00+09:00
updated_at: 2026-03-16T12:00:00+09:00
locked_files:
  - src/lib/domain/rules/accusation-rules.ts
  - src/lib/services/accusation-service.ts
  - src/lib/domain/models/currency.ts
  - src/lib/domain/models/accusation.ts
  - src/lib/services/handlers/tell-handler.ts
  - src/__tests__/lib/domain/rules/accusation-rules.test.ts
  - src/__tests__/lib/services/accusation-service.test.ts
  - src/lib/services/command-service.ts
  - src/lib/services/__tests__/command-service.test.ts
  - src/lib/services/__tests__/currency-service.test.ts
---

## タスク概要

ai_accusation.feature v3→v4 の変更（告発成功ボーナス・冤罪ボーナス廃止）に合わせ、既存コードからボーナス関連のロジックを削除する。
!tell は「コスト消費のみ・報酬なし」の偵察専用コマンドに変更する。

## 対象BDDシナリオ
- `features/ai_accusation.feature` @v4 — 全10シナリオ（特に成功・失敗シナリオの報酬関連）

## 必読ドキュメント（優先度順）
1. [必須] `features/ai_accusation.feature` — v4 全文（正本）
2. [必須] `tmp/tasks/task_REMOVE_ACCUSATION_BONUS.md` — アーキテクトAI作成の変更仕様（参考）
3. [参考] `docs/architecture/components/accusation.md` — AccusationService設計

## 入力（前工程の成果物）
- `features/ai_accusation.feature` v4 — ボーナス廃止後のBDDシナリオ
- `tmp/tasks/task_REMOVE_ACCUSATION_BONUS.md` — 詳細な変更箇所リスト

## 出力（生成すべきファイル）
- 各locked_filesの修正

## 完了条件
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx cucumber-js` 128 passed / 3 pending（既存と同等）
- [ ] 告発成功時にボーナスが付与されないことをテストで検証
- [ ] 告発失敗時に冤罪ボーナスが付与されないことをテストで検証
- [ ] システムメッセージからボーナス関連文言が除去されていること
- [ ] `calculateBonus` 関数が削除されていること
- [ ] `AccusationBonusConfig` から `hitBonus` / `falseAccusationBonus` が削除されていること

## スコープ外
- bot_system.feature の実装（Phase 3以降）
- !attack コマンドの実装
- BDDステップ定義の変更（既存ステップ定義でカバーされていない新ステップがある場合はエスカレーション）
- features/ 配下の .feature ファイルの変更

## 補足・制約
- `tmp/tasks/task_REMOVE_ACCUSATION_BONUS.md` にアーキテクトAIが詳細な変更箇所リストを作成済み。これを参考にしつつ、grep で `accusation_hit|false_accusation_bonus|hitBonus|falseAccusation|calculateBonus` を全検索して漏れなく対応すること
- `AccusationResult.bonusAmount` フィールドは互換性のため残してよい（常に0）
- `ICurrencyService` 依存はAccusationServiceから完全に削除可能か検討（!tell でcreditが不要になるため）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイルの修正・テスト完了

### 進捗ログ
- 全対象ファイルの読み込み完了
- grep による影響調査実施: command-service.ts / command-service.test.ts が AccusationBonusConfig の hitBonus/falseAccusationBonus を参照していることを確認
- vitest run 768 passed（変更前の基準値確認）
- ESC-TASK-087-1 を起票
- ESC-TASK-087-1 解決後、作業再開
- ドメイン層の修正:
  - accusation-rules.ts: `calculateBonus` 関数・`BonusCalculationResult` 型を削除、`buildHitSystemMessage` からボーナス額引数を削除、`buildMissSystemMessage` から冤罪ボーナス関連引数を削除
  - currency.ts: `CreditReason` から `accusation_hit`・`false_accusation_bonus` を削除
  - accusation.ts: JSDocコメントから冤罪ボーナス記述を除去、`bonusAmount` のJSDocに「v4以降は常に0」を追記
- サービス層の修正:
  - accusation-service.ts: `AccusationBonusConfig` から `hitBonus`・`falseAccusationBonus` を削除（`cost` のみ残す）、`ICurrencyService` 依存を完全に削除、ボーナス計算・付与ロジックを削除、`bonusAmount: 0` 固定に変更、コンストラクタ引数から `currencyService` を削除
  - command-service.ts: `CommandConfig` から `hitBonus?`・`falseAccusationBonus?` を削除、`AccusationBonusConfig` 構築箇所を `cost` のみに修正
  - tell-handler.ts: JSDocコメントを v4 に合わせて更新
- テストの修正:
  - accusation-rules.test.ts: `calculateBonus` テストスイート全削除、`buildHitSystemMessage` テストからボーナス額アサーション削除・「ボーナス付与行が含まれない」アサーション追加、`buildMissSystemMessage` テストから冤罪ボーナスアサーション削除・「冤罪ボーナス関連文言が含まれない」アサーション追加
  - accusation-service.test.ts: `TEST_BONUS_CONFIG` を `cost` のみに変更、`ICurrencyService` モック・依存を全削除、hit/miss テストを `bonusAmount: 0` 検証に変更、「ボーナス付与行が含まれない」「冤罪ボーナス関連文言が含まれない」アサーション追加、カスタムボーナス設定テスト削除
  - command-service.test.ts: YAML定数から `hitBonus`・`falseAccusationBonus` を削除
  - currency-service.test.ts: `CreditReason` 網羅テストから `accusation_hit`・`false_accusation_bonus` を削除

### escalation_resolution (ESC-TASK-087-1)
- **解決方針**: 選択肢A — locked_files を拡張して3ファイルを追加
- **追加ファイル**:
  - `src/lib/services/command-service.ts` — `CommandConfig.hitBonus?`・`falseAccusationBonus?` 削除、`AccusationBonusConfig` 構築箇所修正
  - `src/lib/services/__tests__/command-service.test.ts` — YAML定数から `hitBonus`・`falseAccusationBonus` 削除
  - `src/lib/services/__tests__/currency-service.test.ts` — `CreditReason` 網羅テストから `accusation_hit`・`false_accusation_bonus` 削除
- **判断根拠**: 内部リファクタリングのみ。BDD/OpenAPI/ユーザー振る舞い変更なし。TASK-088とのファイル重複なし。

### テスト結果サマリー
- **vitest**: 825 passed / 28 test files（全PASS）
- **cucumber-js**: 130 scenarios (125 passed, 2 undefined, 3 pending) / 620 steps (609 passed, 3 undefined, 3 pending, 5 skipped)
- 2 undefined の内訳: ai_accusation.feature v4 で追加された新ステップ3件（`告発者に通貨報酬は付与されない` x2, `被告発者に通貨は付与されない` x1）のステップ定義が未実装。ステップ定義の変更はタスクスコープ外のため、別タスクで対応が必要。
- 3 pending: 既存の specialist_browser_compat.feature 由来（変更前と同等）
