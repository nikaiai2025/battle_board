---
task_id: TASK-303
sprint_id: Sprint-112
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T14:00:00+09:00
updated_at: 2026-03-24T14:00:00+09:00
locked_files:
  - "src/app/(web)/admin/layout.tsx"
  - "src/app/(web)/layout.tsx"
---

## タスク概要

管理画面の表示に2つの問題がある。いずれもルートグループ構造に起因する。

1. **テーマ漏れ**: 一般ユーザーが設定した色テーマ（`bb-theme` Cookie）が管理画面にも適用されてしまう。管理画面は運営ツールなのでデフォルトテーマ固定にすべき。
2. **不要なHeader表示**: 一般ユーザー向けのHeader（ログイン・マイページリンク）が管理画面にも表示される。管理画面は独自のヘッダー・ナビを持っているため不要。

原因: `/admin/*` が `(web)` ルートグループの内側にネストされており、`(web)/layout.tsx` のテーマ適用とHeader描画が管理画面にも伝播している。

## 修正方針

`(web)/layout.tsx` 側で管理画面パスを判定してHeader/テーマを分岐させるのは App Router の設計に反する。
以下の **いずれかの方針** で修正する（ワーカーAIが最適と判断した方法でよい）:

**方針A: admin/layout.tsx でオーバーライド**
- テーマ: admin/layout.tsx の最外側 div にデフォルトテーマのCSSクラスを明示付与し、背景色等を上書きする
- Header: CSS で親レイアウトのHeaderを非表示にする（`:has()` セレクタ等）、または admin/layout.tsx 内でJSから非表示にする

**方針B: 管理画面を (web) ルートグループの外に移動**
- `src/app/(admin)/admin/` ルートグループを新設し、管理画面ページを移動
- `(admin)/layout.tsx` にテーマ固定・Header なしのレイアウトを定義
- 既存の `(admin-public)/admin/login/` はそのまま
- ファイル移動が多いが構造としては最もクリーン

**判断基準**: どちらでもテストが全件PASSすること。

## 必読ドキュメント

1. [必須] `src/app/(web)/layout.tsx` — 親レイアウト（テーマ適用 + Header描画の箇所）
2. [必須] `src/app/(web)/admin/layout.tsx` — 管理画面レイアウト
3. [参考] `src/app/(web)/_components/Header.tsx` — 非表示にしたいHeaderコンポーネント

## 完了条件

- [ ] 管理画面（/admin/*）にユーザーテーマが適用されない（常にデフォルトテーマ）
- [ ] 管理画面（/admin/*）に一般ユーザー向けHeader（ログイン・マイページバー）が表示されない
- [ ] 一般ユーザー側のテーマ機能・Header表示に影響がない
- [ ] `npx vitest run` 全体でリグレッションなし
- [ ] `npx cucumber-js` でリグレッションなし
- [ ] テストコマンド: `npx vitest run` && `npx cucumber-js`

## スコープ外

- テーマ機能自体の変更
- BDDシナリオの変更
- 管理画面の見た目・デザインの変更（テーマ固定+Header除去のみ）

## 作業ログ

### チェックポイント

- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 方針Bを採用: `src/app/(admin)/` ルートグループを新設し、管理画面ページを移動
- `src/app/(admin)/admin/layout.tsx` を新規作成（テーマ固定・Header なし）
- `src/app/(admin)/admin/` 配下の全ページ（page.tsx, users/page.tsx, users/[userId]/page.tsx, threads/page.tsx, ip-bans/page.tsx）をコピー
- `src/app/(web)/admin/` をゴミ箱に移動（`ゴミ箱/web_admin_TASK303`）
- 方針Bにより、`(web)/layout.tsx` のテーマ適用・Header 描画が管理画面に伝播しない構造になった

### テスト結果サマリー

- `npx vitest run`: 91ファイル / 1769テスト PASS（リグレッションなし）
- `npx cucumber-js`: 341シナリオ（325 passed / 16 pending）PASS（pendingは変更前から存在）

#### 本番スモークテスト（bdd-smoke / Sprint-112 TASK-303）

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/34（5 skipped: ローカル限定テスト） |
| 所要時間 | 55.3s |
| 失敗テスト | なし |

- デプロイ確認: 最新デプロイ `2026-03-24T01:17:14Z` はコミット（JST 10:15）以降であることを確認
- 対象URL: `https://battle-board.shika.workers.dev`
- 管理画面系（/admin、/admin/users、/admin/users/[userId]、/admin/ip-bans）: 全4テスト PASS
- スキップ5件は `isProduction=true` 時の `test.skip` によるローカル限定テスト（期待動作）
