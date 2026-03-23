---
task_id: TASK-235
sprint_id: Sprint-82
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T13:00:00+09:00
updated_at: 2026-03-21T13:00:00+09:00
locked_files:
  - docs/architecture/bdd_test_strategy.md
  - e2e/fixtures/index.ts
---

## タスク概要
TASK-234の分析結果に基づき、E2Eテストのcleanup漏れ再発防止のための2点の環境整備を行う。

## 修正内容

### 1. D-10 (bdd_test_strategy.md) にcleanup呼び出し規約を追記

§10.3.4「安全性制約」セクションの末尾に以下の内容を追記する。見出しレベルやスタイルは既存の§10.3.4内の記述に合わせること。

追記内容（趣旨。文体は既存に合わせて調整してよい）:

> #### cleanup呼び出し規約（ローカルと本番の挙動差）
>
> `cleanup` フィクスチャはローカルと本番で挙動が異なる:
>
> | 呼び出し | ローカル | 本番 |
> |---|---|---|
> | `cleanup()` | 全件削除 | **no-op（何もしない）** |
> | `cleanup([threadId])` | 全件削除 | 指定スレッドのみ管理者API経由で削除 |
>
> **ルール:** `seedThread` / `seedThreadWithAnchorPosts` 等でスレッドを作成するテストは、必ず `cleanup([threadId])` を threadId 指定で呼ぶこと。引数なしの `cleanup()` は、スレッド作成を行わないテスト（GETのみのナビゲーションテスト等）でのみ使用する。
>
> **読み取り専用テストの共有パターン:** 複数テストが同一スレッドを読み取り専用で参照する場合、`beforeAll` で1回作成し `afterAll` で1回削除する。`beforeEach` での個別作成は不要なリソース消費を招く。

### 2. cleanup()引数なし呼び出し時の警告出力

`e2e/fixtures/index.ts` の cleanup 実装（L189付近）で、本番環境かつ引数なしの場合に `console.warn` を出力する。

変更前:
```typescript
if (isProduction) {
    if (!threadIds || threadIds.length === 0) return;
```

変更後:
```typescript
if (isProduction) {
    if (!threadIds || threadIds.length === 0) {
        console.warn(
            "[cleanup] 本番環境でcleanup()が引数なしで呼ばれました。" +
            "スレッドを作成したテストでは cleanup([threadId]) を使用してください。"
        );
        return;
    }
```

## 必読ドキュメント
1. [必須] `docs/architecture/bdd_test_strategy.md` — §10.3.4 に追記
2. [必須] `e2e/fixtures/index.ts` — cleanup実装の修正箇所

## 完了条件
- [ ] D-10 §10.3.4にcleanup規約が追記されている
- [ ] cleanup()引数なし時にconsole.warnが出力される
- [ ] 既存のテストロジックが変わっていないこと

## スコープ外
- 上記2ファイル以外の変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 修正1（bdd_test_strategy.md §10.3.4 追記）、修正2（e2e/fixtures/index.ts console.warn 追加）
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `docs/architecture/bdd_test_strategy.md` §10.3.4 末尾に「cleanup呼び出し規約」セクション追記（L433-444）
- `e2e/fixtures/index.ts` L191-197 に本番環境かつ引数なし時の `console.warn` 出力を追加

### テスト結果サマリー

本タスクはドキュメント追記とランタイム警告の追加のみ（既存ロジック変更なし）。
- 既存のcleanupロジックに変更なし（return の前に warn を挿入しただけ）
- 新たなテストコードの追加は不要（テスト対象ではなくフィクスチャの内部挙動変更のため）
