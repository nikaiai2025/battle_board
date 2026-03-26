# R-006 Defense Report

レビュアー: Blue Team
対象: ユーザー管理（一覧/詳細/書き込み履歴）

---

## ATK-006-1

**問題ID**: ATK-006-1
**判定**: ACCEPT

**根拠**:

指摘の通り。`getUserList()` は `UserRepository.findAll()` が返す `User[]` をそのままレスポンスにしており（`admin-service.ts:456-463`）、`User` インターフェース（`src/lib/domain/models/user.ts`）に `balance` フィールドは存在しない。`getBalance()` の呼び出しは `getUserList()` の内部に一切ない。

ステップ定義（`admin.steps.ts:1603-1626`）のアサートも `user.id`, `user.createdAt`, `user.isPremium` の3フィールドのみを確認しており、`balance` の検証はコメント「通貨残高は CurrencyService 経由で確認（一覧APIでは別途取得）」として省略されている。

BDDシナリオの Then 節「各ユーザーのID、登録日時、**ステータス**、**通貨残高**が表示される」に対し、`balance` は返却されておらず、テストもそれを検証していない。本番では管理画面のユーザー一覧に通貨残高が表示できない。

---

## ATK-006-2

**問題ID**: ATK-006-2
**判定**: ACCEPT

**根拠**:

`Post` インターフェース（`src/lib/domain/models/post.ts`）は `threadId: string` を持つが、スレッドのタイトル文字列を示すフィールドは存在しない。`PostRepository.findByAuthorId` が `threads` テーブルを JOIN しないため、`getUserDetail()`・`getUserPosts()` が返す `Post[]` にスレッド名は含まれない。

ステップ定義（`admin.steps.ts:1861-1868`）のアサートは `post.threadId` の truthy チェックのみであり、スレッドのタイトル文字列の存在を検証していない。BDDシナリオの Then 節「各書き込みの**スレッド名**、本文、書き込み日時が含まれる」に対し、スレッド名は返却されておらず、テストもそれを検証できていない。

本番では管理画面の書き込み履歴にスレッド名列が表示できない。

---

## ATK-006-3

**問題ID**: ATK-006-3
**判定**: REJECT（問題A）/ ACCEPT（問題B）

**根拠（問題A — ユーザー不在時の誤レスポンス）**:

この指摘はREJECTとする。

BDDシナリオ「管理者がユーザーの書き込み履歴を確認できる」は「存在しない userId に対して 404 を返す」振る舞いを受け入れ基準として定義していない。シナリオのスコープは「存在するユーザーの履歴取得が正しく行われること」であり、存在しない userId に対する 404 レスポンスはシナリオ外の振る舞いである。

また、`/api/admin/users/[userId]/route.ts` は `getUserDetail()` が null を返した場合に 404 を返す（`[userId]/route.ts:49-51`）。`/posts` エンドポイントとの非対称性は設計上の不整合ではあるが、管理者UIの通常フローでは詳細ページ（`/users/[userId]`）から書き込み履歴ページ（`/users/[userId]/posts`）へ遷移するため、存在しない userId が `/posts` エンドポイントに到達する操作上の経路が限定的である。データ損失・セキュリティ侵害・サービス停止のいずれにも該当せず、空配列 `[]` が返るのみで誤動作は生じない。

**根拠（問題B — NaN によるバリデーション迂回）**:

この指摘はACCEPTとする。

`posts/route.ts:54-57` の実装は以下の通りである。

```typescript
const limit = Math.min(
    Number.parseInt(searchParams.get("limit") ?? "50", 10),
    200,
);
```

`Number.parseInt("abc", 10)` は `NaN` を返す。`Math.min(NaN, 200)` は `NaN` を返す（ECMAScript仕様: オペランドに NaN が含まれる場合は NaN）。この `NaN` は `getUserPosts()` を経由して `PostRepository.findByAuthorId()` の `limit` に渡される。Supabase クライアントの `.range(0, NaN - 1)` は `.range(0, NaN)` となり、上限なし取得または 500 エラーを引き起こす可能性がある。

同様の問題は `/api/admin/users/route.ts:44-47` の `limit` 計算にも存在する。`isNaN()` チェックまたはフォールバック値（`Number.isNaN(parsed) ? 50 : parsed`）が欠けており、テストでこの入力条件は検証されていない。本番でクエリパラメータに非数値を渡すことは現実的に発生しうる（誤ったクライアント実装、手動テスト、悪意ある入力）。
