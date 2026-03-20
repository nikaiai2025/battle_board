---
task_id: TASK-193
sprint_id: Sprint-70
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T13:00:00+09:00
updated_at: 2026-03-19T13:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/register/email/page.tsx"
  - "[NEW] src/app/(web)/register/discord/page.tsx"
---

## タスク概要

マイページの本登録リンク先 `/register/email` と `/register/discord` のWebページが存在せず 404 になっているバグを修正する。
APIルートは `/api/auth/register`（POST）と `/api/auth/register/discord`（POST）に実装済みだが、フォーム画面（Webページ）が未実装。

## 対象BDDシナリオ

- `features/user_registration.feature` @仮ユーザーがメールアドレスとパスワードで本登録を申請する
- `features/user_registration.feature` @仮ユーザーがDiscordアカウントで本登録する

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/user-registration.md` §7 — 本登録フロー詳細
2. [必須] `src/app/api/auth/register/route.ts` — メール本登録API（POST リクエスト仕様）
3. [必須] `src/app/api/auth/register/discord/route.ts` — Discord本登録API（POST リクエスト仕様）
4. [必須] `src/app/(web)/mypage/page.tsx` L406-425 — リンク元の実装
5. [参考] `e2e/smoke/navigation.spec.ts` — E2Eテスト（到達性検証）

## 修正内容

### 1. `/register/email` ページ（`src/app/(web)/register/email/page.tsx`）

メールアドレスとパスワードの入力フォーム。送信時に `POST /api/auth/register` を fetch で呼び出す。

**必要なUI要素:**
- メールアドレス入力欄
- パスワード入力欄
- 送信ボタン
- 結果表示（成功: 確認メール送信済みメッセージ / 失敗: エラーメッセージ）
- マイページへの戻りリンク

**APIリクエスト仕様（`/api/auth/register` POST）:**
```json
{ "email": "user@example.com", "password": "12345678" }
```
- 200: `{ success: true, message: "確認メールを送信しました..." }`
- 400: バリデーションエラー
- 401: 未認証
- 409: 重複（already_registered / email_taken）

### 2. `/register/discord` ページ（`src/app/(web)/register/discord/page.tsx`）

Discord連携開始ページ。「Discord で本登録」ボタンを表示し、クリック時に `POST /api/auth/register/discord` を fetch で呼び出し、返却された `redirectUrl` にリダイレクトする。

**APIリクエスト仕様（`/api/auth/register/discord` POST）:**
- 200: `{ success: true, redirectUrl: "https://discord.com/..." }` → `window.location.href = redirectUrl`
- 401: 未認証
- 500: サービスエラー

## 出力（生成すべきファイル）

- `src/app/(web)/register/email/page.tsx` — メール本登録フォーム
- `src/app/(web)/register/discord/page.tsx` — Discord本登録開始ページ

## 完了条件

- [ ] `/register/email` にGETアクセスで200が返る
- [ ] `/register/discord` にGETアクセスで200が返る
- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` 全シナリオ結果変化なし

## スコープ外

- BDDシナリオの変更
- APIルート（`/api/auth/register/...`）の変更
- マイページの変更
- 既存E2Eテスト「一覧に戻るリンクが存在しクリック可能」の修正（別問題）

## 補足・制約

- ページのデザインはマイページと同程度の簡素なもので良い（Tailwind CSSで統一）
- edge-token Cookie が存在しない場合のエラーハンドリングを含めること（マイページへの誘導）
- Client Component（"use client"）として実装し、fetch でAPIを呼び出すこと

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 必読ドキュメント確認完了（user-registration.md §7, register/route.ts, register/discord/route.ts, mypage/page.tsx）
- `src/app/(web)/register/email/page.tsx` 作成完了
- `src/app/(web)/register/discord/page.tsx` 作成完了
- Vitest: 64ファイル 1381テスト全件PASS
- Cucumber-js: 254シナリオ 238 PASS / 16 pending（既存状態と変化なし）

### テスト結果サマリー
- Vitest: 64 files PASS, 1381 tests PASS
- Cucumber-js: 254 scenarios (238 passed, 16 pending) — 既存状態と変化なし
