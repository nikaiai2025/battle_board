# R-002 Attack Report

Red Team レビュー。対象: ログイン + edge-token継続性 + ログアウト + パスワード再設定シナリオ。

---

## ATK-002-1

**重大度**: CRITICAL

**問題の要約**: パスワード再設定フローで「リンクをクリックした者が誰でも任意のユーザーのパスワードを変更できる」認証バイパスが存在する。

**詳細**:

`handleRecoveryCallback()` は Supabase の recovery OTP を検証済みの `supabaseAuthId` を受け取り、edge-token を発行する（`registration-service.ts:413-425`）。発行された edge-token は `/api/auth/update-password` の認証基盤として機能する（`update-password/route.ts:76-83`）。

問題は `updatePassword()` の認証チェックにある。同関数は引数として受け取った `userId`（`registration-service.ts:441`）で `findById()` を呼ぶだけで、**その `userId` が「recovery リンクを踏んだ本人」であることを検証しない**。

攻撃シナリオ:
1. 攻撃者が自分のアカウントで recovery フローを実行し、edge-token を取得する
2. 取得した edge-token で `/api/auth/update-password` に POST する
3. `route.ts:87` の `authResult.userId` は攻撃者自身の userId → `updatePassword(攻撃者のuserId, ...)` が呼ばれ攻撃者自身のパスワードが変わるだけ

…これ自体は安全だが、BDD シナリオ「パスワード再設定リンクから新しいパスワードを設定する」のステップ定義を見ると、**より深い欠陥**が露見する。

`When "メール内の再設定リンクをクリックする"` ステップ（`user_registration.steps.ts:2477-2494`）は `handleRecoveryCallback(this.currentSupabaseAuthId)` を直接呼び出す。この `currentSupabaseAuthId` は Given ステップで**手動設定**された値（`steps.ts:503`）であり、BDD テストは「recovery OTP が正しく検証されたか」というフローを完全にスキップしている。

実際の HTTP フローでは `/api/auth/confirm?type=recovery` が Supabase の `verifyOtp` を呼び出してから `handleRecoveryCallback` を呼ぶ（`confirm/route.ts:74`）。しかし `updatePassword` はそのフローが経由されたかどうかを知る術がない。`updatePassword` が受け取る `userId` は edge-token → `verifyEdgeToken` → `authResult.userId` という経路で来るが、その edge-token が **recovery フロー経由で発行されたものか、通常のログイン/Turnstile経由で発行されたものかを区別しない**。

結果として、**本登録済みの認証済みユーザーは、自分の userId で `updatePassword` を呼べばパスワード再設定メールを受け取らずにパスワードを変更できる**（edge-token さえあれば良い）。これは意図しない特権操作の許可に相当する。

**再現条件**:
- 本登録済みユーザーが通常ログインで edge-token を持っているとき、`/api/auth/update-password` に POST すれば recovery フローを経由せずにパスワードを変更できる。BDD テストは `handleRecoveryCallback` を直接呼んでいるため、この経路差異を検出できない。

---

## ATK-002-2

**重大度**: CRITICAL

**問題の要約**: `completeRegistration()` は冪等でなく、並行リクエストで同一仮ユーザーへの二重本登録が成立し、PAT が無予告で上書きされる。

**詳細**:

`completeRegistration()` の実装（`registration-service.ts:179-195`）:

```
await UserRepository.updateSupabaseAuthId(userId, supabaseAuthId, registrationType);
const patToken = randomBytes(16).toString("hex");
await UserRepository.updatePatToken(userId, patToken);
```

2ステップのUPDATEが分割されており、両者の間にアトミック性がない。さらに `handleEmailConfirmCallback()` の冪等チェック（`registration-service.ts:216`）は `findBySupabaseAuthId(supabaseAuthId)` でのみ行われる。

攻撃シナリオ（競合状態）:
1. ユーザーが確認メールを2回クリックする（ブラウザのBack/Reloadや複数タブ）
2. リクエストAが `findBySupabaseAuthId` → null（未登録） → `completeRegistration` 開始
3. リクエストBが `findBySupabaseAuthId` → null（Aのコミット前） → `completeRegistration` 開始
4. AのUPDATE完了 → BのUPDATE完了（PAT上書き）
5. Aに発行されたedge-tokenはAが認識しているPATとBが設定したPATの不一致を引き起こす

よりシンプルな問題として、**同一ユーザーが `handleEmailConfirmCallback` の完了前にDiscord認証も完了させた場合**、`supabase_auth_id`、`registration_type`、`pat_token` が後勝ちで上書きされ、先に本登録した方法が抹消される。`supabase_auth_id` にUNIQUE制約があればDB側で防げるが、実装コードはそのエラーをハンドリングしておらず、Supabase からの constraint violation が `throw new Error(...)` として上位に伝播するだけである（`user-repository.ts:402-408`）。

BDDテストの `handleEmailConfirmCallback` シナリオでは `completeUserRegistration()` ヘルパーが `completeRegistration()` を1回だけ直接呼び出すため、並行呼び出しは一切テストされていない。

**再現条件**:
- メール確認リンクを2回クリックする（ブラウザの多重クリック、または同一メールをタブで2つ開く）とき、または同一仮ユーザーがメール本登録とDiscord本登録を同時に完了させようとするとき、`completeRegistration` が並行実行され部分的なデータ不整合が発生する。

---

## ATK-002-3

**重大度**: HIGH

**問題の要約**: 「新しいパスワードでログインできる」Then ステップが InMemorySupabaseClient の実装依存で空振りしており、パスワード変更が実際に機能していることを検証していない。

**詳細**:

BDD シナリオ「パスワード再設定リンクから新しいパスワードを設定する」の Then「新しいパスワードでログインできる」ステップ（`steps.ts:2597-2609`）は `loginWithEmail(email, TEST_NEW_PASSWORD)` を呼び出し成功を確認する。

しかし `When "新しいパスワードを入力して確定する"` ステップ（`steps.ts:2508-2519`）内の `updatePassword()` は `supabaseAdmin.auth.admin.updateUserById()` を呼ぶ（`registration-service.ts:446-449`）。

BDD テストでは `supabaseAdmin` は InMemorySupabaseClient に差し替えられているが、`auth.admin.updateUserById()` が InMemorySupabaseClient の認証情報ストアを実際に更新するかどうかを確認する必要がある。

`user_registration.steps.ts` の import を確認すると `InMemorySupabaseClient` は `../support/mock-installer` から取得している（`steps.ts:32`）。`_registerSupabaseUser` というメソッドは明示的に呼ばれているが（`steps.ts:421,471`）、`auth.admin.updateUserById` が同じインメモリストアのパスワードを更新する実装になっていない場合、`loginWithEmail` は**更新前のパスワードで成功する**（もしくはパスワード照合を省略している）可能性がある。

その場合、Then ステップは「`updatePassword` がパスワードを更新していなくても `loginWithEmail` は常に成功する」という状況でグリーンになり、シナリオが検証すべき「新パスワードでのみログイン可能」という振る舞いを検証できていない。

同様に Then ステップには「旧パスワードでのログインが失敗すること」の検証が完全に欠落している。旧パスワードでのログイン試行は一度も行われないため、たとえパスワード変更が機能していなくてもテストはグリーンになる。

**再現条件**:
- InMemorySupabaseClient の `auth.admin.updateUserById` がパスワードストアを更新しない（または `loginWithEmail` のパスワード照合が実装されていない）とき、「パスワード再設定リンクから新しいパスワードを設定する」シナリオは実際の振る舞いを検証せずにパスする。旧パスワードでもログインできる状態が残っていても検出されない。
