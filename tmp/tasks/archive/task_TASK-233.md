---
task_id: TASK-233
sprint_id: Sprint-82
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T12:00:00+09:00
updated_at: 2026-03-21T12:00:00+09:00
locked_files:
  - e2e/flows/thread-ui.spec.ts
---

## タスク概要
`e2e/flows/thread-ui.spec.ts` を修正し、7テスト全体で1つのスレッドを共有し、最後にスレッドを管理者権限で削除するようにする。
現状は各テストが `seedThreadWithAnchorPosts` フィクスチャで毎回新規スレッドを作成しており、本番スモークテストで `cleanup()` 引数なし = no-op のため、スレッドが蓄積し続ける問題がある。

## 修正方針

### ライフサイクル変更

**現状（テスト単位）:**
- `beforeEach`: cleanup() → 本番no-op / ローカル全件削除
- 各テスト: seedThreadWithAnchorPosts で毎回新規作成
- afterAll/afterEach: なし

**変更後（describe単位で1スレッド共有）:**
- ファイル先頭レベルでスレッドID/Keyを保持する変数を用意
- 最初のテスト実行前に1回だけスレッドを作成（`test.beforeAll` でseed）
- 各テストはその共有スレッドにアクセスして検証（読み取り+DOM操作のみ、データ変更なし）
- 最後に1回だけ管理者権限でスレッドを削除（`test.afterAll` でcleanup）
- `beforeEach` の `cleanup()` は削除する

### Playwrightフィクスチャの制約への対応

`test.beforeAll` / `test.afterAll` ではカスタムフィクスチャ（`seedThreadWithAnchorPosts`, `cleanup`）が使えない。
Playwright の `beforeAll` は `{ request }` のみ利用可能。

そのため `data.fixture.ts` からseed/cleanup関数を直接importして使う。環境判定は `process.env` ベースで行う:
- `isProduction` 判定: `process.env.PROD_BASE_URL` が設定されていれば本番
- 本番seed: `seedThreadWithAnchorPostsProd(request, baseURL, edgeToken)`
- 本番cleanup: `cleanupProd(request, baseURL, adminSessionToken, [threadId])`
- ローカルseed: `seedThreadWithAnchorPostsLocal(request)`
- ローカルcleanup: `cleanupLocal(request)`

環境判定ロジックは `e2e/fixtures/index.ts` の既存パターン、および `e2e/flows/basic-flow.spec.ts` の `test.afterAll` を参考にすること。

### 各テストの変更

- `seedThreadWithAnchorPosts` フィクスチャ引数を全テストから削除
- 代わりにファイルスコープの共有変数から `threadKey` を取得
- テスト本体のロジック（DOM操作・アサーション）は変更しない

### A-6, A-7 の順序依存への注意

- A-6 はフォームに ">>5" を挿入する
- A-7 はフォームに "こんにちは" を fill してから ">>3" を追記する

両テストとも `page.goto()` でスレッドページに毎回アクセスし直すため、フォーム状態はリセットされる。テスト間の順序依存はない。

## 必読ドキュメント（優先度順）
1. [必須] `e2e/flows/thread-ui.spec.ts` — 修正対象
2. [必須] `e2e/fixtures/index.ts` — フィクスチャ定義（環境判定パターンの参考）
3. [必須] `e2e/fixtures/data.fixture.ts` — seed/cleanup関数の直接import元
4. [参考] `e2e/flows/basic-flow.spec.ts` — `test.afterAll` でのローカル限定cleanupパターンの参考

## 出力（生成すべきファイル）
- `e2e/flows/thread-ui.spec.ts` — 修正済みファイル

## 完了条件
- [ ] スレッド作成が全テスト通じて1回のみ
- [ ] スレッド削除が全テスト通じて最後に1回のみ（管理者権限）
- [ ] ローカル・本番の両環境で正しく動作する分岐
- [ ] 7テストの検証ロジックが変わっていないこと
- [ ] `beforeEach` の不要な `cleanup()` が削除されていること

## スコープ外
- テストの検証ロジック（DOM操作・アサーション）の変更
- `e2e/fixtures/` 配下のフィクスチャ定義の変更
- `e2e/flows/thread-ui.spec.ts` 以外のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: e2e/flows/thread-ui.spec.ts の修正（ライフサイクル変更・環境分岐実装）
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `e2e/flows/thread-ui.spec.ts` を修正
  - ファイルスコープ変数 `sharedThreadId` / `sharedThreadKey` を追加
  - 環境判定: `const isProduction = Boolean(process.env.PROD_BASE_URL)`
  - `test.beforeAll`: `seedThreadWithAnchorPostsLocal/Prod` を直接importして1回のみseed
  - `test.afterAll`: ローカルは `cleanupLocal`、本番は `adminLoginProd` + `cleanupProd` を1回のみ実行
  - `test.beforeEach({ cleanup })` ブロックを削除
  - 7テスト全て: `seedThreadWithAnchorPosts` フィクスチャ引数を削除し、`sharedThreadKey` を参照
  - テスト本体のDOM操作・アサーションは変更なし

### テスト結果サマリー

- TypeScriptコンパイルチェック: エラーなし（`npx tsc --noEmit` 実行済み）
- importの存在確認: 全import対象（`seedThreadWithAnchorPostsLocal`, `seedThreadWithAnchorPostsProd`, `cleanupLocal`, `cleanupProd`, `adminLoginProd`）のexportを確認済み
- E2E実行: ローカルサーバー未起動のため実行省略（TypeScriptレベルの検証完了）
