# R-012 Attack Report

レビュアー: Red Team
日付: 2026-03-25

---

## ATK-012-1 [CRITICAL] not_admin 判定時に Supabase Auth セッションが破棄されない

### 対象コード

`src/lib/infrastructure/repositories/admin-user-repository.ts` L136–140

```ts
const adminUser = await findById(data.user.id);
if (!adminUser) {
    return { success: false, reason: "not_admin" };
}
```

### 問題

`signInWithPassword` が成功した時点で Supabase Auth 上に有効なセッション（`data.session.access_token`）が生成される。その後 `admin_users` テーブルに存在しないと判定された場合、`not_admin` を返すだけでセッションを失効させる処理（`authClient.auth.signOut()` 相当）を行っていない。

### 再現条件

1. Supabase Auth に登録済みだが `admin_users` テーブルに未登録のユーザーが `POST /api/admin/login` を呼ぶ
2. レスポンスは 401 `not_admin` になるが、Supabase Auth 上のセッションは生存したまま
3. 攻撃者はその `access_token` を直接 `verifyAdminSession` に渡すバイパス経路が存在する（ATK-012-3 参照）

### 影響

Supabase Auth のセッションが有効期限（デフォルト1時間）まで生存し続ける。セッショントークンが外部に漏洩した場合の被害窓が最大化される。また、同一ユーザーが繰り返しログインを試みると孤立セッションが蓄積される。

---

## ATK-012-2 [CRITICAL] `createAuthClient` が `SUPABASE_SERVICE_ROLE_KEY` で `signInWithPassword` を実行する

### 対象コード

`src/lib/infrastructure/repositories/admin-user-repository.ts` L34–38

```ts
function createAuthClient() {
    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    return createClient(supabaseUrl, supabaseServiceRoleKey);
}
```

### 問題

一時クライアントのキーに `SUPABASE_SERVICE_ROLE_KEY`（service_role）を使用している。`signInWithPassword` はユーザー認証のため本来 `anon` キー（または専用の Auth API キー）で行うべき操作であり、service_role キーを使う必要がない。

service_role キーを持つクライアントは RLS を完全にバイパスする。このクライアントインスタンスが `signInWithPassword` 後もスコープ内で参照可能な状態にある間、あるいは将来このクライアントを流用するコード変更が加えられた際に、RLS が無効化された状態でクエリが実行されるリスクがある。また、本実装の動機であるセッション汚染回避（ESC-TASK-198-1）は `anon` キーを持つ分離クライアントでも達成可能であり、service_role キーを用いる技術的必然性がない。

### 再現条件

- 現在: `createAuthClient()` が返すクライアントに `.from(...)` を追加するコード変更が入った場合、RLS バイパスが即座に有効化される
- セキュリティレビューなしで「セッション汚染回避」という既存コメントを根拠に流用される可能性が高い

### 影響

最小権限原則違反。service_role キーの使用範囲が本来の管理操作（`supabaseAdmin`）以外に拡大し、攻撃面が増加する。

---

## ATK-012-3 [HIGH] `POST /api/admin/login` にレート制限がなく、パスワードブルートフォースが無制限に可能

### 対象コード

`src/app/api/admin/login/route.ts` L45–102（全体）

### 問題

ログインエンドポイントにレート制限・ロックアウト・遅延処理が一切実装されていない。バリデーション（L60–72）は形式チェックのみであり、認証試行回数の制限は存在しない。

### 再現条件

```
for i in $(seq 1 10000); do
  curl -s -X POST https://example.com/api/admin/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@battleboard.test","password":"attempt_'$i'"}'
done
```

上記を実行しても 400/401 が返り続けるだけで、アカウントロックも IP ブロックも発生しない。

### 影響

管理者アカウントはシステム上唯一の特権アカウント経路であるため、ブルートフォースの成功時の影響は最大（全データアクセス・ユーザーBAN・システム設定変更等）。Supabase Auth 側のデフォルトレート制限に依存しているとしても、それはインフラ設定であり実装レベルの防御層が存在しないことに変わりはない。
