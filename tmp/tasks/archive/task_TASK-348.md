---
task_id: TASK-348
sprint_id: Sprint-135
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-28T13:00:00+09:00
updated_at: 2026-03-28T13:00:00+09:00
locked_files:
  - features/step_definitions/thread.steps.ts
  - "[NEW] src/__tests__/app/(web)/_components/FloatingActionMenu.test.tsx"
---

## タスク概要

`features/thread.feature` の `@fab` シナリオ2件が UNDEFINED のため、ステップ定義を追加する。
これらは UI/DOM 層の振る舞い（ボトムシートの開閉）であり `bdd_test_strategy.md §7.3` に従い
Cucumber 側は `pending` とし、Vitest コンポーネントテストで代替検証する。

対象は `@fab` タグのみ（`@fab @wip` の3件は未着手扱いのためスコープ外）。

## 対象BDDシナリオ

`features/thread.feature` の以下2シナリオ（現在 UNDEFINED）:

1. L286 `@fab` Scenario: フローティングメニューからボトムシートで書き込みフォームを開く
2. L292 `@fab` Scenario: ボトムシートの外側をタップするとフォームが閉じる

## 必読ドキュメント（優先度順）

1. [必須] `features/thread.feature` L285-297 — 対象2シナリオの全テキスト
2. [必須] `docs/architecture/bdd_test_strategy.md` §7.3 — pending戦略・ステップコメント形式・トレーサビリティ規約
3. [必須] `src/app/(web)/_components/FloatingActionMenu.tsx` — テスト対象コンポーネント実装
4. [参考] `features/step_definitions/thread.steps.ts` L末尾 — 既存ステップの末尾に追記

## 実装方針

### 1. Cucumber ステップ定義（pending）

`features/step_definitions/thread.steps.ts` の末尾に以下を追記する。

```typescript
// ===========================================================================
// フローティングアクションメニュー @fab
// ===========================================================================
// DOM/CSS 表示・操作のため Cucumber サービス層では検証不可（§7.3）
// 代替検証: src/__tests__/app/(web)/_components/FloatingActionMenu.test.tsx

Given("スレッドを表示している", async function (this: BattleBoardWorld) {
  // DOM 操作シナリオのためサービス層では pending
  return "pending";
});

When("フローティングメニューの書き込みボタンをタップする", async function (this: BattleBoardWorld) {
  return "pending";
});

Then("ボトムシートで書き込みフォームが表示される", async function (this: BattleBoardWorld) {
  return "pending";
});

Then("書き込みフォームが利用可能である", async function (this: BattleBoardWorld) {
  return "pending";
});

Given("ボトムシートで書き込みフォームが表示されている", async function (this: BattleBoardWorld) {
  return "pending";
});

When("ボトムシートの外側をタップする", async function (this: BattleBoardWorld) {
  return "pending";
});

Then("ボトムシートが閉じる", async function (this: BattleBoardWorld) {
  return "pending";
});
```

注意点:
- `return "pending"` を使用すること（`assert(true)` での偽装PASSは禁止）
- `スレッドを表示する`（L1568、引数なし・When）と重複しないこと。今回追加するのは Given の「スレッドを表示している」

### 2. Vitest コンポーネントテスト

`src/__tests__/app/(web)/_components/FloatingActionMenu.test.tsx` を新規作成する。

```
/**
 * FloatingActionMenu コンポーネントテスト
 *
 * BDD シナリオとのトレーサビリティ:
 *   features/thread.feature @fab
 *   - フローティングメニューからボトムシートで書き込みフォームを開く
 *   - ボトムシートの外側をタップするとフォームが閉じる
 */
```

テスト内容:
- `fab-post-btn` をクリックすると書き込みパネルが表示される（`translate-y-0` クラスが付与される）
- 閉じるボタン（XIcon付きの aria-label="閉じる"）をクリックするとパネルが閉じる（`translate-y-full` クラスが付与される）
- 初期状態では FABメニュー（`#fab-menu`）が visible で、パネルが開いた状態では hidden になる

実装注意:
- `FloatingActionMenu` は `threadId` を props として受け取る
- `PostForm` コンポーネントを内部で使用しているため、モックが必要
  - `vi.mock("@/app/(web)/_components/PostForm", ...)` でモック化
- `useEffect` 内の DOM 操作（`document.querySelector("main")`）は jsdom 環境で動作するが、
  `requestAnimationFrame` は `vi.useFakeTimers()` 等で制御が必要な場合がある
- shadcn/ui の `Sheet` コンポーネントも `vi.mock` でモック化するか、実物をそのまま使う

## 完了条件

- [ ] `npx cucumber-js --tags "@fab and not @wip"` で2シナリオが PENDING（FAILではなくPENDING）
- [ ] `npx cucumber-js` 全体で新たな UNDEFINED・FAILED が増えていない
- [ ] `npx vitest run src/__tests__/app/(web)/_components/FloatingActionMenu.test.tsx` で全テスト PASS
- [ ] `npx vitest run` 全体で新たな失敗が増えていない

## スコープ外

- `@fab @wip` の3シナリオ（検索・画像・設定）はスコープ外（`@wip` タグのため）
- `FloatingActionMenu.tsx` 本体の変更は行わない
- `PostForm.tsx` の変更は行わない

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `features/thread.feature` L285-297 の対象2シナリオを確認（UNDEFINED状態）
2. `docs/architecture/bdd_test_strategy.md §7.3` の pending戦略を確認
3. `src/app/(web)/_components/FloatingActionMenu.tsx` の実装を確認
4. `features/step_definitions/thread.steps.ts` の末尾にpendingステップ定義7件を追加
   - 注意: `書き込みフォームが利用可能である` はL638に既存定義があったため重複を除去
5. `src/__tests__/app/(web)/_components/FloatingActionMenu.test.tsx` を新規作成（8テスト）

### テスト結果サマリー

**Cucumber BDDテスト (`npx cucumber-js --tags "@fab and not @wip"`)**
- 変更前: 2 scenarios (2 undefined)
- 変更後: 2 scenarios (2 pending) ← 完了条件クリア

**Cucumber BDDテスト全体 (`npx cucumber-js`)**
- 変更前: 382 scenarios (14 undefined, 16 pending, 352 passed)
- 変更後: 382 scenarios (12 undefined, 18 pending, 352 passed)
- 新たなUNDEFINED・FAILEDなし ← 完了条件クリア

**Vitestコンポーネントテスト (`npx vitest run FloatingActionMenu.test.tsx`)**
- 8 tests PASS ← 完了条件クリア

**Vitest全体 (`npx vitest run`)**
- 変更前: 4 failed / 100 passed (13テスト失敗は既存)
- 変更後: 4 failed / 101 passed (変化なし、FloatingActionMenuの8テストが追加でPASS)
- 新たな失敗なし ← 完了条件クリア
