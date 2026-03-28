# ATK-012-2 セキュリティアセスメント — 管理者ログインでservice_roleキー使用

作成日: 2026-03-25
担当: bdd-architect

---

## 1. コード調査結果

### 対象実装

`src/lib/infrastructure/repositories/admin-user-repository.ts` の `createAuthClient()`

```typescript
function createAuthClient() {
    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    return createClient(supabaseUrl, supabaseServiceRoleKey);
}
```

この関数で生成したクライアントを `loginWithPassword` 内で `signInWithPassword` 専用に使用している。クエリ（`admin_users` テーブルへのアクセス）は別インスタンス `supabaseAdmin` を経由する `findById()` が担う。

### 既存の代替実装

`src/lib/infrastructure/supabase/client.ts` に `createAuthOnlyClient()` が定義されている。

```typescript
export function createAuthOnlyClient() {
    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
```

- 使用キー: `anon`（RLS適用）
- `persistSession: false, autoRefreshToken: false` でセッション汚染を防止
- 他のユースケース（`registration-service.ts`、`src/app/api/auth/confirm/route.ts`）ではすでにこちらを採用済み

---

## 2. service_roleキーの必要性判断

### Supabase Auth APIの仕様

`signInWithPassword` はエンドユーザーの認証を行うAPIであり、`anon`キーで呼び出すことが設計上の前提である。`service_role`キーで呼ぶ必要性はない。

- 認証APIはRLS制御対象外であり、どちらのキーで呼んでも動作は同一
- `service_role`キーは主にRLS適用下のDB操作をバイパスするために使うものであり、Auth APIには不要

### なぜ `service_role` が選ばれたか（経緯）

`escalation_ESC-TASK-198-1.md` によると、もともと `supabaseAdmin`（service_roleシングルトン）で `signInWithPassword` を呼んでいたことによるセッション汚染バグの修正として、「認証用の別クライアントを作る」選択肢Aが採用された。この際に選択肢Aのサンプルコード（`createClient(supabaseUrl, supabaseServiceRoleKey)`）がそのまま実装された。`createAuthOnlyClient()` が既存だったにもかかわらず参照されなかった。

### 現状のセキュリティリスク評価

`signInWithPassword` だけに使用している限り、service_roleキーがDB操作の権限昇格に直結はしない。ただし以下の懸念が存在する:

1. **将来リスク**: `createAuthClient()` が返すクライアントにservice_roleがセットされた状態で、誰かが `.from(...)` 等のDBクエリを追加するとRLSを完全にバイパスする
2. **最小権限原則違反**: `signInWithPassword` の実行に service_role は不要。必要以上の権限を持ったクライアントを生成している
3. **コードの一貫性欠如**: 同一の目的（signInWithPassword用の使い捨てクライアント）に対し、他の箇所では `createAuthOnlyClient()`（anonキー）を使っているが、管理者認証のみ異なるキーを使っており保守性が低い

---

## 3. 判定

**対応推奨**

現時点でアクティブな脆弱性ではないが、最小権限原則の違反であり、既存の統一パターン（`createAuthOnlyClient()`）に沿った修正が低コストで可能なため、対応を推奨する。

### 修正方針

`admin-user-repository.ts` の `createAuthClient()` を削除し、既存の `createAuthOnlyClient()` に置き換える。

```typescript
// 修正前
import { createClient } from "@supabase/supabase-js";
// ...
function createAuthClient() { ... } // service_roleキーを使用

// 修正後
import { createAuthOnlyClient } from "../supabase/client";
// createAuthClient() を削除し、loginWithPassword 内で createAuthOnlyClient() を呼ぶ
```

`signInWithPassword` はanonキーでも動作するため、機能変更はない。`createClient` の直接importも不要になる。

### 対応優先度

低〜中（リリースブロッカーではないが、次スプリントでの解消を推奨）

---

## 4. 補足

- `findById()` が引き続き `supabaseAdmin`（service_role）を使うことは適切。`admin_users` テーブルへのアクセスにはRLSバイパスが必要なため
- セッション汚染対策（使い捨てクライアントの生成）という方針自体は正しく、変更は不要
