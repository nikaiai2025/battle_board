---
task_id: TASK-245
sprint_id: Sprint-85
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T19:50:00+09:00
updated_at: 2026-03-21T19:50:00+09:00
locked_files:
  - features/step_definitions/mypage.steps.ts
  - features/step_definitions/thread.steps.ts
---

## タスク概要

mypage.feature v4 で追加された8シナリオ（ページネーション3 + 検索5）のBDD step definitions を実装する。
バックエンドのMypageService.getPostHistory（page/keyword/startDate/endDate対応）はSprint-84 TASK-241で実装済み。

## 対象BDDシナリオ
- `features/mypage.feature` ページネーション3シナリオ + 検索5シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/mypage.feature` — 対象シナリオ（ページネーション・検索セクション）
2. [必須] `features/step_definitions/mypage.steps.ts` — 既存ステップ定義
3. [必須] `docs/architecture/bdd_test_strategy.md` — テスト戦略（サービス層テスト方針）
4. [必須] `src/lib/services/mypage-service.ts` — getPostHistory（PaginatedPostHistory型）
5. [参考] `features/support/world.ts` — BattleBoardWorld
6. [参考] `features/support/mock-installer.ts` — InMemoryPostRepo等

## 実装内容

### テスト対象の8シナリオ

**ページネーション（3シナリオ）:**
1. 書き込み履歴が50件以下 → 全件表示、ページネーション非表示
2. 書き込み履歴が50件超 → 最新50件表示、ページネーション表示（全Nページ）
3. 2ページ目 → 51件目〜100件目

**検索（5シナリオ）:**
4. キーワード検索 → 本文に含む書き込みのみ
5. 日付範囲 → 期間内の書き込みのみ
6. キーワード + 日付範囲 → AND条件
7. 検索結果50件超 → ページネーション適用
8. 検索結果0件 → メッセージ表示

### 実装方針

D-10に従い、サービス層（MypageService.getPostHistory）を直接呼び出してテストする。
InMemoryPostRepoにテストデータを投入し、getPostHistory の返り値（posts, total, totalPages, page）を検証する。

### 追加が必要なGiven/When/Thenステップ

```gherkin
# Given
Given ユーザーが過去に{int}件の書き込みを行っている  # 既存ステップの拡張（大量データ生成）
Given うち{int}件の本文に {string} が含まれている
Given キーワード {string} に該当する書き込みが{int}件ある
Given ユーザーが{string}から{string}の間に書き込みを行っている
Given 書き込み履歴の{int}ページ目を表示している

# When
When マイページの書き込み履歴を表示する                # 既存ステップを拡張してページネーション対応
When {int}ページ目に遷移する
When キーワード {string} で書き込み履歴を検索する
When 開始日 {string} 終了日 {string} で絞り込む
When キーワード {string} かつ開始日 {string} 終了日 {string} で検索する

# Then
Then {int}件すべてが新しい順に表示される
Then 最新の{int}件が新しい順に表示される
Then ページネーションは表示されない
Then ページネーションが表示される（全{int}ページ）
Then {int}件目から{int}件目が新しい順に表示される
Then 該当する{int}件が新しい順に表示される
Then その期間内の書き込みのみが新しい順に表示される
Then 期間内かつ本文に {string} を含む書き込みのみが表示される
Then "該当する書き込みはありません" と表示される
```

## 完了条件
- [ ] 新規8シナリオの全step definitionsが実装されている
- [ ] `npx cucumber-js --tags @pagination or @search` で8シナリオPASS（タグが存在する場合）
  - タグがない場合は `npx cucumber-js features/mypage.feature` で全シナリオPASS
- [ ] 既存mypage.featureの8シナリオが引き続きPASS（後方互換）

## スコープ外
- UI/E2Eテスト（ページネーション/検索のUI動作はE2E層で検証）
- バックエンドAPI修正

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全19シナリオ（既存11 + 新規8）のステップ定義実装・PASS確認
- 未解決の問題: なし

### 進捗ログ
- 未定義ステップ8シナリオ分を特定済み
- searchByAuthorId実装（InMemoryPostRepo）・MypageService.getPostHistory確認済み
- mypage.steps.tsに以下のステップを追加:
  - Given: ユーザーが過去に{int}件の書き込みを行っている（汎用、3件ステップを統合）
  - Given: うち{int}件の本文に {string} が含まれている
  - Given: キーワード {string} に該当する書き込みが{int}件ある
  - Given: ユーザーが2026年3月1日から3月21日の間に書き込みを行っている
  - Given: ユーザーが過去に書き込みを行っている
  - Given: 書き込み履歴の{int}ページ目を表示している
  - When: {int}ページ目に遷移する
  - When: キーワード {string} で書き込み履歴を検索する
  - When: 開始日 {string} 終了日 {string} で絞り込む
  - When: キーワード {string} かつ開始日 {string} 終了日 {string} で検索する
  - Then: {int}件すべてが新しい順に表示される
  - Then: 最新の{int}件が新しい順に表示される
  - Then: ページネーションは表示されない
  - Then: ページネーションが表示される（全{int}ページ）
  - Then: {int}件目から{int}件目が新しい順に表示される
  - Then: 該当する{int}件が新しい順に表示される
  - Then: その期間内の書き込みのみが新しい順に表示される
  - Then: 期間内かつ本文に {string} を含む書き込みのみが表示される
  - Then: 最新の{int}件が表示される
  - Then: "該当する書き込みはありません" と表示される（ambiguous問題あり → ESC-TASK-245-1）
- 問題: "該当する書き込みはありません" と表示されるがthread.steps.tsの{string}と表示されるとambiguous
  → ESC-TASK-245-1でthread.steps.tsへの変更を依頼中

### テスト結果サマリー（エスカレーション前）
- 実行対象: mypage.feature（19シナリオ）
- PASS: 18シナリオ（既存11 + 新規7）
- FAIL/Ambiguous: 1シナリオ（検索結果が0件の場合はメッセージが表示される）

### escalation_resolution
**ESC-TASK-245-1 解決方針（オーケストレーター判断）:**

選択肢Aを採用する。具体的な修正内容:

1. `features/step_definitions/thread.steps.ts` の `{string} と表示される` ステップに
   `"該当する書き込みはありません"` 分岐を追加する。
   この分岐では `this.postHistoryResult.total === 0` を検証する。

2. `features/step_definitions/mypage.steps.ts` の固有ステップ
   `'"該当する書き込みはありません" と表示される'` を削除してambiguousを解消する。

3. `npx cucumber-js features/mypage.feature` で全19シナリオPASSを確認する。

**locked_files を `features/step_definitions/thread.steps.ts` も含むよう拡張済み。**

### 進捗ログ（エスカレーション解決後）
- ESC-TASK-245-1 解決方針に従い修正実施:
  1. thread.steps.ts: `{string} と表示される` ステップ（L660-697）に `"該当する書き込みはありません"` の分岐を追加（L679-695）。`postHistoryResult.total === 0` と `postHistoryResult.posts.length === 0` を検証
  2. mypage.steps.ts: 固有ステップ `'"該当する書き込みはありません" と表示される'`（L1455-1470）を削除し、コメントに統合先の参照を残した
- Ambiguousエラー解消を確認

### テスト結果サマリー（最終）
- 実行対象: mypage.feature（19シナリオ）
- PASS: 19シナリオ（既存11 + 新規8）
- FAIL: 0
- Ambiguous: 0
- Pending: 0
