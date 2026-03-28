# ATK-R001-1 アーキテクト評価: completeRegistration 非アトミック2段階更新

## 判定: 対応必須

## 問題の実在確認

コードを実際に読み、指摘された問題が全て実在することを確認した。

### 事実1: 非アトミックな2段階UPDATE

`registration-service.ts` L184-194:
```ts
await UserRepository.updateSupabaseAuthId(userId, supabaseAuthId, registrationType);
const patToken = randomBytes(16).toString("hex");
await UserRepository.updatePatToken(userId, patToken);
```

`updateSupabaseAuthId` と `updatePatToken` はそれぞれ独立したSupabase REST API呼び出し（= 独立したHTTPリクエスト + 独立したDBトランザクション）。1回目成功・2回目失敗で中間状態が発生する。

### 事実2: 中間状態からの自己修復不可

`handleEmailConfirmCallback()` L216:
```ts
let user = await UserRepository.findBySupabaseAuthId(supabaseAuthId);
if (!user) {
    await completeRegistration(pendingUserId, supabaseAuthId, "email");
    ...
}
```

`findBySupabaseAuthId()` が中間状態のユーザー（`supabase_auth_id` あり・`pat_token` なし）を発見すると、`completeRegistration()` をスキップする。PAT未発行のまま固着する。

`handleOAuthCallback()` L351-363にも同一パターンが存在し、Discordフローでも同じ問題が発生する。

### 事実3: UNIQUE制約違反のハンドリング欠落

`user-repository.ts` L389-408 の `updateSupabaseAuthId()`:
```ts
if (error) {
    throw new Error(`UserRepository.updateSupabaseAuthId failed: ${error.message}`);
}
```

`supabase_auth_id` は UNIQUE制約（`00006_user_registration.sql` L50）を持つが、制約違反時の特別なハンドリングがない。汎用的な throw のみ。

### 事実4: 二重クリック問題

メール確認: `verifyOtp()` はトークンを1回限りで消費するため、2回目のクリックは `verifyOtp` 段階で失敗する。メールフローでの二重完了リスクは低い。

OAuthフロー: `exchangeCodeForSession()` も同様にcode使い捨てのため、直接的な二重完了リスクは低い。

ただし、攻撃側が指摘する「PATサイレント上書き」は、`updatePatToken()` がold PAT検証なしに上書きする設計（L421-436）に起因する。これは `regeneratePat()` でも同じ設計であり、意図的な仕様として許容される（旧PATの即時無効化が目的）。

## 影響評価

| 観点 | 評価 |
|---|---|
| 発生条件 | CF Workers環境でのタイムアウト、503、ネットワーク断。低頻度だが非ゼロ |
| 影響範囲 | 当該ユーザーの本登録が不完全固着。専ブラからの認証が永続的に不可能 |
| 自己修復 | 不可。冪等チェックが既登録と判断しcompleteRegistrationをスキップ |
| ユーザー操作での回復 | 不可。メール確認リンクの再クリック、再登録のいずれも機能しない |
| 管理者介入での回復 | DB直接編集（pat_token手動設定）が必要 |

## 対応必須と判断した根拠

1. **固着状態が自己修復不可能** -- 発生頻度が低くても、一度発生すると管理者のDB直接編集以外に回復手段がない
2. **修正コストが極めて低い** -- 2つのUPDATEを1つに統合するだけで解消できる
3. **リスク/コスト比** -- 修正の影響範囲が小さく、回帰リスクも低い

## 修正方針

### 方針: 2つのUPDATEを単一UPDATEに統合

`UserRepository` に `completeRegistration` 用の統合メソッドを新設し、4カラム（`supabase_auth_id`, `registration_type`, `registered_at`, `pat_token`）を1回のUPDATEで書き込む。

**変更対象:**

1. `user-repository.ts` -- 統合メソッド `completeRegistrationUpdate(userId, supabaseAuthId, registrationType, patToken)` を新設
2. `registration-service.ts` -- `completeRegistration()` から統合メソッドを呼び出すように変更

**修正イメージ:**

```ts
// user-repository.ts に追加
export async function completeRegistrationUpdate(
    userId: string,
    supabaseAuthId: string,
    registrationType: "email" | "discord",
    patToken: string,
): Promise<void> {
    const { error } = await supabaseAdmin
        .from("users")
        .update({
            supabase_auth_id: supabaseAuthId,
            registration_type: registrationType,
            registered_at: new Date(Date.now()).toISOString(),
            pat_token: patToken,
            pat_last_used_at: null,
        })
        .eq("id", userId);

    if (error) {
        throw new Error(
            `UserRepository.completeRegistrationUpdate failed: ${error.message}`,
        );
    }
}
```

```ts
// registration-service.ts completeRegistration() を修正
export async function completeRegistration(
    userId: string,
    supabaseAuthId: string,
    registrationType: "email" | "discord",
): Promise<void> {
    const patToken = randomBytes(16).toString("hex");
    await UserRepository.completeRegistrationUpdate(
        userId, supabaseAuthId, registrationType, patToken,
    );
}
```

**既存の `updateSupabaseAuthId` / `updatePatToken` は削除しない。** `updatePatToken` は `regeneratePat()` から引き続き使用されている。`updateSupabaseAuthId` は単独で使われていなければ削除可能だが、それは実装時に確認する。

### 補足: 冪等チェックの改善（推奨）

現在の冪等チェックは `supabase_auth_id` の存在のみで判定しているため、中間状態を検出できない。`pat_token` も合わせてチェックし、中間状態であれば `completeRegistration` を再実行する防御コードの追加も推奨する。ただし、単一UPDATE化により中間状態自体がほぼ発生しなくなるため、優先度は低い。
