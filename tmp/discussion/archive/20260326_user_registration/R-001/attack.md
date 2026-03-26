# R-001 敵対的レビュー: 攻撃レポート

レビュアー: Red Team
対象: 本登録（メール認証）+ データ引き継ぎ
日付: 2026-03-26

---

## ATK-R001-1

**重大度**: CRITICAL

**問題の要約**: `completeRegistration()` が非アトミックな2段階更新で実装されており、PAT 保存前にプロセスが失敗すると本登録済みユーザーが PAT を持たない不整合状態に陥る。

**詳細**:

`registration-service.ts:185-194` で `completeRegistration()` は以下の順序で2回の独立した DB 更新を実行する。

```
await UserRepository.updateSupabaseAuthId(userId, supabaseAuthId, registrationType);
// ← ここで例外が発生すると supabaseAuthId は設定済み・patToken は NULL のまま
const patToken = randomBytes(16).toString("hex");
await UserRepository.updatePatToken(userId, patToken);
```

1回目の `updateSupabaseAuthId()` が成功した後、2回目の `updatePatToken()` がネットワーク障害・Supabase タイムアウト等で失敗した場合、ユーザーは `supabase_auth_id = 設定済み`（本登録判定: 済）かつ `pat_token = NULL` の矛盾状態になる。

この状態のユーザーが再度確認リンクを踏んでも、`handleEmailConfirmCallback()` は `findBySupabaseAuthId()` で既登録ユーザーを発見するため `completeRegistration()` を呼ばず（`registration-service.ts:216-225`）、PAT は永久に発行されない。マイページにも PAT セクションが表示されない。

featureシナリオ「本登録完了時に PAT が自動発行される」「PATが自動発行されマイページに表示される」は、両ステップが常に成功するインメモリモックで実行されるため、この中間失敗状態を一切検出できない。

**再現条件**: `updateSupabaseAuthId()` が成功した後、`updatePatToken()` の呼び出し中（DBへのネットワーク送信後、レスポンス受信前）にプロセスがクラッシュするか Supabase が503を返したとき、本登録ユーザーが PAT なし状態で固着する。

---

## ATK-R001-2

**重大度**: CRITICAL

**問題の要約**: メール重複チェックをエラーメッセージ文字列のパターンマッチに依存しており、Supabase のエラーメッセージが変わると重複メールが検出されずにサイレント成功する。

**詳細**:

`registration-service.ts:116-122` のエラー判定は以下のように実装されている。

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

Supabase Auth の `signUp()` は、メールアドレスが既存ユーザーと重複する場合でも、Supabase の設定（`ENABLE_EMAIL_SIGNUP`・`DISABLE_SIGNUP` の組み合わせ）によっては **エラーを返さずに成功を返す** ことがある（ユーザー列挙防止のための意図的な設計）。その場合、`error` が null になるため `if (error)` ブロックに入らず `return { success: true }` が返る。

さらに、エラーが返る場合でも、Supabase のバージョンアップや設定変更でエラーメッセージが "User already exists" 等に変化した場合、上記のパターンマッチが外れて `throw new Error()` に至り、500エラーとなる（`email_taken` ではなく未処理例外として扱われる）。

featureシナリオ「既に使用されているメールアドレスでは本登録できない」のステップ定義（`user_registration.steps.ts:266-270`）は `InMemorySupabaseClient._setSignUpMode('email_taken')` でモックの動作を直接切り替えているため、実際の Supabase エラーフォーマットと実装の対応関係を一切検証していない。

**再現条件**: Supabase Auth の設定でメール重複時に成功レスポンスを返すモード（ユーザー列挙防止設定）が有効なとき、別ユーザーが使用済みのメールアドレスで `registerWithEmail()` を呼ぶと `{ success: true }` が返り、確認メールが（同一アドレスへ）送信される。その後のコールバックでは既存ユーザーの `supabase_auth_id` が新しい仮ユーザーの ID に上書きされる危険がある。

---

## ATK-R001-3

**重大度**: HIGH

**問題の要約**: `handleEmailConfirmCallback()` の仮ユーザー照合は `user_metadata` 中の `pendingUserId` を呼び出し元（APIルート）から受け取るが、その値が改ざんされても検証されないため、任意の仮ユーザーを本登録ユーザーに昇格させられる。

**詳細**:

コードコメント（`registration-service.ts:102-110`）によれば、`signUp()` 時に `user_metadata: { battleboard_user_id: userId }` を格納し、メール確認完了コールバック（`/api/auth/confirm/route.ts`）で `user_metadata` から `pendingUserId` を復元する設計になっている。

`handleEmailConfirmCallback(supabaseAuthId, pendingUserId)` の実装（`registration-service.ts:211-232`）では `pendingUserId` の正当性を検証していない。具体的には:

1. `supabaseAuthId` で `findBySupabaseAuthId()` を実行し、未登録なら
2. 受け取った `pendingUserId` をそのまま `completeRegistration(pendingUserId, ...)` に渡す（`registration-service.ts:220`）

`pendingUserId` の出所は `user_metadata.battleboard_user_id` であり、これは `signUp()` 呼び出し時にクライアントが自由に設定できる。呼び出し元 APIルート（`/api/auth/confirm/route.ts`）が URL クエリパラメータや `user_metadata` から `pendingUserId` を取得する実装であれば、攻撃者は自分の確認リンクに他のユーザーの `userId` を埋め込んで踏むことで、他人の仮ユーザーアカウントを自分の Supabase Auth ID に紐付けることができる。

この問題は BDD テストでは完全に見えない。`handleEmailConfirmCallback()` に渡す `pendingUserId` は常に `completeUserRegistration()` ヘルパー内で `world.currentUserId`（正規ユーザー）を使って設定されており（`user_registration.steps.ts:149`）、不正な `pendingUserId` を渡すテストケースが存在しない。

**再現条件**: `/api/auth/confirm/route.ts` が `user_metadata.battleboard_user_id` を取得して `handleEmailConfirmCallback()` に渡す実装になっているとき、攻撃者が `signUp()` の `data.battleboard_user_id` に被害者の `userId` を指定してメールアドレス確認を完了させると、被害者の仮ユーザーアカウントが攻撃者の Supabase Auth ID に紐付けられ、以後攻撃者がそのアカウントを乗っ取る。
