---
task_id: TASK-314
sprint_id: Sprint-117
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-25T22:00:00+09:00
updated_at: 2026-03-25T22:00:00+09:00
locked_files:
  - src/lib/services/admin-service.ts
  - features/step_definitions/admin.steps.ts
  - features/admin.feature
  - src/__tests__/lib/services/admin-service.test.ts
---

## タスク概要

敵対的コードレビュー（ATK-006-1, ATK-006-2）で発見された管理者ユーザー管理の機能欠損2件を修正する。
いずれもBDDシナリオの受け入れ基準に明記された機能が未実装の状態。

追加で、ATK-003-1のBAN設計意図（ユーザーBAN=警告＋通貨リセット、IP BAN=本気の遮断）をadmin.featureにコメントとして明文化する。

## 修正内容

### 修正1: ATK-006-1 — ユーザー一覧に通貨残高（balance）を追加

**対象シナリオ** (admin.feature L141-146):
```gherkin
Scenario: 管理者がユーザー一覧を閲覧できる
  ...
  And 各ユーザーのID、登録日時、ステータス、通貨残高が表示される
```

**問題**: `getUserList` は `UserRepository.findAll` を呼ぶだけで通貨残高を取得していない。ステップ定義にもbalanceの検証コードがない。

**修正方針**:
1. `admin-service.ts` の `getUserList` で、取得したユーザーリストの各userIdに対して通貨残高を取得する。N+1を避けるためバッチ取得が望ましい（`CurrencyRepository` に `getBalancesByUserIds` があれば利用、なければ追加）
2. 戻り値の型にbalanceフィールドを含める
3. `admin.steps.ts` の該当Thenステップでbalanceが数値であることを検証する
4. 単体テストを修正・追加する

### 修正2: ATK-006-2 — 書き込み履歴にスレッド名を追加

**対象シナリオ** (admin.feature L155-157):
```gherkin
Scenario: 管理者がユーザーの書き込み履歴を確認できる
  Given 管理者がユーザー "UserA" の詳細ページを表示している
  Then 管理者画面でも各書き込みのスレッド名、本文、書き込み日時が含まれる
```

**問題**: `getUserDetail` / `getUserPosts` は `PostRepository.findByAuthorId` を呼んでおり、threadsとのJOINがないためスレッド名が取得できない。ステップ定義は `threadId` のtruthyチェックで代替している。

**修正方針**:
1. `PostWithThread` 型と `PostRepository.searchByAuthorId`（threads JOIN付き）が既にマイページ向けに実装されている。この既存資産を流用する
2. `admin-service.ts` の `getUserDetail` で、postsの取得を `PostRepository.searchByAuthorId` に切り替える（または管理者向けに `is_deleted` フィルタなしの専用関数を用意する）
3. `admin.steps.ts` の該当Thenステップで `threadTitle` の存在を検証する
4. 単体テストを修正・追加する

**注意**: `searchByAuthorId` は `is_deleted: false` フィルタを含む可能性がある。管理画面では削除済みレスも表示すべきかもしれないが、既存シナリオに削除済みレスの要件は明示されていないため、現状は `is_deleted: false` で問題ない。

### 追加: ATK-003-1 — BAN設計意図の明文化

`features/admin.feature` のユーザーBAN / IP BANセクションのコメントに、以下の設計意図を追記する:
- ユーザーBAN: 警告的措置。通貨リセット等のペナルティが伴う。Cookie削除で新規IDとして再登録可能（意図的設計）
- IP BAN: 本格的な遮断措置。同一IPからの新規登録・書き込みを完全にブロック
- 管理運用: まずユーザーBANで警告 → 改善されなければIP BANにエスカレーション

## 対象BDDシナリオ
- `features/admin.feature` @ユーザー管理

## 必読ドキュメント（優先度順）
1. [必須] `features/admin.feature` L135-157 — 対象シナリオ
2. [必須] `src/lib/services/admin-service.ts` — getUserList, getUserDetail, getUserPosts
3. [必須] `features/step_definitions/admin.steps.ts` — ステップ定義
4. [参考] `tmp/workers/bdd-architect_ATK-006-1/assessment.md` — アーキテクト評価
5. [参考] `tmp/workers/bdd-architect_ATK-006-2/assessment.md` — アーキテクト評価
6. [参考] `src/lib/infrastructure/repositories/post-repository.ts` — PostWithThread, searchByAuthorId
7. [参考] `src/lib/infrastructure/repositories/currency-repository.ts` — getBalance

## 完了条件
- [x] `npx vitest run` 全PASS
- [x] `npx cucumber-js --tags @admin` 全シナリオPASS（pendingは既存のみ許容）
- [x] getUserListの戻り値にbalanceが含まれる
- [x] getUserDetailの戻り値のpostsにthreadTitleが含まれる
- [x] admin.featureのBAN関連セクションに設計意図コメントが追加されている

## スコープ外
- API routeの変更（サービス層の修正のみ）
- 他のATK問題の修正（ATK-002-1, ATK-010-1, ATK-012-2は今回スコープ外）
- BDDシナリオ本文の変更（コメント追記のみ）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了

### 進捗ログ
- [1st worker] ソースコード・BDDステップ定義・InMemoryリポジトリの調査完了
- [1st worker] admin-service.ts: getUserList にbalance追加、getUserDetail/getUserPosts を searchByAuthorId に切替
- [1st worker] admin.steps.ts: balance検証追加、threadTitle検証追加、userListResult型変更
- [1st worker] admin.feature: BAN設計意図コメント追加済み（L72-76）
- [1st worker] レート制限により中断
- [2nd worker] 前回の作業成果を確認。サービス実装・ステップ定義・featureコメントは全て完了済み
- [2nd worker] BDDテスト実行: 全PASS確認。残作業は単体テストの作成のみ
- [2nd worker] 単体テスト admin-service.test.ts を新規作成（27テスト: getUserList 12件, getUserDetail 8件, getUserPosts 7件）
- [2nd worker] 全テスト実行: vitest 全PASS、cucumber-js 全PASS

### テスト結果サマリー

**単体テスト (vitest):**
- 全体: 96 files, 1855 tests, all PASS
- admin-service.test.ts: 27 tests PASS（新規作成）
  - getUserList: 12 tests（balance付加、ページネーション、エッジケース）
  - getUserDetail: 8 tests（threadTitle付き書き込み履歴、基本情報、エッジケース）
  - getUserPosts: 7 tests（PostWithThread取得、ページネーション伝播、エッジケース）

**BDDテスト (cucumber-js):**
- 347 scenarios: 331 passed, 16 pending（既存分のみ）
- 1832 steps: 1779 passed, 16 pending, 37 skipped
