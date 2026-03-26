# R-001 防御レポート: 本登録（メール認証）+ データ引き継ぎ

レビュアー: Blue Team
対象: 本登録（メール認証）+ データ引き継ぎ
日付: 2026-03-26

---

## ATK-R001-1

**問題ID**: ATK-R001-1
**判定**: ACCEPT

**根拠**:

攻撃者の指摘は正しい。`completeRegistration()`（`registration-service.ts:179-195`）は以下の2回の独立したDB更新を順次実行する:

```typescript
await UserRepository.updateSupabaseAuthId(userId, supabaseAuthId, registrationType);
// ← この間にプロセスクラッシュ・503等が発生すると
const patToken = randomBytes(16).toString("hex");
await UserRepository.updatePatToken(userId, patToken);
```

`updateSupabaseAuthId()` 成功後に `updatePatToken()` が失敗した場合、ユーザーレコードは `supabase_auth_id = 設定済み（本登録済み判定）` かつ `pat_token = NULL` の矛盾状態になる。

`handleEmailConfirmCallback()`（`registration-service.ts:211-232`）は `findBySupabaseAuthId()` で既登録ユーザーを発見した場合に `completeRegistration()` を呼ばないため、この中間失敗状態に陥ったユーザーは PAT を永久に取得できない。

再現条件は現実的である。Supabase の一時的な503、ネットワーク瞬断、CF Workers のタイムアウト（50ms CPU制限）などで発生しうる。

**影響評価**:
- PAT が NULL のまま固着するため、専ブラ連携が完全に機能しない（`verifyPat()` で `null` は照合失敗扱い）
- マイページの PAT セクションが表示されない（UI上の表示欠陥）
- ユーザー自身では回復手段がなく、管理者による手動修正が必要になる
- データ損失・セキュリティ侵害は発生しないが、機能的なサービス停止が生じる

BDDテストは `completeRegistration()` の両ステップを常に成功するインメモリモックで実行するため、この中間失敗状態を検出できない。

---

## ATK-R001-2

**問題ID**: ATK-R001-2
**判定**: ACCEPT

**根拠**:

攻撃者の指摘は2点に分かれる。両方とも正当である。

**第1の問題: エラーメッセージ文字列マッチの脆弱性**

`registration-service.ts:116-122` のエラー判定:

```typescript
if (
  error.message.includes("already registered") ||
  error.message.includes("already been registered") ||
  error.status === 422
) {
  return { success: false, reason: "email_taken" };
}
throw new Error(`RegistrationService.registerWithEmail failed: ${error.message}`);
```

Supabase のバージョンアップやエラーメッセージ変更（例: "User already exists"）でパターンマッチが外れた場合、`email_taken` ではなく未処理例外となり500エラーが返る。これはサービスの可用性を損なう。

なお `error.status === 422` の条件が存在するため、Supabase がステータスコード422を返す限り文字列マッチに頼らず検出できる。ただしステータスコード保証もSupabaseの内部仕様に依存しており、文字列マッチと同等の脆弱性を持つ。

**第2の問題: ユーザー列挙防止設定時のサイレント成功**

攻撃者の指摘通り、Supabase Auth はユーザー列挙防止の設定によっては重複メールでも `error = null` で `success` レスポンスを返す。その場合 `if (error)` ブロックに入らず `return { success: true }` が返される（`registration-service.ts:128`）。

現状の BDD テスト（`user_registration.steps.ts:266-270`）は `InMemorySupabaseClient._setSignUpMode('email_taken')` でエラーを直接注入する方式であり、「error=null で成功レスポンスが返るケース」を一切検証していない。

**影響評価**:
- サイレント成功時: 同一メールアドレスへ確認メールが再送され、後続のコールバックで別仮ユーザーの `supabase_auth_id` が上書きされる可能性がある（既存ユーザーとの紐付け競合）
- エラーメッセージ変更時: 500エラーによりユーザーが登録操作を完了できなくなる

---

## ATK-R001-3

**問題ID**: ATK-R001-3
**判定**: REJECT

**根拠**:

攻撃者の指摘は `pendingUserId` の出所の分析に誤りがある。

`confirm/route.ts:77` の実装を確認する:

```typescript
// メール確認フロー: user_metadata から battleboard_user_id を復元
const userId = data.user.user_metadata?.battleboard_user_id as
    | string
    | undefined;
```

`data.user` は `authClient.auth.verifyOtp({ type, token_hash: tokenHash })` のレスポンス（`confirm/route.ts:60-63`）であり、`user_metadata` は Supabase Auth サーバーが管理するユーザーレコードから取得される。URLクエリパラメータから取得されていない。

`battleboard_user_id` は `registerWithEmail()` 内の `supabaseAdmin.auth.signUp()` 呼び出し時に `options.data` として格納される（`registration-service.ts:109`）。この呼び出しは **サーバーサイドの `supabaseAdmin`（Service Role Key）** で実行される。

攻撃者が直接 Supabase Auth の `signUp()` を呼び出したとしても、それはクライアント権限でのリクエストであり、`user_metadata` の書き込みは可能だが、その結果は自分自身の Supabase Auth ユーザーに紐付く。

重要な点として、`verifyOtp()` が返す `data.user.id`（`supabaseAuthId`）と `data.user.user_metadata.battleboard_user_id`（`pendingUserId`）は同一の Supabase Auth ユーザーレコードに属する。攻撃者は自分の Supabase Auth ユーザー（`signUp` で作成）の `user_metadata` に任意の `battleboard_user_id` を書き込むことはできるが、それを `verifyOtp()` で取得するには自分のメールアドレスの確認リンクを踏む必要がある。

攻撃フローを具体的に検証する:
1. 攻撃者が `POST /api/auth/register` を呼ぶ。この時 `userId` は Cookie の edge-token から特定されるため、攻撃者は自分自身の `userId` しか渡せない（`register/route.ts:127` を参照）
2. Supabase Auth に格納される `battleboard_user_id` は攻撃者の `userId` になる
3. 攻撃者が確認リンクを踏むと、`verifyOtp()` は攻撃者の Supabase Auth ユーザーレコードを返す
4. `user_metadata.battleboard_user_id` には攻撃者自身の `userId` が入っている

攻撃者が「被害者の `userId` を `battleboard_user_id` に埋め込む」ためには、`POST /api/auth/register` をバイパスして `supabaseAdmin.auth.signUp()` を直接呼び出す必要がある。しかし `supabaseAdmin` は Service Role Key を使用するサーバーサイド専用クライアントであり、クライアントからは呼び出せない。

したがって、攻撃者が被害者の `userId` を `battleboard_user_id` として格納する手段は現実的に存在しない。問題は顕在化しない。
