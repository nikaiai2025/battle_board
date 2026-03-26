# ATK-R001-2: メール重複検出のエラーメッセージ文字列依存 — アーキテクト評価

## 判定: 対応推奨

## 問題の実在確認

対象コード (`registration-service.ts:113-126`) を確認した。

```typescript
if (error) {
    if (
        error.message.includes("already registered") ||
        error.message.includes("already been registered") ||
        error.status === 422
    ) {
        return { success: false, reason: "email_taken" };
    }
    throw new Error(
        `RegistrationService.registerWithEmail failed: ${error.message}`,
    );
}
return { success: true };
```

**問題は実在する。** 2つの独立した問題がある。

### 問題A: email confirmation 有効時の重複メール検出不能

Supabase Auth の仕様として、email confirmation が有効な環境で既存メールアドレスに対して `signUp()` を呼ぶと、**エラーを返さずダミーのユーザーオブジェクトを返す** (ユーザー列挙防止)。この場合 `error` は `null` となり、`if (error)` 分岐に入らず `success: true` が返される。

根拠:
- Supabase 公式 Issue (supabase/auth-js#513): "When email confirmations are enabled, returns obfuscated user object, no error. When email confirmations are disabled, returns explicit error message 'User already registered'."
- GitHub Discussion #7632: "The unique email validation message has been removed for security concerns."

本プロジェクトの状況:
- `supabase/config.toml` では `enable_confirmations = false` (ローカル開発用)
- しかしコード全体の設計（確認メール送信 -> `/api/auth/confirm` での verifyOtp -> 本登録完了）は email confirmation 有効を前提としている
- **本番環境では email confirmation が有効であると推定される**

### 問題B: エラーメッセージ文字列パターンマッチの脆弱性

`error.message.includes("already registered")` は Supabase GoTrue の内部エラーメッセージに依存しており、Supabase のバージョンアップでフォーマットが変更された場合にパターンマッチが失敗する。その場合、123行目の `throw new Error()` に到達し、呼び出し元の Route Handler で 500 エラーとなる。

## 影響評価

| 項目 | 評価 |
|---|---|
| 問題A: 発生確率 | 高 (本番で email confirmation が有効なら確実に発生) |
| 問題A: 影響 | UX劣化: ユーザーに「確認メール送信済み」と返答されるが、確認メールは届かない。再試行は可能（supabase_auth_id は未設定のため仮ユーザー状態は汚れない）|
| 問題B: 発生確率 | 低 (Supabase メジャーアップデート時のみ) |
| 問題B: 影響 | 500エラー化。全ての本登録申請が失敗する |

## 「対応必須」ではなく「対応推奨」とした理由

- 問題Aの影響は「確認メールが届かない」であり、ユーザーは再試行可能。データ損失・セキュリティ侵害は発生しない
- 問題Aは正しいメールアドレスを入力した正規ユーザーには発生しない（他人が既に使っているメールで登録しようとした場合のみ）
- 問題Bは現時点では発生しておらず、Supabase メジャーアップデート時の問題

ただし、問題Aは本番環境で確実に発生するパスであり、ユーザー体験上は「対応推奨」の中でも優先度は高い。

## 修正方針

### 推奨案: signUp レスポンスの `data.user.identities` 配列チェックを追加

Supabase の仕様では、ユーザー列挙防止でダミーデータを返す場合、`data.user.identities` が空配列 `[]` になる。正規の新規登録成功時は identities に要素が含まれる。

```typescript
const { data, error } = await supabaseAdmin.auth.signUp({ ... });

if (error) {
    // 既存のエラーハンドリング（status === 422 のみ残し、文字列マッチは補助的に）
    if (error.status === 422 ||
        error.message.includes("already registered")) {
        return { success: false, reason: "email_taken" };
    }
    throw new Error(`RegistrationService.registerWithEmail failed: ${error.message}`);
}

// ユーザー列挙防止によるダミーレスポンス検出
// email confirmation 有効時、既存メールに対して signUp するとエラーなしだが
// identities が空配列で返る
if (data?.user?.identities?.length === 0) {
    return { success: false, reason: "email_taken" };
}

return { success: true };
```

注意点:
- `identities` チェックも Supabase の内部仕様に依存する点は変わらないが、エラーメッセージ文字列よりは API レスポンス構造体のフィールドであり、互換性が壊れる可能性は低い
- `error.status === 422` のチェックは文字列パターンマッチよりもロバストであるため維持する

### BDDテストへの影響

BDDテストのインメモリモック (`features/support/in-memory/supabase-client.ts:116-121`) は `email_taken` モード時にエラーオブジェクトを返す実装になっている。実際の Supabase の挙動 (エラーなし + ダミーユーザー) とは乖離しているため、モックの修正も必要。ただし feature ファイル自体の変更は不要 (振る舞いの期待結果は変わらない)。

### 単体テストへの影響

Vitest のモック (`registration-service.test.ts:260-261`) も同様にエラーオブジェクトを返す実装。identities チェックのケースを追加する必要がある。
