# D-08 コンポーネント境界設計書: Admin（管理）

> ステータス: 運用中
> 関連D-07: § 3.2 AdminService / § 5.3 管理者認証

---

## 1. 分割方針

管理者操作（レス削除・スレッド削除）はセキュリティ上の分離が必要なため、一般ユーザー向けのコンポーネントと明確に境界を引く。管理者認証はAuthServiceに委譲するが、認可（「この操作を管理者だけに許可する」）はAdminServiceが担う。

MVPスコープでは管理者はシステム運営者のみ（エンドユーザーには管理権限を与えない）。

---

## 2. 公開インターフェース

```
deletePost(postId: UUID, adminId: UUID, reason?: string): void
deleteThread(threadId: UUID, adminId: UUID, reason?: string): void
```

削除はソフトデリート（`is_deleted = true` フラグを立てる）のみ。物理削除は行わない。

```
getDeletedPosts(threadId: UUID): Post[]    // 管理画面用（削除済み含む全件）
getAuditLog(limit: number): AuditLog[]     // 操作履歴
```

一般ユーザー向けAPIが `is_deleted = false` のみを返すのに対し、管理画面用クエリは削除済みを含む全件を返す。この違いはRepository層のクエリパラメータで表現する（AdminService専用のRepositoryを作るのではなく、既存PostRepository/ThreadRepositoryにフラグを渡す）。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| PostRepository | `is_deleted` フラグ更新・全件取得 |
| ThreadRepository | `is_deleted` フラグ更新 |
| AuditLogRepository | 管理操作の記録（将来: 当初は簡易実装可） |

### 3.2 被依存

```
AdminAPIRoute  →  AdminService
```

一般ユーザー向けAPIからAdminServiceへの呼び出しは禁止。

---

## 4. 隠蔽する実装詳細

- 管理者認証の実体（Supabase Auth JWTの検証）はMiddlewareで行い、AdminServiceには到達前に保証されている
- 削除済みレスの表示文字列（「このレスは削除されました」）はUIの責務。AdminServiceはフラグを立てるだけ

---

## 5. 設計上の判断

### 認証と認可の分離

AdminAPIRouteのMiddlewareが「管理者セッション（admin_session Cookie）の検証」を行い、検証済みの `adminId` をAdminServiceに渡す。AdminServiceは「渡されたadminIdが有効な管理者であること」を前提とし、再検証は行わない。Middlewareで必ず検証される保証があるため二重チェック不要。

### ソフトデリートのみ（物理削除なし）

削除後に参照整合性（accusations・bot_postsのFK等）を壊さないため、物理削除は実装しない。削除済みレスは本文を「このレスは削除されました」に置換して表示するのはUI/Adapter層の責務。
