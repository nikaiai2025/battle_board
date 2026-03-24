# インシデント報告: メール本登録の確認リンクが機能しない

> 日付: 2026-03-25
> 重大度: 高（メール本登録フロー全体が動作しない）
> 発見手段: 人間による実機テスト

---

## 症状

Supabase 認証メールの確認リンクをクリック後、サイトにリダイレクトされるが「本登録が完了していないユーザー」扱いでログインできない。

## Phase 1: 原因理解

### Q1. なぜ起きたか

**直接原因:**
`POST /api/auth/register` が `RegistrationService.registerWithEmail()` を呼ぶ際、`emailRedirectTo` に `undefined` を渡していた。Supabase はフォールバックとしてプロジェクト設定のサイトURL（`https://battle-board.shika.workers.dev`）をリダイレクト先に使用。サイトルートにはコールバック処理がないため、本登録完了処理が一切実行されなかった。

**根本原因:**
`registerWithEmail(redirectTo?: string)` の `redirectTo` がオプショナル引数だった。Discord 系の同等関数（`registerWithDiscord(redirectTo: string)`, `loginWithDiscord(redirectTo: string)`）は必須引数であり、コンパイラが省略を検出できた。メール登録だけオプショナルだったため、呼び出し元（ルートハンドラ）がデフォルト値の構築を忘れても TypeScript が警告しなかった。

```
registerWithDiscord(redirectTo: string)  → 省略するとコンパイルエラー → 安全
registerWithEmail(redirectTo?: string)   → 省略しても通る → 今回のバグ
```

**副次バグ2件:**
1. `email_confirm` フローが `edge-token` Cookie に依存しており、Gmailアプリ内ブラウザ等 Cookie 非共有環境で失敗する（Discord は URL パラメータで `userId` を渡しておりこの問題がない）
2. `handleOAuthCallback()` 内で `registrationType` が `"discord"` にハードコードされており、メール確認フローでも Discord 登録として DB に記録される

### Q2. なぜ今まで気付かなかったか

3層のテスト全てが見逃した。

| テスト層 | 担当すべきだったか | 検出できなかった理由 |
|---|---|---|
| BDD ステップ定義 | BDDテスト戦略(D-10)上、サービス層直呼びが正しい。ルート層のバグは担当外 | `completeRegistration()` を直接呼び出しており、HTTP リダイレクトフロー（register → Supabase → callback）を通過しない。これは D-10 の設計方針に従った正しい判断であり、BDD のスコープ外 |
| 単体テスト（register route） | **ここが検出すべきだった** | `redirectTo` を明示的に渡すケースのみテスト。フロントエンドのデフォルト動作（`redirectTo` なし）をテストしていなかった |
| 単体テスト（registration service） | サービス層としては正しく動作 | `emailRedirectTo: undefined` を正しい振る舞いとしてアサートしていた。サービスの契約は「渡された値をそのまま使う」であり、正しい |

### Q3. なぜ今になって気付いたか

人間がメール認証フローを初めて実機テストした。偶然の発見であり、自動テストでは検出されていなかった。

## ゲート: 真因検証

### Q4. 特定した原因は本当に真因か

**証拠:** 受信メールのリンクに埋め込まれた `redirect_to` が `https://battle-board.shika.workers.dev`（サイトルート）であり、`/api/auth/callback?flow=email_confirm&userId=...` ではない。これは `emailRedirectTo: undefined` の直接的な結果。

**別原因の可能性:** Supabase のリダイレクト URL ホワイトリスト設定の問題も考えられるが、Discord フローが同じ `/api/auth/callback` を使って動作しているため、ホワイトリストは正しく設定されている。

**修正で確実に直るか:** `redirectTo` を正しく構築すれば、メール内のリンクが `/api/auth/callback?flow=email_confirm&userId=...&code=...` にリダイレクトするようになり、既存のコールバック処理が正常に実行される。

## Phase 2: 対策

