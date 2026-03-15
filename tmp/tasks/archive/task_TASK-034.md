---
task_id: TASK-034
sprint_id: Sprint-14
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-14T19:00:00+09:00
updated_at: 2026-03-14T19:00:00+09:00
locked_files:
  - "src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts"
  - "[NEW] src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts"
  - "next.config.ts"
  - "e2e/api/senbra-compat.spec.ts"
---

## タスク概要

専ブラ互換DATエンドポイントが本番環境（Vercel）で404になる問題の根本修正。
App Routerのフォルダ名 `[threadKey].dat` から拡張子を除去し `[threadKey]` にリネームする。
`next.config.ts` のrewritesで専ブラからの `.dat` 付きURLを拡張子なしルートに転送する。

## 背景

Sprint-14で `next.config.ts` にrewritesを追加したが、リライト先の `/:boardId/dat/:threadKey`（拡張子なし）に対応するApp Routerフォルダが存在しなかった（実際のフォルダは `[threadKey].dat`）。Vercel本番では厳密マッチのため404が継続している。

## 修正内容

### 1. フォルダリネーム

```
変更前: src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts
変更後: src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts
```

- `route.ts` の中身は変更不要（パスパラメータ名 `threadKey` は同一）
- 旧フォルダ `[threadKey].dat/` は削除する

### 2. `next.config.ts` のrewrites確認

既にSprint-14で追加済みの以下のrewritesが正しく機能するようになるはず:

```typescript
{ source: "/:boardId/dat/:threadKey.dat", destination: "/:boardId/dat/:threadKey" },
{ source: "/:boardId/kako/:x/:y/:threadKey.dat", destination: "/:boardId/dat/:threadKey" },
```

rewritesの内容自体は変更不要のはず。動作確認の結果、修正が必要なら修正すること。

### 3. APIテスト確認

`e2e/api/senbra-compat.spec.ts` はSprint-14で拡張子付きURL（`.dat`）に修正済み。rewriteが正しく機能すれば、そのままPASSするはず。もし失敗する場合はテストコードを修正する。

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts` — 移動対象のroute実装
2. [必須] `next.config.ts` — 現在のrewrites設定
3. [必須] `e2e/api/senbra-compat.spec.ts` — APIテスト
4. [参考] `src/app/(senbra)/__tests__/route-handlers.test.ts` — 単体テスト（importパスに影響ある可能性）

## 完了条件

- [ ] `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` が存在する
- [ ] `src/app/(senbra)/[boardId]/dat/[threadKey].dat/` が削除されている
- [ ] `npx playwright test --project=api` 全PASS（拡張子付きURL `.dat` でアクセス）
- [ ] `npx playwright test --project=e2e` 全PASS（回帰なし）
- [ ] `npx vitest run` 全PASS（回帰なし）
- [ ] `npx cucumber-js` 回帰なし

## スコープ外

- Vercelデプロイ（人間が実施）
- 専ブラ実機テスト（デプロイ後に人間が実施）
- `subject.txt` / `SETTING.TXT` / `bbsmenu.html` のフォルダ構成変更（現時点で問題未確認）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [セッション1] 新フォルダ `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` を作成（旧フォルダからコピー）
- [セッション1] 旧フォルダ削除を人間に依頼（rm -rf フック制限のため）
- [セッション2] 旧フォルダ削除済みを確認
- [セッション2] `route-handlers.test.ts` の import パスを `[threadKey].dat/route` → `[threadKey]/route` に更新
- [セッション2] コメント行の旧パス記述も更新
- [セッション2] 全テスト実行して全 PASS を確認

### テスト結果サマリー

| テストスイート | 結果 | 件数 |
|---|---|---|
| `npx vitest run` | PASS | 468 tests / 15 files |
| `npx cucumber-js` | PASS | 87 scenarios / 419 steps |
| `npx playwright --project=e2e` | PASS | 1 test |
| `npx playwright --project=api` | PASS | 26 tests |

- 専ブラ互換APIテスト（senbra-compat.spec.ts）の `.dat` URL アクセスを含む全 26 件が PASS
- rewrites 経由で `/{boardId}/dat/{threadKey}.dat` → `/{boardId}/dat/{threadKey}` のルーティングが正常動作を確認
