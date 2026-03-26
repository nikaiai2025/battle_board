# R-006 Attack Report

レビュアー: Red Team
対象: ユーザー管理（一覧/詳細/書き込み履歴）

---

## ATK-006-1

**重大度**: CRITICAL

**問題の要約**: ユーザー一覧APIがシナリオの要求する「通貨残高」フィールドを返さない。テストもそれを検証しない。

**詳細**:

シナリオ「管理者がユーザー一覧を閲覧できる」の Then 節は「各ユーザーのID、登録日時、ステータス、**通貨残高**が表示される」と明記している。

実装では `AdminService.getUserList()` が `UserRepository.findAll()` に委譲し、`User[]` を返す（`admin-service.ts:456-464`）。`User` インターフェース（`src/lib/domain/models/user.ts`）に `balance` フィールドは存在しない。通貨残高を取得する `getBalance()` 呼び出しは一切行われていない。

ステップ定義側のアサート（`admin.steps.ts:1603-1626`）も実際には `id`, `createdAt`, `isPremium` の3フィールドのみ確認し、`balance` の検証を「通貨残高は CurrencyService 経由で確認」というコメントとともに省略している。結果としてテストはグリーンになるが、管理画面は通貨残高を表示できない。

**再現条件**:

`GET /api/admin/users` レスポンスの各ユーザーオブジェクトを確認する。`balance` キーが存在しないことで確認できる。任意のユーザーが通貨を保有していても一覧画面には表示されない。

---

## ATK-006-2

**重大度**: CRITICAL

**問題の要約**: シナリオが要求する「スレッド名」がテストでは `threadId` の存在確認にすり替えられており、実際の振る舞いを検証していない。

**詳細**:

シナリオ「管理者がユーザーの書き込み履歴を確認できる」の Then 節は「各書き込みの**スレッド名**、本文、書き込み日時が含まれる」と定義している。

`Post` インターフェース（`src/lib/domain/models/post.ts`）には `threadName`（あるいは `threadTitle`）フィールドが存在しない。`PostRepository.findByAuthorId` は `posts` テーブルの `SELECT *` のみで `threads` テーブルを JOIN しない（`post-repository.ts:235-246`）。したがって `getUserDetail()`（`admin-service.ts:483`）および `getUserPosts()`（`admin-service.ts:516`）が返す `Post[]` にスレッド名は含まれない。

ステップ定義（`admin.steps.ts:1861-1867`）は `post.threadId` の truthy チェックのみで「スレッド名が含まれる」アサーションを代替している。`threadId` は UUID であり「スレッド名」ではないため、シナリオの受け入れ基準を満たしていない。テストはグリーンだが、管理画面ではスレッド名を表示できない。

**再現条件**:

`AdminService.getUserDetail(userId)` の戻り値 `posts[n]` をダンプする。`threadId`（UUID）は存在するが、スレッドのタイトル文字列は含まれていない。管理画面UIがこの `posts` をそのままレンダリングすればスレッド名列が空になる。

---

## ATK-006-3

**重大度**: HIGH

**問題の要約**: `GET /api/admin/users/[userId]/posts` は存在しない userId に対して 404 を返さず、`limit` に非数値を与えると上限チェックが無効化されてリポジトリに `NaN` が伝播する。

**詳細**:

**問題 A（ユーザー不在時の誤レスポンス）**:
`AdminService.getUserPosts()` はユーザー存在確認を行わない（`admin-service.ts:511-519`）。存在しない userId を渡すと `PostRepository.findByAuthorId()` が空配列 `[]` を返し、APIは HTTP 200 `{ posts: [], limit: 50, offset: 0 }` を返す。`/api/admin/users/[userId]/route.ts` とは異なり、`/api/admin/users/[userId]/posts/route.ts` には 404 を返す処理がない（`posts/route.ts:44-62`）。管理者が存在しない userId に対して操作中であっても、APIは成功応答を返し続ける。

**問題 B（NaN によるバリデーション迂回）**:
`posts/route.ts:54-57` の `limit` 計算は `Math.min(parseInt("abc", 10), 200)` = `Math.min(NaN, 200)` = `NaN` を生成する。`Math.min` は一方のオペランドが `NaN` の場合 `NaN` を返す。この `NaN` が `getUserPosts()` を経由して `PostRepository.findByAuthorId()` の `limit` に渡ると、`.range(0, NaN - 1)` = `.range(0, NaN)` が Supabase クライアントに発行される。Supabase クライアントの挙動によっては全レコードを返す（上限なし）か、型エラーで 500 になるかのどちらかになる。同様の問題は `/api/admin/users/route.ts:44-47` の `limit` 計算にも存在する（`route.ts:44-47`）。

**再現条件**:

- A: `GET /api/admin/users/00000000-0000-0000-0000-000000000000/posts`（存在しない UUID）→ 404 ではなく 200 `{ posts: [] }` が返る。
- B: `GET /api/admin/users/{任意の有効 userId}/posts?limit=abc` → `limit` が `NaN` になり、Supabase への `.range()` クエリが異常値で実行される。
