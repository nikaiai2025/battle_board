---
task_id: TASK-106
sprint_id: Sprint-36
status: completed
assigned_to: bdd-coding
depends_on: [TASK-105]
created_at: 2026-03-17T22:00:00+09:00
updated_at: 2026-03-17T22:00:00+09:00
locked_files:
  - "features/admin.feature"
  - "features/step_definitions/admin.steps.ts"
  - "src/lib/domain/models/currency.ts"
  - "[NEW] src/app/api/admin/users/[userId]/currency/route.ts"
---

## タスク概要

管理者による通貨付与機能を実装する。admin.featureに通貨付与2シナリオを追加し、CreditReason拡張・管理者API・BDDステップ定義を実装する。

設計方針は `tmp/feature_plan_admin_expansion.md` §3に記載済み（人間承認済み）。

## 対象BDDシナリオ
- `features/admin.feature` — 通貨付与2シナリオを新規追加

## 必読ドキュメント（優先度順）
1. [必須] `tmp/feature_plan_admin_expansion.md` — 機能計画書（§3 通貨付与、§1-b シナリオ案）
2. [必須] `features/admin.feature` — 管理者シナリオ（TASK-105でBAN追加済みの状態に追記）
3. [必須] `features/step_definitions/admin.steps.ts` — ステップ定義（TASK-105でBAN追加済み）
4. [必須] `src/lib/domain/models/currency.ts` — CreditReason型（admin_grant追加先）
5. [必須] `src/lib/services/currency-service.ts` — CurrencyService.credit（呼び出し先）
6. [参考] `features/support/world.ts` — BDD World定義

## 出力（生成すべきファイル）

1. `features/admin.feature` — 通貨付与2シナリオ追加（計画書§1-bのシナリオ案に従う）:
   - 管理者が指定ユーザーに通貨を付与する
   - 管理者でないユーザーが通貨付与を試みると権限エラーになる
2. `src/lib/domain/models/currency.ts` — CreditReasonに `admin_grant` 追加
3. `src/app/api/admin/users/[userId]/currency/route.ts` — POST（通貨付与API）
4. `features/step_definitions/admin.steps.ts` — 通貨付与ステップ定義追加

## 完了条件
- [ ] admin.feature 通貨付与2シナリオ全PASS
- [ ] CurrencyService.credit が admin_grant reason で呼ばれる
- [ ] 管理者認証チェック（admin_session Cookie検証）
- [ ] 既存テスト全PASS（回帰なし）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 0 failed
- [ ] テストコマンド: `npx vitest run` + `npx cucumber-js`

## スコープ外
- BAN機能（TASK-105で実装済み）
- ユーザー管理UI（Sprint-37）
- ダッシュボード（Sprint-37）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント読み込み完了。TASK-105でBAN関連シナリオ済み確認
- [設計確認] CurrencyService.credit(userId, amount, CreditReason)が呼び出し先。admin_grantをCreditReasonに追加
- [設計確認] BDDはサービス層テスト（APIルートは経由しない）。grantCurrencyをadmin-serviceに追加
- [実装完了] admin.feature に通貨付与2シナリオ追加
- [実装完了] currency.ts に admin_grant 追加
- [実装完了] admin-service.ts に grantCurrency 関数追加（currency-service.credit + getBalance を使用）
- [実装完了] src/app/api/admin/users/[userId]/currency/route.ts 新規作成
- [実装完了] admin.steps.ts に通貨付与ステップ定義追加（衝突解決: incentive.steps.tsの既存ステップを再利用）
- [修正] admin-service.test.ts に currency-service モック追加（Supabase依存回避）

### テスト結果サマリー
- npx vitest run: 38 suites, 1032 tests, 0 failed (PASS)
- npx cucumber-js: 223 scenarios (9 pending, 214 passed, 0 failed)
- admin.feature 通貨付与シナリオ: 2/2 PASS
  - 管理者が指定ユーザーに通貨を付与する: PASS
  - 管理者でないユーザーが通貨付与を試みると権限エラーになる: PASS
- 既存BAN関連シナリオ: 全PASS（回帰なし）
