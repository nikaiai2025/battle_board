# インシデント報告: メール確認リンクが404になる（implicit flow問題）

> 日付: 2026-03-25
> 重大度: 高（メール本登録フロー全体が動作しない）
> 発見手段: 人間による実機テスト（スマホ Gmailアプリ）
> 関連インシデント: `2026-03-25_email_auth_redirect_missing.md`（前回の修正が不完全だった）

---

## 症状

Supabase 認証メールの確認リンクをスマホの Gmail アプリから踏むと 404 になる。

到達URL:
```
https://battle-board.shika.workers.dev/auth/error#access_token=eyJ...&type=signup
```

`/auth/error` ページが存在せず 404。さらに `#access_token=...` はハッシュフラグメントのためサーバーに到達しない。

## Phase 1: 原因理解

### Q1. なぜ起きたか

**直接原因:**
Supabase の `signUp()` が implicit flow（PKCE未使用）で動作していた。Supabase はメール確認後、`/auth/v1/verify` 経由で `#access_token=...`（ハッシュフラグメント）付きURLにリダイレクトする。ハッシュフラグメントは HTTP リクエストでサーバーに送信されない（RFC仕様）ため、サーバー側のコールバック処理が一切実行されなかった。

```
期待していた動作:
  メール確認 → /api/auth/callback?code=XXXX → サーバーで処理

実際の動作:
  メール確認 → Supabase /auth/v1/verify
             → 302 redirect: /api/auth/callback#access_token=...
             → callback route は ?code パラメータがないため /auth/error にリダイレクト
             → /auth/error は存在しない → 404
```

**根本原因:**
サーバーサイドの `supabaseAdmin.auth.signUp()` は implicit flow を使用する。`?code=...` を得るには PKCE flow が必要だが、サーバーサイド Admin API では PKCE を使えない。前回インシデント（`2026-03-25_email_auth_redirect_missing.md`）の Q4 で「redirectTo を正しく構築すれば `?code=...` にリダイレクトする」と結論づけたが、**この前提が誤りだった。**

Supabase 公式ドキュメントでは、SSR 環境でのメール確認にはカスタムメールテンプレート + `verifyOtp()` パターンを推奨している。

### Q2. なぜ今まで気付かなかったか

| テスト層 | 検出可能か | 理由 |
|---|---|---|
| BDD サービス層 | 不可能 | Supabase Auth のリダイレクト動作は外部サービスの振る舞い。InMemoryモックでは再現不可 |
| 単体テスト（route） | 不可能 | Supabase が implicit flow を使う事実はモック環境では表面化しない |
| 前回のインシデント分析 | **ここで検出すべきだった** | Q4（真因検証）で implicit/PKCE の区別を検証すべきだったが、Supabase のリダイレクト仕様の理解不足で見逃した |

### Q3. なぜ今になって気付いたか

前回インシデントの修正後、人間が再度実機テストした。前回修正で `emailRedirectTo: undefined` → 正しいURLに変更されたが、implicit flow の問題は残っていたため再発見。

## ゲート: 真因検証

### Q4. 特定した原因は本当に真因か

**証拠:**
- 到達URLに `#access_token=...` が含まれている（implicit flow の特徴）
- `?code=...` が存在しない（PKCE flow ではない証拠）
- Supabase 公式ドキュメントが SSR 向けに `verifyOtp()` パターンを推奨している

**別原因の検討:**
- Gmail アプリ固有のリダイレクト処理の問題ではないか → `#access_token` の存在は Supabase 側の挙動であり、Gmail アプリの問題ではない
- リダイレクトURLホワイトリストの問題ではないか → Discord OAuth は同じドメインで正常動作しているため除外

**修正で確実に直るか:**
カスタムメールテンプレートで `{{ .TokenHash }}` を `/api/auth/confirm` に直接渡す方式では、Supabase の `/auth/v1/verify` リダイレクトを完全にバイパスする。implicit/PKCE の区別に依存しないため、根本的に解決される。

## Phase 2: 対策

### Q5. 対策

Supabase 公式推奨の SSR パターンに全面移行:

| 修正 | ファイル | 変更内容 |
|---|---|---|
| 確認エンドポイント新設 | `src/app/api/auth/confirm/route.ts` | `token_hash` + `type` で `verifyOtp()` → 本登録完了 → edge-token 発行 |
| user_metadata 追加 | `src/lib/services/registration-service.ts` | `signUp()` に `data: { battleboard_user_id: userId }` を追加 |
| 確認コールバック関数 | `src/lib/services/registration-service.ts` | `handleEmailConfirmCallback()` 新設 |
| redirectTo 変更 | `src/app/api/auth/register/route.ts` | `emailRedirectTo` を `/mypage`（メールテンプレートの `{{ .RedirectTo }}`）に変更 |
| callback 整理 | `src/app/api/auth/callback/route.ts` | `email_confirm` フロー分岐を削除（Discord 専用に） |
| Supabase 設定 | Supabase Dashboard | メールテンプレートを `{{ .TokenHash }}` 方式に変更（人間が実施） |

### Q6. 対策による悪影響

- メール確認フローの経路が根本的に変わる（Supabase リダイレクト → サーバーサイド verifyOtp）。ただし Supabase 公式推奨パターンへの移行であり、より安定する方向
- `user_metadata` に `battleboard_user_id` を格納するため、Supabase Auth 側にアプリ固有データが入る。ただし公式にサポートされた機能であり問題なし
- 既存の未確認メール（修正前に送信済み）は旧テンプレートのため動作しない。再送が必要

## Phase 3: 再発防止

### Q7. どうすれば防げていたか

**設計段階で防げた。** Supabase + SSR 構成のメール確認フローには公式推奨パターン（`verifyOtp()` + カスタムメールテンプレート）がある。初期設計時にこのパターンを調査・採用していれば、implicit flow 問題自体が発生しなかった。

### Q8. 今後の再発防止策

**防止（設計原則）:**
- 外部サービス（Supabase, OAuth プロバイダ等）との統合は、公式ドキュメントの SSR/サーバーサイド向けガイドを最初に確認する
- 「クライアントサイド向けパターン」と「サーバーサイド向けパターン」の区別を意識する（implicit flow はクライアント向け）

**検出（インシデント分析の品質）:**
- インシデント分析の Q4（真因検証）で「外部サービスの仕様レベルの検証」を怠らない。前回は「redirectTo を直せば動く」という浅い検証で終わり、Supabase のリダイレクト方式（implicit vs PKCE）を確認しなかった

### Q9. 他にも同じ構造の問題がないか

`exchangeCodeForSession` を使用する箇所:
- `handleOAuthCallback()` — Discord OAuth 専用。Discord は `signInWithOAuth` → PKCE authorization code flow を使うため、`?code=...` が正しく取得される。問題なし

`signUp()` を使用する箇所:
- `registerWithEmail()` — 今回修正済み。`verifyOtp()` 方式に移行し、implicit flow に依存しない

修正後、implicit flow のハッシュフラグメントに依存するコードパスはゼロになった。

## テスト結果

- Vitest: 93ファイル / 1801テスト 全PASS
- BDD: 328シナリオ 全PASS（16 pending は既存のUI層テスト）

## 教訓

See: `docs/architecture/lessons_learned.md` LL-015