### Q5. 対策

| 修正 | ファイル | 変更内容 |
|---|---|---|
| 主修正 | `src/app/api/auth/register/route.ts` | `redirectTo` 未指定時に `${origin}/api/auth/callback?flow=email_confirm&userId=${userId}` を構築。Discord と同一パターン |
| Cookie 依存除去 | `src/app/api/auth/callback/route.ts` | `email_confirm` フローを Cookie → URL パラメータ (`userId`) ベースに変更 |
| 型の厳格化 | `src/lib/services/registration-service.ts` | `registerWithEmail(redirectTo?: string)` → `registerWithEmail(redirectTo: string)` に変更。`handleOAuthCallback()` に `registrationType` パラメータ追加 |
| テスト追加 | `src/__tests__/app/api/auth/register.test.ts` | `redirectTo` 未指定時のデフォルト構築を検証するテスト追加 |
| テスト更新 | `src/__tests__/api/auth/callback/route.test.ts` | Cookie 依存テスト → URL パラメータベーステストに書き換え |
| テスト更新 | `src/__tests__/lib/services/registration-service.test.ts` | `redirectTo` 必須化に合わせて全呼び出しにURL追加 |
| BDD 更新 | `features/step_definitions/user_registration.steps.ts` | `redirectTo` 必須化に合わせて `TEST_REDIRECT_URL` 定数追加 |

### Q6. 対策による悪影響

- `registerWithEmail` の `redirectTo` が必須になったため、この関数を呼ぶ全箇所で引数追加が必要。呼び出し箇所はルートハンドラ（1箇所）、BDDステップ（3箇所）、単体テスト（6箇所）。全て対応済み
- `email_confirm` フローから Cookie 依存を除去。「同一ブラウザでのみ動作」という暗黙の制約がなくなり、影響は正の方向のみ

## Phase 3: 再発防止

### Q7. どうすれば防げていたか

**設計段階で防げた。** Discord と同じ関数シグネチャ（`redirectTo: string`、必須）にしていれば、ルートハンドラが `redirectTo` の構築を忘れた時点でコンパイルエラーが出た。

**テストでも検出できた。** ルートの単体テストで「`redirectTo` なし（フロントエンドのデフォルト動作）」をテストしていれば検出できた。

### Q8. 今後の再発防止策

**防止（構造変更）:**
- `registerWithEmail(redirectTo: string)` を必須パラメータに変更 → 実施済み
- Discord 系と型シグネチャを統一し、オプショナルな `redirectTo` がコードベースに存在しない状態にした

**検出（テスト追加）:**
- ルートの単体テストに「`redirectTo` 未指定時はコールバック URL を自動構築して渡す」テストを追加 → 実施済み
- テストが検証する内容: URL が `undefined` でないこと、`flow=email_confirm`・`userId`・`/api/auth/callback` が含まれること

### Q9. 他にも同じ構造の問題がないか

**Supabase リダイレクト URL を扱う全関数を確認:**

| 関数 | `redirectTo` の型 | ルートでの構築 | 安全か |
|---|---|---|---|
| `registerWithDiscord(redirectTo: string)` | 必須 | `register/discord/route.ts` で構築 | 安全 |
| `loginWithDiscord(redirectTo: string)` | 必須 | `login/discord/route.ts` で構築 | 安全 |
| `registerWithEmail(redirectTo: string)` | **必須（修正後）** | `register/route.ts` で構築（修正後） | **修正済み** |

修正後、全関数が `redirectTo: string`（必須）に統一された。同じパターンの問題は他に存在しない。

## テスト結果

- `callback/route.test.ts`: 12/12 パス
- `register.test.ts`: 13/13 パス
- `registration-service.test.ts`: 30/34 パス（4件は既存の `loginWithEmail` テスト不備、今回と無関係）
- BDD: メール本登録関連シナリオ 3/3 パス

## 教訓

See: `docs/architecture/lessons_learned.md` LL-014
