---
task_id: TASK-021
sprint_id: Sprint-9
status: completed
assigned_to: bdd-coding
depends_on: [TASK-020]
created_at: 2026-03-13T11:00:00+09:00
updated_at: 2026-03-13T11:00:00+09:00
locked_files:
  - "[NEW] features/step_definitions/admin.steps.ts"
  - "features/step_definitions/authentication.steps.ts"
  - "features/support/mock-installer.ts"
  - "features/support/register-mocks.js"
  - "features/support/hooks.ts"
  - "features/support/world.ts"
  - "cucumber.js"
---

## タスク概要

admin.featureの全4シナリオとauthentication.featureの管理者シナリオ2件のBDDステップ定義を実装する。TASK-020で実装されたAdminServiceとadmin-user-repositoryをBDDテスト基盤に統合し、インメモリモックを接続する。cucumber.jsの除外フィルタを更新してこれらのシナリオを実行対象に含める。

## 対象BDDシナリオ

- `features/phase1/admin.feature` — 全4シナリオ
  - 管理者が指定したレスを削除する
  - 管理者でないユーザーがレス削除を試みると権限エラーになる
  - 管理者が指定したスレッドを削除する
  - 存在しないレスの削除を試みるとエラーになる
- `features/phase1/authentication.feature` — 管理者シナリオ2件
  - 管理者が正しいメールアドレスとパスワードでログインする
  - 管理者が誤ったパスワードでログインすると失敗する

## 必読ドキュメント（優先度順）

1. [必須] `features/phase1/admin.feature` — 管理者機能シナリオ
2. [必須] `features/phase1/authentication.feature` — 管理者認証シナリオ（末尾2件）
3. [必須] `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略（D-10）
4. [必須] `src/lib/services/admin-service.ts` — TASK-020で実装されたAdminService
5. [必須] `src/lib/infrastructure/repositories/admin-user-repository.ts` — TASK-020で実装された管理者リポジトリ
6. [必須] `features/support/in-memory/admin-repository.ts` — TASK-020で作成されたインメモリ実装
7. [参考] `features/step_definitions/common.steps.ts` — 共通ステップの実装パターン
8. [参考] `features/support/register-mocks.js` — モジュール差し替え機構
9. [参考] `features/support/mock-installer.ts` — モック管理

## 入力（前工程の成果物）

- `src/lib/services/admin-service.ts` — AdminService（TASK-020）
- `src/lib/infrastructure/repositories/admin-user-repository.ts` — 管理者リポジトリ（TASK-020）
- `features/support/in-memory/admin-repository.ts` — インメモリ実装（TASK-020）

## 出力（生成すべきファイル）

- `features/step_definitions/admin.steps.ts` — admin.featureのステップ定義（新規）
- `features/step_definitions/authentication.steps.ts` — 管理者シナリオ分の追記（既存更新）

## 完了条件

- [ ] admin.feature 全4シナリオがPASS
- [ ] authentication.feature 管理者シナリオ2件がPASS
- [ ] cucumber.jsのpathsにadmin.featureが追加されている
- [ ] cucumber.jsのnameフィルタから管理者シナリオ除外が削除されている
- [ ] 既存56シナリオが壊れていないこと
- [ ] テストコマンド: `npx cucumber-js`
- [ ] 単体テスト: `npx vitest run` も全PASS維持

## スコープ外

- 管理者UI（`src/app/(web)/admin/`）の実装
- specialist_browser_compat.feature のBDDステップ定義（TASK-024で実施）
- Step 9関連のすべてのファイル

## 補足・制約

- admin-repositoryのインメモリ実装をregister-mocks.jsとmock-installer.tsに統合する必要がある。既存のモック登録パターンに従うこと
- World に管理者コンテキスト（adminId, adminSession等）を追加する必要がある場合はworld.tsを更新すること
- D-10 §5に従い、時刻依存テストがある場合は時計凍結パターンを使用すること
- locked_files外のファイルを変更する必要が生じた場合はエスカレーションすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: ESC-TASK-021-1（thread.steps.tsの`>>1`リテラルステップとの競合問題を報告済み。選択肢Bで回避実装済み）

### 進捗ログ
- [完了] 必読ドキュメント・既存BDDインフラ・in-memoryリポジトリ群の読み込み
- [完了] register-mocks.js に admin-user-repository のモック登録を追加
- [完了] mock-installer.ts に InMemoryAdminRepo を統合（インポート・resetAllStores・エクスポート）
- [完了] world.ts に管理者コンテキスト（currentAdminId, isAdmin, adminSessionToken, lastDeleted*）を追加
- [完了] features/step_definitions/admin.steps.ts を新規作成（admin.feature 全4シナリオ対応）
- [完了] authentication.steps.ts に管理者ログインシナリオ2件のステップ追記
- [完了] cucumber.js に admin.feature を追加、管理者シナリオの除外フィルタを削除
- [問題発生→回避] admin.steps.ts の汎用`>>{int}`パターンが thread.steps.ts の`>>1`リテラルと Ambiguous 競合 → 固定リテラルステップ（>>5, >>999）で回避実装（ESC-TASK-021-1 起票済み）

### テスト結果サマリー
#### BDDテスト（npx cucumber-js）
- 62 scenarios passed / 0 failed
  - admin.feature: 4シナリオ PASS
  - authentication.feature 管理者シナリオ: 2件 PASS
  - 既存56シナリオ: 全 PASS
- 329 steps passed

#### 単体テスト（npx vitest run）
- 14 test files passed
- 436 tests passed / 0 failed
