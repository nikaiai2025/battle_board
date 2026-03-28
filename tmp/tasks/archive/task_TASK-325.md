---
task_id: TASK-325
sprint_id: Sprint-123
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T21:30:00+09:00
updated_at: 2026-03-26T21:30:00+09:00
locked_files:
  - "e2e/flows/basic-flow.spec.ts"
  - "e2e/flows/auth-flow.spec.ts"
---

## タスク概要

FABメニュー導入に伴い、E2Eテストの書き込みフローが壊れている。PostFormがFABボトムシートパネル内に移動したため、`#fab-post-btn` をクリックしてパネルを開いてからフォーム操作する必要がある。テストコードを修正する。

## 必読ドキュメント（優先度順）
1. [必須] `src/app/(web)/_components/FloatingActionMenu.tsx` — FABメニューの実装（パネル開閉の仕組み）
2. [必須] `e2e/flows/basic-flow.spec.ts` — 修正対象（3箇所）
3. [必須] `e2e/flows/auth-flow.spec.ts` — 修正対象（1箇所）

## 出力（生成すべきファイル）
- `e2e/flows/basic-flow.spec.ts` — FABクリック追加版
- `e2e/flows/auth-flow.spec.ts` — FABクリック追加版

## 完了条件
- [x] 4箇所すべてで `#fab-post-btn` クリック → `#post-body-input` fill → `#post-submit-btn` click の順序になっていること
- [x] `npx vitest run` 全PASS（回帰なし）
- [x] `npx cucumber-js` 全PASS（回帰なし）

## スコープ外
- FloatingActionMenu.tsx やPostForm.tsx の変更
- navigation.spec.ts, thread-ui.spec.ts の変更（`#post-submit-btn` を使っていない）
- BDDシナリオ（features/*.feature）の変更

## 補足・制約

### 修正パターン（4箇所共通）

各 `#post-body-input` fill の直前に FABクリックを追加する:

```typescript
// FABの書き込みボタンをクリックしてパネルを開く
await page.locator("#fab-post-btn").click();
// パネル内のフォームで書き込み
await page.locator("#post-body-input").fill(...);
await page.locator("#post-submit-btn").click();
```

### 修正箇所

1. `e2e/flows/basic-flow.spec.ts` L150付近（!w >>1 コマンド）
2. `e2e/flows/basic-flow.spec.ts` L203付近（!abeshinzo コマンド）
3. `e2e/flows/basic-flow.spec.ts` L242付近（!omikuji コマンド）
4. `e2e/flows/auth-flow.spec.ts` L82付近（レス書き込み）

### FABパネルの仕組み（FloatingActionMenu.tsx）

- PostFormパネルは常時マウント、CSS `translate-y` で開閉
- `activePanel === "post"` → `translate-y-0`（表示）
- `activePanel !== "post"` → `translate-y-full`（画面外）
- CSSトランジション200ms（`duration-200`）
- `.fill()` はJS経由で動くがビューポート外、`.click()` はビューポート内が必要

### 注意点
- basic-flow.spec.ts はserial実行。2回目以降の書き込みではパネルが既に閉じている可能性がある（書き込み成功後にパネルが閉じる場合）。毎回 `#fab-post-btn` クリックを入れること
- auth-flow.spec.ts でも同様にFABクリックを追加

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全4箇所の修正、vitest・cucumber-js 全PASS確認
- 未解決の問題: なし

### 進捗ログ
- FloatingActionMenu.tsx を読み、PostFormパネルが CSS translate-y で開閉する仕組みを確認
- basic-flow.spec.ts の3箇所（L150付近・L205付近・L247付近）に `#fab-post-btn` クリックを追加
- auth-flow.spec.ts の1箇所（L82付近）に `#fab-post-btn` クリックを追加
- vitest run: 98ファイル / 1896テスト PASS
- cucumber-js: 334シナリオ PASS（5 undefined / 16 pending は既存・今回変更なし）

### テスト結果サマリー
- npx vitest run: 98 passed (98) / 1896 tests PASS
- npx cucumber-js: 355 scenarios (5 undefined, 16 pending, 334 passed) — 回帰なし
