# R-003 攻撃レポート（Red Team）

レビュー対象: PAT（専ブラ連携トークン）の発行・認証・再発行フロー

---

## ATK-R003-1

**重大度**: CRITICAL

**問題の要約**: BAN 済みユーザーが PAT で認証をバイパスして書き込みできる。

**詳細**:
`loginWithPat()` は内部で `verifyPat()` → `UserRepository.findByPatToken()` を呼び、ユーザーが見つかれば即 `{ valid: true, userId }` を返す（`registration-service.ts:496-506`）。`user.isBanned` のチェックが一切ない。

通常の書き込みフローでは `AuthService.isUserBanned()` を呼ぶ箇所が別途あるが、PAT 認証パス（`route.ts:322-362`）では `loginWithPat()` の成功後にそのまま `handleCreatePost` / `handleCreateThread` に進んでおり、BAN チェックは挿入されていない。

Web ブラウザ経由のログインは Supabase Auth で認証した後に edge-token を発行する流れなのでルート側のチェックが機能するが、PAT フローは `loginWithPat()` が edge-token 発行まで完結させるため、BAN チェックが完全に抜け落ちる。

```
registration-service.ts:496  export async function verifyPat(patToken: string): Promise<VerifyPatResult> {
registration-service.ts:497    const user = await UserRepository.findByPatToken(patToken);
registration-service.ts:499    if (!user) { return { valid: false }; }
                               // ← user.isBanned のチェックなし
registration-service.ts:503    await UserRepository.updatePatLastUsedAt(user.id);
registration-service.ts:505    return { valid: true, userId: user.id };
                               // ← BAN ユーザーも valid: true で返す
```

**再現条件**:
1. 管理者がユーザーの `is_banned` を `true` に設定する（BAN 実行）
2. そのユーザーの PAT が有効なまま残っている
3. 専ブラの mail 欄に `#pat_<PAT>` を設定して bbs.cgi に POST する
4. BAN にかかわらず書き込みが成功する

---

## ATK-R003-2

**重大度**: CRITICAL

**問題の要約**: `completeRegistration()` は冪等ではなく、二重呼び出し時に PAT を上書きして既存デバイスの認証を破壊する。

**詳細**:
`handleEmailConfirmCallback()` は「`supabase_auth_id` でユーザーが見つからなければ `completeRegistration()` を呼ぶ」という二重完了防止チェックを持つ（`registration-service.ts:216-225`）。しかし `handleOAuthCallback()` も同じロジックを独立して持つ（`registration-service.ts:351-363`）。

確認メールリンクの二重クリック（ブラウザの再読み込み、遅延配送による二重到達等）は現実に起きうる。`handleEmailConfirmCallback()` の排他制御は「`findBySupabaseAuthId` で null → `completeRegistration` → `findById`」の間にアトミック性がない。二つのリクエストが同時に `findBySupabaseAuthId` で null を得ると、両方が `completeRegistration()` を呼んで `updatePatToken()` が2回実行され、先の呼び出しで設定した PAT が後の呼び出しで別の値に上書きされる。

```
registration-service.ts:179  export async function completeRegistration(...): Promise<void> {
registration-service.ts:185    await UserRepository.updateSupabaseAuthId(userId, supabaseAuthId, registrationType);
registration-service.ts:193    const patToken = randomBytes(16).toString("hex"); // ← 毎回異なる値
registration-service.ts:194    await UserRepository.updatePatToken(userId, patToken);
```

```
registration-service.ts:211  export async function handleEmailConfirmCallback(...): Promise<LoginResult> {
registration-service.ts:216    let user = await UserRepository.findBySupabaseAuthId(supabaseAuthId); // ← 非アトミック
registration-service.ts:218    if (!user) {
registration-service.ts:220      await completeRegistration(pendingUserId, supabaseAuthId, "email");
                                 // ← 同時に2スレッドがここに到達すると PAT が2回書き換わる
```

最初に本登録完了で取得した PAT をマイページに控えているユーザーは、競合した場合に無効な PAT を持ち続ける。これは「PAT を再発行すると旧 PAT が無効になる」シナリオとは異なり、ユーザーに通知されないサイレントな PAT 破壊である。

**再現条件**:
1. メール確認リンクを2つのタブでほぼ同時に開く（または確認リンクへのリダイレクトが遅延して2回到達する）
2. 両方のリクエストが `findBySupabaseAuthId` で null を得るタイミングが重なる
3. 先のリクエストで発行された PAT が後のリクエストで上書きされ、ユーザーが保持していた PAT が使えなくなる

---

## ATK-R003-3

**重大度**: HIGH

**問題の要約**: テストのモックが実際の `BbsCgiResponseBuilder.buildAuthRequired` のシグネチャと乖離しており、PAT 無効時の認証案内レスポンスが正しく生成されることをテストが検証できていない。

**詳細**:
`pat-integration.test.ts:72-77` の `MockBbsCgiResponseBuilder.buildAuthRequired` は `(code, token, base)` の3引数で定義されている。しかし実際の `BbsCgiResponseBuilder.buildAuthRequired`（`bbs-cgi-response.ts:99`）のシグネチャは `(edgeToken: string, baseUrl: string)` の2引数である。

```
// テスト（pat-integration.test.ts:72-77）
(this as ...).buildAuthRequired = (code: string, token: string, base: string) =>
    `...${code}/${token}/${base}...`;

// 実装（bbs-cgi-response.ts:99）
buildAuthRequired(edgeToken: string, baseUrl: string): string { ... }
```

TypeScript はこのモックの型違反を検出できない（`unknown` にキャストして代入しているため）。実際のルート実装（`route.ts:463`）では `responseBuilder.buildAuthRequired(result.authRequired.edgeToken, getBaseUrl())` と2引数で呼んでいるが、テストはモックの3引数版が使われる前提でアサーションを書いているため、引数の順序・個数の誤りがあってもテストはグリーンになる。

この乖離により「未認証時の認証案内HTMLが正しく生成される」「エッジトークンが認証URLに埋め込まれる」というシナリオの重要部分が実質的に未検証のままテストをパスしている。専ブラユーザーが認証 URL を受け取れない不具合が本番まで検出されない可能性がある。

**再現条件**:
1. `npx vitest run` を実行するとテストはグリーンになる
2. しかし `BbsCgiResponseBuilder.buildAuthRequired` の第1引数・第2引数を入れ替えるか引数を追加・削除しても、テストは変わらず通過する
3. 実際の bbs.cgi 実装が認証案内を返すパスに到達したとき、モックのシグネチャ前提で書かれたアサーションは実際の動作を検証できていない
