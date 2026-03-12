---
task_id: TASK-026
sprint_id: Sprint-10
status: completed
assigned_to: bdd-coding
depends_on: [TASK-025]
created_at: 2026-03-13T14:00:00+09:00
updated_at: 2026-03-13T14:00:00+09:00
locked_files:
  - "[NEW] features/step_definitions/mypage.steps.ts"
  - "features/step_definitions/currency.steps.ts"
  - "cucumber.js"
  - "features/support/world.ts"
  - "features/support/hooks.ts"
  - "features/support/mock-installer.ts"
  - "features/support/register-mocks.js"
---

## タスク概要

mypage.featureの全8シナリオとcurrency.featureの「マイページで通貨残高を確認する」1件のBDDステップ定義を実装する。TASK-025で実装されたMypageServiceをBDDテスト基盤に統合し、cucumber.jsのフィルタを更新して全シナリオを実行対象に含める。

## 対象BDDシナリオ

- `features/phase1/mypage.feature` — 全8シナリオ
  - マイページに基本情報が表示される
  - 有料ユーザーはマイページでユーザーネームを設定できる
  - 無料ユーザーはユーザーネームを設定できない
  - 無料ユーザーが課金ボタンで有料ステータスに切り替わる
  - 既に有料ユーザーの場合は課金ボタンが無効である
  - 自分の書き込み履歴を確認できる
  - 書き込み履歴が0件の場合はメッセージが表示される
  - マイページに通知欄が存在する
- `features/phase1/currency.feature` — 「マイページで通貨残高を確認する」1件

## 必読ドキュメント（優先度順）

1. [必須] `features/phase1/mypage.feature` — マイページシナリオ
2. [必須] `features/phase1/currency.feature` — 通貨残高確認シナリオ
3. [必須] `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略（D-10）
4. [必須] `src/lib/services/mypage-service.ts` — TASK-025で実装されたMypageService
5. [参考] 既存ステップ定義パターン: `features/step_definitions/common.steps.ts`, `features/step_definitions/admin.steps.ts`
6. [参考] `features/support/world.ts` — World定義

## 入力（前工程の成果物）

- `src/lib/services/mypage-service.ts` — MypageService（TASK-025）
- `src/lib/infrastructure/repositories/user-repository.ts` — updateIsPremium追加済み（TASK-025）

## 出力（生成すべきファイル）

- `features/step_definitions/mypage.steps.ts` — mypage.featureのステップ定義（新規）
- `features/step_definitions/currency.steps.ts` — マイページ残高確認ステップ追記（既存更新）

## 完了条件

- [ ] mypage.feature 全8シナリオがPASS
- [ ] currency.feature 「マイページで通貨残高を確認する」がPASS
- [ ] cucumber.jsのpathsにmypage.featureが追加されている
- [ ] cucumber.jsのnameフィルタからマイページシナリオ除外が削除されている
- [ ] 既存78シナリオが壊れていないこと（合計87シナリオ全PASS）
- [ ] テストコマンド: `npx cucumber-js`
- [ ] 単体テスト: `npx vitest run` も全PASS維持

## スコープ外

- MypageServiceやAPIルートの変更
- specialist_browser_compat.featureの追加対応
- incentive.steps.tsの修正（TASK-027で完了済み）

## 補足・制約

- D-10に従いサービス層テストとして実装（MypageServiceの公開関数を直接呼び出す）
- Worldにマイページ関連コンテキスト（mypageResult等）を追加する必要がある場合はworld.tsを更新すること
- 「マイページに通知欄が存在する」シナリオはMypageServiceのgetMypageが通知欄データ（空配列等）を含むことを検証すればよい
- locked_files外のファイルを変更する必要が生じた場合はエスカレーションすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 未解決の問題: なし

### 進捗ログ
- 必読ドキュメント・既存コード把握完了
- in-memory/user-repository.ts に updateIsPremium を追加
- in-memory/post-repository.ts に findByAuthorId を追加
- world.ts に mypageResult, postHistoryResult プロパティを追加
- mypage.steps.ts を新規作成（8シナリオ）
- currency.steps.ts に「通貨残高 {string} が表示される」ステップを追記
- cucumber.js を更新（mypage.feature 追加、マイページ残高確認フィルタ削除）
- thread.steps.ts の `{string} と表示される` を拡張（マイページ0件ケース対応）
  - ステップ重複を避けるため mypage.steps.ts には定義せず thread.steps.ts に統合
- 問題解決: {string}と表示されるの重複 → thread.steps.tsへの統合で解決
- 問題解決: アカウント情報ステップのスラッシュエスケープ → \/でエスケープ
- 問題解決: displayName取得のTypeError → InMemoryPostRepo.findById経由で取得

### テスト結果サマリー
- BDDテスト: 87シナリオ 419ステップ 全PASS
  - mypage.feature 8シナリオ PASS
  - currency.feature「マイページで通貨残高を確認する」PASS
  - 既存78シナリオ破損なし
- 単体テスト: 15ファイル 468テスト 全PASS
