# タスクメモ: 管理者ログインページUI実装

## 概要

`/admin/login` のページUI（ログインフォーム）が存在しない。
APIエンドポイント `POST /api/admin/login` は実装済みだが、ブラウザからログインする手段がない。

## 現状の問題

1. `AdminLayout`（`src/app/(web)/admin/layout.tsx`）が未認証時に `/admin/login` へリダイレクトする
2. `/admin/login` のページコンポーネントが存在しないため 404 になる
3. 管理者はブラウザからダッシュボードにアクセスできない

## やること

`src/app/(web)/admin/login/page.tsx` を作成する。

- メールアドレス・パスワード入力フォーム
- `POST /api/admin/login` を呼び出し、成功時に `/admin` へリダイレクト
- エラー時にメッセージ表示
- `AdminLayout` の認証ガードを **通らない** ようにする（後述）

## 設計上の注意点

### AdminLayout の認証ガードとの競合

`AdminLayout`（`src/app/(web)/admin/layout.tsx`）は `/admin` 配下の全ページに適用される。
`/admin/login` もその子なので、ログインページ表示前に認証ガードが発動し無限リダイレクトになる。

対処案:
- **A) ログインページを別のルートグループに配置**: `src/app/(admin-login)/admin/login/page.tsx` にして `AdminLayout` の外に出す
- **B) AdminLayout 内でパス判定して `/admin/login` をスキップ**: Next.js の layout では現在パスの取得が難しいため非推奨
- **C) middleware.ts でリダイレクト制御**: middleware で `/admin/login` を除外し、layout のガードを middleware に移す

## 参照

- BDDシナリオ: `features/authentication.feature` > 管理者ログイン（メール + パスワード）セクション
- API実装: `src/app/api/admin/login/route.ts`
- 認証ガード: `src/app/(web)/admin/layout.tsx`
- 管理者認証フロー: `docs/architecture/components/authentication.md §2.3`
