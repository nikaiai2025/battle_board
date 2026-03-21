---
task_id: TASK-261
sprint_id: Sprint-91
status: completed
assigned_to: bdd-coding
depends_on: [TASK-260]
created_at: 2026-03-22T00:00:00+09:00
updated_at: 2026-03-22T00:00:00+09:00
locked_files:
  - e2e/smoke/navigation.spec.ts
---

## タスク概要

Sprint-91で開発連絡板（/dev/）を全面リニューアルしたが、E2Eスモークテストが旧UIの要素ID（`#thread-create-form`, `#auth-prompt`）を参照しているため失敗する。新UIに合わせてテストを修正する。

## 必読ドキュメント（優先度順）

1. [必須] `e2e/smoke/navigation.spec.ts` — 修正対象（L352-387 開発連絡板セクション）
2. [必須] `src/app/(web)/dev/page.tsx` — 新UIの構造（要素IDの確認）

## 修正内容

`e2e/smoke/navigation.spec.ts` の「開発連絡板 /dev」テストブロック（L365-387）を新UIに合わせて修正:

**旧テスト（削除）:**
```typescript
await expect(page.locator("#thread-create-form")).toBeVisible();
await expect(page.locator("#auth-prompt")).toBeVisible();
await expect(page.locator("main")).toBeVisible();
```

**新テスト（置換）:**
新UIの実際の要素に合わせてアサーションを更新する:
- `form[action="/api/dev/posts"]` — 投稿フォームの存在確認
- `#body-input` — 本文テキストエリアの存在確認
- `#submit-button` — 書き込むボタンの存在確認
- `.dev-title` — ページタイトル「開発連絡板」の表示確認

コメントのSee参照も更新する（`features/dev_board.feature` への参照追加）。

## 完了条件

- [ ] E2Eテストが新UIの要素を正しく検証している
- [ ] `npx vitest run` 全テストPASS（E2Eは実行対象外だがvitestに影響がないこと）

## スコープ外

- 新UIの機能テスト（書き込み・表示等のE2Eテストは別タスク）
- BDDステップ定義の実装

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: E2Eスモークテスト修正・vitest全PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/app/(web)/dev/page.tsx` で新UIの要素ID（`.dev-title`, `form[action="/api/dev/posts"]`, `#body-input`, `#submit-button`）を確認
- `e2e/smoke/navigation.spec.ts` L365-387 の「開発連絡板 /dev」テストブロックを修正
  - 旧: `#thread-create-form`, `#auth-prompt`, `main` → 新: `.dev-title`, `form[action="/api/dev/posts"]`, `#body-input`, `#submit-button`
  - コメントのSee参照を `features/dev_board.feature` に更新
- `npx vitest run` 実行: 80ファイル 1653テスト全PASS

### テスト結果サマリー

- `npx vitest run`: 80 passed / 1653 tests PASS（E2Eは実行対象外）
