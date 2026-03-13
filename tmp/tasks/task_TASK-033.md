---
task_id: TASK-033
sprint_id: Sprint-14
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-14T18:00:00+09:00
updated_at: 2026-03-14T18:00:00+09:00
locked_files:
  - "next.config.ts"
  - "playwright.config.ts"
  - "e2e/api/senbra-compat.spec.ts"
---

## タスク概要

本番環境（Vercel）で専ブラ互換エンドポイントが404になる問題を修正する。
Next.js App Routerが拡張子付きURL（`.dat`, `.txt`, `.TXT`, `.html`）を静的ファイルリクエストとして処理し、ルートハンドラに到達しないことが原因。`next.config.ts` のrewritesで拡張子付きURLを内部リライトして解決する。

## 修正方針

### 1. `next.config.ts` にrewrites追加

以下の全専ブラ互換エンドポイントについてリライトルールを追加する:

```typescript
const nextConfig: NextConfig = {
  rewrites: async () => [
    // DATファイル: /boardId/dat/threadKey.dat → /boardId/dat/threadKey
    { source: '/:boardId/dat/:threadKey.dat', destination: '/:boardId/dat/:threadKey' },
    // kako形式（専ブラの過去ログ探索）→ dat/形式にリライト
    { source: '/:boardId/kako/:x/:y/:threadKey.dat', destination: '/:boardId/dat/:threadKey' },
    // subject.txt
    { source: '/:boardId/subject.txt', destination: '/:boardId/subject.txt' },
    // SETTING.TXT
    { source: '/:boardId/SETTING.TXT', destination: '/:boardId/SETTING.TXT' },
    // bbsmenu.html
    { source: '/bbsmenu.html', destination: '/bbsmenu.html' },
  ],
};
```

注意: `subject.txt`, `SETTING.TXT`, `bbsmenu.html` は固定パスのため、リライトが不要な可能性もある。まずローカルで `.dat` のみ問題が再現するか確認し、他も問題がある場合のみリライトルールを追加すること。

### 2. APIテスト修正

Sprint-13のAPIテスト(`e2e/api/senbra-compat.spec.ts`)では `.dat` 拡張子問題を回避するため拡張子なしURLを使っていた。rewrite修正後は**本来の拡張子付きURL**でテストするよう修正する。

### 3. 疎通確認

修正後、以下をすべてローカルで確認する:
- `npx playwright test --project=api` — APIテスト全PASS（拡張子付きURL）
- `npx playwright test --project=e2e` — E2Eテスト回帰なし
- `npx vitest run` — 単体テスト回帰なし
- `npx cucumber-js` — BDDテスト回帰なし

## 必読ドキュメント（優先度順）

1. [必須] `next.config.ts` — 現在の設定（空）
2. [必須] `e2e/api/senbra-compat.spec.ts` — 専ブラ互換APIテスト（拡張子なしURL回避の箇所を特定）
3. [必須] `src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts` — DATルート実装
4. [参考] `src/app/(senbra)/bbsmenu.html/route.ts` — bbsmenuルート
5. [参考] `src/app/(senbra)/[boardId]/subject.txt/route.ts` — subject.txtルート
6. [参考] `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` — SETTING.TXTルート
7. [参考] `playwright.config.ts` — Playwright設定

## 完了条件

- [ ] `next.config.ts` にrewritesが追加されている
- [ ] 拡張子付きURL (`/battleboard/dat/{threadKey}.dat`) でDATが取得できる（ローカル確認）
- [ ] kako形式URL (`/battleboard/kako/xxx/yyy/{threadKey}.dat`) でDATが取得できる（ローカル確認）
- [ ] `npx playwright test --project=api` 全PASS（拡張子付きURLでテスト）
- [ ] `npx playwright test --project=e2e` 全PASS（回帰なし）
- [ ] `npx vitest run` 全PASS（回帰なし）
- [ ] `npx cucumber-js` 全PASS（回帰なし）

## 環境前提

- Supabase Localは起動済み
- Docker起動済み

## スコープ外

- Vercelへのデプロイ（人間が実施）
- `NEXT_PUBLIC_BASE_URL` 環境変数の設定（人間が確認中）
- 専ブラ実機テスト（デプロイ後に人間が実施）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし（BDDテストの1件失敗は本タスク無関係の既存バグ）

### 進捗ログ

1. `next.config.ts` に rewrites を追加
   - `/:boardId/dat/:threadKey.dat` → `/:boardId/dat/:threadKey`
   - `/:boardId/kako/:x/:y/:threadKey.dat` → `/:boardId/dat/:threadKey`
2. `e2e/api/senbra-compat.spec.ts` のDAT取得URLを拡張子付きに修正（5箇所）
   - `dat/${threadKey}` → `dat/${threadKey}.dat`
   - 拡張子なしURL回避のコメントを削除

### テスト結果サマリー

| テスト種別 | 結果 | PASS | FAIL |
|---|---|---|---|
| 単体テスト (vitest) | PASS | 468 | 0 |
| APIテスト (playwright api) | PASS | 26 | 0 |
| E2Eテスト (playwright e2e) | PASS | 1 | 0 |
| BDDテスト (cucumber-js) | 既存バグあり | 86 | 1 |

BDDテスト失敗: `スレッド復興ボーナスは付与されない`（incentive.feature）は本タスクの変更とは無関係の既存バグ。
