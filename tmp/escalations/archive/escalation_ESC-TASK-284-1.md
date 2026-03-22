---
escalation_id: ESC-TASK-284-1
task_id: TASK-284
status: open
created_at: 2026-03-23T07:00:00+09:00
---

# エスカレーション: ログインページの無限リダイレクト解決策の選択

## 問題の内容

`/admin/login` ページを `src/app/(web)/admin/login/page.tsx` に配置する場合、`src/app/(web)/admin/layout.tsx` の認証ガードが必ず実行されます。セッションがない状態でアクセスすると `/admin/login` にリダイレクトされ、再度レイアウトが実行されて無限ループになります。

### 調査結果

タスクメモ案Bの「layout内でパス判定してスキップ」を試みましたが、Next.js App Router の Server Component レンダリング時に URL のパス情報を取得できるAPIが公式に存在しません:

- `headers()` はHTTPリクエストヘッダーのみ（パス情報なし）
- `next-url` ヘッダーは App Router クライアントサイドナビゲーション（`router.push()` 等）の際のみ送信され、通常のブラウザ直接アクセス（initial page load）では存在しない
- `pathname.js` は Next.js 内部 API（`createServerPathnameForMetadata`）で直接使用不可

## 選択肢と各選択肢の影響

### 案A: ログインページを別ルートグループに配置（推奨・タスクメモ推奨）

ファイルパス: `src/app/(admin-public)/admin/login/page.tsx`

- 効果: `(web)/admin/layout.tsx` が適用されず、無限リダイレクトが発生しない
- 影響: locked_files の `[NEW] src/app/(web)/admin/login/page.tsx` とは異なるパスになる
- 必要なファイル変更:
  - `src/app/(admin-public)/admin/login/page.tsx` — 新規作成（locked_files 外）
  - `src/app/(web)/admin/layout.tsx` — `next-url` 判定のコードを削除して元に戻す

### 案C: middleware.ts でリダイレクト制御

ファイルパス: `src/middleware.ts`

- 効果: middleware で `/admin/login` を除外し、`AdminLayout` の認証ガードは middleware に移管
- 影響:
  - `src/middleware.ts` の新規作成（locked_files 外）
  - `src/app/(web)/admin/layout.tsx` の認証ガードを削除または変更
  - middleware への認証ロジック移管は影響範囲が広い

### 現在の実装（案B 変形）の問題

現在は `headers().get('next-url')` でパス判定を試みていますが、通常のブラウザアクセス時は `next-url` ヘッダーが存在しないため、無限リダイレクトが解決されません。

## 確認事項

以下のいずれかを人間に決定していただく必要があります:

1. **案A を採用**: `src/app/(admin-public)/admin/login/page.tsx` に作成する。locked_files の `[NEW] src/app/(web)/admin/login/page.tsx` は案Aのパスに読み替えてよい
2. **案C を採用**: `src/middleware.ts` を新規作成して認証ガードを middleware に移す。locked_files に `src/middleware.ts` を追加する
3. **別の案**: 人間が別の解決策を提案する

## 関連ファイル・シナリオ

- `features/authentication.feature` @管理者が正しいメールアドレスとパスワードでログインする
- `features/authentication.feature` @管理者が誤ったパスワードでログインすると失敗する
- `src/app/(web)/admin/layout.tsx`
- `tmp/task_memo_admin_login_page.md`
