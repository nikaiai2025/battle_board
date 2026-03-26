# R-008 攻撃レポート

レビュアー: Red Team
日付: 2026-03-25

---

## ATK-008-1

**重大度**: CRITICAL

**問題の要約**: APIルートで `result.reason` の分岐後に `return` がなく、`not_found` の場合でも `{ success: true }` が返る。

**詳細**:
`src/app/api/admin/users/[userId]/premium/route.ts` の PUT ハンドラ（行 68〜75）および DELETE ハンドラ（行 140〜147）に同一のバグがある。

```typescript
if (!result.success) {
    if (result.reason === "not_found") {
        return NextResponse.json(
            { error: "指定されたユーザーが見つかりません" },
            { status: 404 },
        );
    }
}

return NextResponse.json({ success: true });  // ← 到達しない想定だが...
```

`SetPremiumStatusResult` の `reason` は現在 `"not_found"` のみだが、将来 `reason` が追加された場合（例: `"already_premium"`）は内側の `if` が false になり、外側の `if(!result.success)` を抜けて `return NextResponse.json({ success: true })` に到達する。これは現在のコードでも型システム上は合法であり、TypeScript のコンパイルエラーにならない。

より直接的な問題として: 現在でも `!result.success` が true であり `result.reason === "not_found"` が true であっても、内側の `return` が正しく実行されているかどうかはコンパイラが保証しない構造になっており、リファクタリングで内側の条件を緩和した瞬間にサイレントに `200 { success: true }` が返るようになる。PUT: `route.ts:68-77`, DELETE: `route.ts:140-149`。

**再現条件**:
`SetPremiumStatusResult` に `not_found` 以外の `reason` を追加した場合、存在しないユーザーIDに対するリクエストで 404 ではなく 200 `{ success: true }` が返る。

---

## ATK-008-2

**重大度**: CRITICAL

**問題の要約**: BDDテストはAPIルートを経由せずサービス層を直呼びしており、APIルートの認証バイパスが検証されない。

**詳細**:
`features/step_definitions/admin.steps.ts:2183-2203` の When ステップは `AdminService.setPremiumStatus` を直接呼び出す。APIルート（`route.ts`）は一切経由しない。

一方、`route.ts` の認証ロジック（`verifyAdminSession`）はシナリオが意図する「管理者がログイン済みである」前提を全く検証していない。具体的には:

- BDDテストは `this.currentAdminId` に管理者IDを直接セットし（`admin.steps.ts:93`）、Cookieによるセッション検証を完全にスキップする
- APIルートの Cookie 検証（`route.ts:46-59`）は一度もBDDテストで実行されない
- したがって、Cookie 無し・空文字・不正トークンでのリクエストが 403 を返すかどうか、BDDシナリオは何も保証しない

シナリオ「管理者がログイン済みである」「ユーザーを有料ステータスに変更する」がグリーンになっても、実際の HTTP エンドポイントは `admin_session` Cookie なしのリクエストに対し正常に 200 を返す可能性がある（別のバグが存在すれば）。テストがグリーンであることとAPIの安全性が切り離されている。

**再現条件**:
`route.ts` の `verifyAdminSession` 呼び出しを削除するかコメントアウトしても、BDDテストは引き続きグリーンになる。APIルートへの実際のHTTPリクエストをテストしない限り、認証バイパスは検出できない。

---

## ATK-008-3

**重大度**: HIGH

**問題の要約**: `setPremiumStatus` は DB の現在状態を確認せずに無条件で `updateIsPremium` を実行するため、`findById` と `updateIsPremium` の間の競合状態でユーザー削除が検知されない。

**詳細**:
`src/lib/services/admin-service.ts:558-565` の実装:

```typescript
const user = await UserRepository.findById(userId);   // (1) 存在確認
if (!user) {
    return { success: false, reason: "not_found" };
}
await UserRepository.updateIsPremium(userId, isPremium);  // (2) 更新
```

(1) と (2) の間にユーザーレコードが物理削除（または将来実装される論理削除）された場合、`updateIsPremium` は存在しないレコードに対して UPDATE を実行する。本番の `user-repository.ts` はこの UPDATE の影響行数を検証していない（実装を確認する必要はないが、Supabase の `.update()` はマッチゼロでもエラーにならない）。

インメモリ実装（`features/support/in-memory/user-repository.ts:193-198`）は `store.get(userId)` が null の場合にサイレントに何もしない（`if (user) { ... }` の構造）。本番実装も同様の挙動をとる場合、`success: true` を返しながらデータが更新されないという結果不整合が生じる。

加えて、単体テスト（`src/__tests__/lib/services/admin-premium.test.ts`）は `updateIsPremium` の戻り値を検証せず（行 137, 171）、UPDATE が0行を更新しても `result.success === true` を返すことをテストが検出できない構造になっている。

**再現条件**:
管理者が `setPremiumStatus` を呼び出す直前に対象ユーザーが削除された場合（並行リクエスト、または将来のユーザー削除機能実装時）。
