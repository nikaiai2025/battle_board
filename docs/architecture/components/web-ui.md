# D-08 コンポーネント境界設計書: Web UI

> ステータス: ドラフト / 2026-03-08
> 関連D-07: § 3.1 Presentation Layer（Web UI）

---

## 1. 分割方針

Next.js App Router の Server Components / Client Components の境界設計と、データ取得方式（SSR直接クエリ / APIルート経由）の使い分け方針を定める。

Web UIはビジネスロジックを持たない。データ取得・変更はすべてAPIルート（自身の `app/api/` 配下）を経由するのが原則だが、以下の例外がある。

**例外: 認証不要のGET系Server Component**（スレッド一覧・スレッド閲覧）は、Cloudflare Workers環境でのself-fetch禁止（error code 1042）制約により、サービス層を直接インポートしてデータを取得する。この場合、`export const dynamic = 'force-dynamic'` を設定してリクエストごとにSSRを実行する。
See: docs/architecture/architecture.md §13 TDR-006

---

## 2. SSR / CSR / Server Actions の使い分け方針

| 画面・操作 | 方式 | 理由 |
|---|---|---|
| スレッド一覧表示 | SSR (Server Component) | SEO・初期表示速度。PostService.getThreadList() を直接呼び出し（`export const dynamic = 'force-dynamic'` でキャッシュ無効化）。Cloudflare Workers制約によりAPIルート経由は不可 |
| スレッド閲覧（レス一覧） | SSR + クライアント側ポーリング | 初期表示はSSR。新着レスはクライアント側で定期fetch |
| 書き込みフォーム | Client Component + APIルートPOST | edgeToken Cookieを含むPOSTが必要なためクライアントサイド |
| 認証コード入力フォーム | Client Component + APIルートPOST | 同上 |
| マイページ（残高・履歴） | SSR（認証チェック後） | ユーザー固有情報のため認証必須。CSRでの表示は行わない |
| 管理画面 | SSR（admin_session検証後） | Middlewareでadmin_sessionを検証してからページを表示 |

### Server ComponentのデータアクセスパターンとCloudflare Workers制約

**原則**: 認証が必要なServer Componentは引き続きAPIルート経由のfetchを使用する。
- 認証ロジック（edgeToken / admin_session の検証）をAPIルートのMiddlewareに集約できる
- 将来的にモバイルアプリや外部クライアントが同じAPIを使える

**例外（Cloudflare Workers制約による変更）**: 認証不要のGET系Server ComponentはPostServiceを直接importしてデータを取得する。
- Cloudflare Workers環境ではWorker自身の外部URLへのfetchがerror code 1042（自己参照ループ禁止）でブロックされるため、Server ComponentからAPIルートへのfetchが動作しない
- GET系のスレッド一覧・スレッド閲覧はこの例外に該当する
- POST系操作（書き込み・認証）は引き続きClient ComponentからAPIルート経由で行う（Cloudflare制約の影響なし）
- See: docs/architecture/architecture.md §13 TDR-006

---

## 3. コンポーネント境界（画面単位）

### 3.1 スレッド一覧ページ

```
app/(web)/page.tsx  [Server Component]
  └── ThreadList [Server Component]  // スレッドデータを受け取りレンダリング
        └── ThreadCard [Server Component]  // 1スレッドの表示
```

データ取得：PostService.getThreadList() 直接呼び出し（`export const dynamic = 'force-dynamic'` でキャッシュ無効化）

### 3.2 スレッドページ

```
app/(web)/threads/[threadId]/page.tsx  [Server Component]  // 初期レス群をSSR
  └── PostList [Server Component]     // 初期表示
  └── PostListLiveWrapper [Client Component]  // ポーリングで新着取得
        └── PostItem [共用]           // 1レスの表示
  └── PostForm [Client Component]     // 書き込みフォーム
        └── AuthModal [Client Component]  // 認証コード入力（未認証時）
```

**ポーリング方式**: 定期的な `GET /api/threads/{threadId}/posts?since={lastPostId}` で新着レスを取得。WebSocketは使用しない（Serverless環境の制約・初期フェーズでは不要）。

### 3.3 マイページ

```
app/(web)/mypage/page.tsx  [Server Component]
  └── BalanceDisplay    // 通貨残高
  └── IncentiveHistory  // ボーナス履歴
```

### 3.4 管理画面

```
app/(web)/admin/page.tsx  [Server Component]  // Middlewareでadmin_session検証済み
  └── PostModeration    // レス一覧（削除済み含む）
  └── ThreadModeration  // スレッド一覧
```

---

## 4. 認証フロー（UI観点）

書き込みAPIが `authRequired` を返した場合：
1. PostFormが `authRequired` レスポンスを受け取る
2. AuthModalを表示（6桁コード入力UI）
3. ユーザーがコードを入力 → `POST /api/auth/auth-code` を呼び出し
4. 成功したら書き込みをリトライ（edgeTokenがCookieにセットされた状態）

---

## 5. 依存関係

### 5.1 依存先（APIルート）

Web UIコンポーネントは原則としてAPIルートのみに依存する。ただし、認証不要のGET系Server Component（スレッド一覧・スレッド閲覧）は例外として、Cloudflare Workers制約（error code 1042: self-fetch禁止）のためPostServiceを直接インポートしてデータを取得する。POST系操作（書き込み・認証）はClient ComponentからAPIルート経由で行う。

```
app/(web)/  →  app/api/posts/route.ts
            →  app/api/threads/route.ts
            →  app/api/auth/auth-code/route.ts
            →  app/api/admin/*/route.ts
```

---

## 6. 設計上の判断

### BOTマーク表示

Web UIでは絵文字（🤖）をそのまま表示する。DAT出力では `[BOT]` に置換するが（Shift_JIS変換不可のため）、Web UIは絵文字を使用する。この分岐はDatFormatterが担い、Web UIは関与しない。

### `dangerouslySetInnerHTML` 使用禁止

セキュリティ制約（D-07 § 10.3）によりReactの標準エスケープを使用する。本文の改行表現は `<br>` ではなくCSSの `white-space: pre-wrap` で対応する。
