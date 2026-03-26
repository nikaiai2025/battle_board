# R-003 防御レポート（Blue Team）

レビュー対象: PAT（専ブラ連携トークン）の発行・認証・再発行フロー

---

## ATK-R003-1

**問題ID**: ATK-R003-1
**判定**: REJECT

**根拠**:

攻撃者の主張は「`loginWithPat()` が BAN チェックなしに edge-token を発行するため、BAN ユーザーが書き込めてしまう」というものだが、書き込みの最終的な拒否は `PostService.createPost()` の Step 2b で確実に行われている。

`post-service.ts:380-394` に以下のコードが存在する:

```typescript
// Step 2b: ユーザーBAN チェック（認証後）
if (!input.isBotWrite && authResult.userId) {
    const userBanned = await AuthService.isUserBanned(authResult.userId);
    if (userBanned) {
        return {
            success: false,
            error: "このアカウントは書き込みが禁止されています",
            code: "USER_BANNED",
        };
    }
}
```

PAT 認証フローを辿ると:
1. `route.ts` の ② パスで `loginWithPat()` が呼ばれ、新しい edge-token が発行される
2. その edge-token は `parsedWithToken.edgeToken` にセットされて `handleCreatePost()` に渡される
3. `handleCreatePost()` は `PostService.createPost()` を呼ぶ
4. `createPost()` の Step 2 で `resolveAuth()` が呼ばれ、Step 2b でユーザー BAN チェックが実行される

`loginWithPat()` が edge-token を発行するのは認証層（identity confirmation）の責務であり、BAN チェックは書き込み処理層（PostService）の責務として明確に分離されている。攻撃者が「BAN チェックが完全に抜け落ちる」と述べているのは、`loginWithPat()` という認証関数のみを見て、その後に続く `PostService` の処理を確認していないことによる誤認である。

`createThread()` についても同様に `post-service.ts` 内で BAN チェックが行われており、スレッド作成パスも保護されている。

---

## ATK-R003-2

**問題ID**: ATK-R003-2
**判定**: ACCEPT

**根拠**:

攻撃者の指摘は正確である。`handleEmailConfirmCallback()` における二重完了防止チェックはアトミック性を欠いており、競合状態が発生しうる。

`registration-service.ts:216-225` の処理:
```typescript
let user = await UserRepository.findBySupabaseAuthId(supabaseAuthId); // 非アトミック
if (!user) {
    await completeRegistration(pendingUserId, supabaseAuthId, "email");
    user = await UserRepository.findById(pendingUserId);
}
```

`completeRegistration()` は `randomBytes(16).toString("hex")` で毎回異なる PAT を生成して `updatePatToken()` で上書きするため、2つのリクエストが同時に `findBySupabaseAuthId` で null を得た場合、先に発行した PAT が後のリクエストで無効化される。

**再現の現実性**: メール確認リンクの二重クリックはユーザー操作として現実的に発生する（ブラウザの「戻る」や「再読み込み」による再クリック、メーラーのプリフェッチによる二重到達）。Cloudflare Workers は同一リクエストでも並行処理されるため、エッジ環境での競合リスクは通常のサーバー環境より高い。

**影響**: ユーザーがマイページで控えた PAT が予告なく無効化され、専ブラからの書き込みが突然できなくなる。ユーザーへの通知はなく、原因の自己診断が困難。なお、PAT は単なる利便機能（専ブラ連携）であり、データ損失やセキュリティ侵害は発生しない。影響はサービス品質の低下（専ブラ書き込み不能）に留まる。

**修正方針**: `updateSupabaseAuthId()` に UNIQUE 制約（`supabase_auth_id` カラム）が存在すれば、2回目の INSERT/UPDATE は DB レベルで失敗し自然に排他制御される。DB制約の確認と、競合時のエラーハンドリング（冪等な再試行）が必要。

---

## ATK-R003-3

**問題ID**: ATK-R003-3
**判定**: ACCEPT

**根拠**:

攻撃者の指摘するモックのシグネチャ乖離は実在する。

`pat-integration.test.ts:72-77` のモック定義:
```typescript
(this as ...).buildAuthRequired = (code: string, token: string, base: string) =>
    `...${code}/${token}/${base}...`;
```

実際の `bbs-cgi-response.ts:99` のシグネチャ:
```typescript
buildAuthRequired(edgeToken: string, baseUrl: string): string { ... }
```

実装側の呼び出し（`route.ts:463`）:
```typescript
responseBuilder.buildAuthRequired(result.authRequired.edgeToken, getBaseUrl())
```

モックは3引数で定義されているが、実装は2引数で呼ぶ。この乖離により:
- テストが実際の `buildAuthRequired` の引数順序・個数の変化を検出できない
- 「認証案内URL にエッジトークンが正しく埋め込まれる」という重要な振る舞いが未検証のまま

`unknown` にキャストした代入によって TypeScript の型チェックが回避されており、コンパイル時にも検出されない。専ブラユーザーが認証 URL を受け取れない不具合が本番まで検出されない可能性がある。

**影響範囲**: 認証案内レスポンスの生成ロジック全体が実質的に単体テストの保護外。ただし BDD テスト（`features/specialist_browser_compat.feature`）が E2E レベルで実際の `buildAuthRequired` を呼ぶため、そちらで検出される可能性はある。

**修正方針**: モックの `buildAuthRequired` を実際のシグネチャ `(edgeToken: string, baseUrl: string)` に合わせ、アサーションで `edgeToken` が認証 URL に埋め込まれることを明示的に検証する。
