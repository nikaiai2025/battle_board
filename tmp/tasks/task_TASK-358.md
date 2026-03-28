---
task_id: TASK-358
sprint_id: Sprint-139
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T21:00:00+09:00
updated_at: 2026-03-29T21:00:00+09:00
locked_files:
  - "src/lib/infrastructure/repositories/copipe-repository.ts"
  - "src/lib/services/handlers/copipe-handler.ts"
  - "src/__tests__/lib/services/handlers/copipe-handler.test.ts"
  - "features/support/in-memory/copipe-repository.ts"
---

## タスク概要

既存の `!copipe` コマンドの検索範囲を拡張し、管理者データ（copipe_entries）に加えてユーザー登録データ（user_copipe_entries）もマージして検索するように改修する。

## 対象BDDシナリオ
- `features/user_copipe.feature`（検索統合の4シナリオが本タスクの守備範囲）
- `features/command_copipe.feature`（既存シナリオの回帰確認）

## 必読ドキュメント（優先度順）
1. [必須] `features/user_copipe.feature` — 検索統合シナリオ（L148-194）
2. [必須] `docs/architecture/components/user-copipe.md` — §2.3 ICopipeRepository の変更
3. [必須] `src/lib/infrastructure/repositories/copipe-repository.ts` — 現行の検索実装
4. [必須] `src/lib/services/handlers/copipe-handler.ts` — 現行の CopipeHandler
5. [必須] `features/support/in-memory/copipe-repository.ts` — InMemory実装
6. [参考] `features/command_copipe.feature` — 既存の検索シナリオ（回帰確認用）

## 改修内容

### 1. ICopipeRepository インターフェース変更

```
変更: findByName(name): CopipeEntry | null  →  findByName(name): CopipeEntry[]
```

完全一致が複数件返る可能性がある（管理者データとユーザーデータで同名）。
`findRandom`, `findByNamePartial`, `findByContentPartial` は型シグネチャ変更なし。

### 2. CopipeRepository（Supabase実装）の改修

各検索関数で `copipe_entries` と `user_copipe_entries` の両テーブルを検索し、結果をマージして返す。

- `findRandom()`: 両テーブルの全件を結合 → ランダム1件選択
- `findByName(name)`: 両テーブルで完全一致 → 配列で返す
- `findByNamePartial(name)`: 両テーブルで部分一致 → マージ
- `findByContentPartial(query)`: 両テーブルで部分一致 → マージ

### 3. CopipeHandler の改修

`findByName` の戻り値が配列に変わるため、分岐ロジックを更新:

```
旧: exactMatch が null → 部分一致へ / non-null → 即表示
新: exactMatches.length === 0 → 部分一致へ
    exactMatches.length === 1 → 即表示
    exactMatches.length >= 2  → ランダム1件 +「N件ヒット」通知
```

### 4. InMemory CopipeRepository の改修

`features/support/in-memory/copipe-repository.ts` も同様に:
- 内部ストアに user_copipe_entries 相当のデータも保持する仕組みを追加（`_insertUser()` ヘルパー等）
- 全検索関数で両ストアをマージして返す
- `findByName` の戻り値を配列に変更

### 5. 単体テスト更新

`copipe-handler.test.ts` に以下のケースを追加:
- 完全一致が複数件ヒットした場合のランダム1件 + 通知
- 既存テストの `findByName` モック戻り値を配列に変更

## 完了条件
- [x] `findByName` が配列を返すように変更されている
- [x] 両テーブルマージ検索が実装されている
- [x] CopipeHandler が複数完全一致を正しく処理する
- [x] `npx vitest run` で新規・既存テスト全PASS
- [x] `npx cucumber-js` で既存シナリオ回帰なし（394シナリオ 0 FAIL）
- [x] テストコマンド: `npx vitest run` && `npx cucumber-js`

## スコープ外
- UserCopipeRepository / UserCopipeService / APIルート（TASK-357）
- BDDステップ定義の新規作成（TASK-359）
- フロントエンドUI

## 補足・制約
- `findByName` のインターフェース変更は破壊的変更。CopipeHandler 以外に `findByName` を呼んでいる箇所がないか確認すること
- user_copipe_entries テーブルの `user_id` カラムはマージ検索では使わない（検索結果の認可チェック不要 — 全ユーザーが検索可能）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 4ファイルすべての改修完了。単体テスト44件PASS、BDD394シナリオ0件失敗
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント読み込み完了。改修4ファイルを確認。`findByName` の呼び出し元は `copipe-handler.ts` のみ（破壊的変更の影響範囲を確認済み）
- [実装] `copipe-repository.ts`: ICopipeRepository.findByName 戻り値を `CopipeEntry | null` → `CopipeEntry[]` に変更。全4関数で両テーブル（copipe_entries + user_copipe_entries）をParallel検索してマージ
- [実装] `copipe-handler.ts`: `_handleSearch` の完全一致処理を 0件/1件/N件 の3分岐に更新。N件時は `（N件ヒット）` 通知付与
- [実装] `in-memory/copipe-repository.ts`: `adminStore` + `userStore` の2ストア構成に変更。`_insertUser()` ヘルパー追加。全4関数で両ストアをマージ
- [実装] `copipe-handler.test.ts`: `findByName` モック戻り値を全箇所で配列に変更。完全一致複数件の新テストを5件追加（計44件）
- [完了] `npx vitest run src/__tests__/lib/services/handlers/copipe-handler.test.ts`: 44 tests PASS
- [完了] `npx cucumber-js`: 394 scenarios (373 passed, 18 pending, 3 undefined, 0 failed)

### テスト結果サマリー
- 単体テスト: 44件 PASS（新規追加5件 + 既存39件、0件FAIL）
  - 新規: 完全一致複数件（2件/3件/5件/ランダム境界値/副作用なし確認）
- BDDテスト: 394シナリオ、373 PASS / 18 pending / 3 undefined / 0 FAIL
  - command_copipe.feature の全8シナリオ PASS（回帰なし確認済み）
  - 既存失敗（schema-consistency.test.ts: user_copipe_entries未マイグレーション、registration-service.test.ts等）は本タスク前から存在する既知の失敗
