---
task_id: TASK-313
sprint_id: Sprint-116
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-25T12:00:00+09:00
updated_at: 2026-03-25T12:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/auth/forgot-password/page.tsx"
  - "[NEW] src/app/(web)/auth/reset-password/page.tsx"
  - "src/app/(web)/login/page.tsx"
---

## タスク概要

D-06画面要素定義書に基づき、パスワード再設定に関するフロントエンドページ2つを新規作成し、ログインページに導線リンクを追加する。APIは全て実装済みのため、フロントエンドのみの作業。

## 対象BDDシナリオ

- `features/user_registration.feature` — パスワード再設定セクション（3シナリオ）
  - 本登録ユーザーがパスワード再設定を申請する
  - パスワード再設定リンクから新しいパスワードを設定する
  - 未登録のメールアドレスでパスワード再設定を申請してもエラーを明かさない

## 必読ドキュメント（優先度順）

1. [必須] `docs/specs/screens/auth-forgot-password.yaml` — SCR-006 パスワード再設定申請画面
2. [必須] `docs/specs/screens/auth-reset-password.yaml` — SCR-007 新パスワード設定画面
3. [必須] `src/app/(web)/login/page.tsx` — 改修対象（パターン参照元）
4. [参考] `src/app/(web)/auth/verify/page.tsx` — 既存auth系ページのパターン参照
5. [参考] `src/app/api/auth/reset-password/route.ts` — POST先API（実装済み）
6. [参考] `src/app/api/auth/update-password/route.ts` — POST先API（実装済み）

## 出力（生成すべきファイル）

1. `src/app/(web)/auth/forgot-password/page.tsx` — パスワード再設定申請ページ
2. `src/app/(web)/auth/reset-password/page.tsx` — 新パスワード設定ページ
3. `src/app/(web)/login/page.tsx` — 改修（リンク追加のみ）

## 実装仕様

### 1. `/auth/forgot-password` ページ (SCR-006)

- メールアドレス入力フォーム → `POST /api/auth/reset-password` に送信
- 送信成功: 同一画面内にフォームを非表示にし成功メッセージ表示（画面遷移しない）
- 送信失敗（通信エラー）: エラーメッセージ表示
- 「ログインページに戻る」リンク → `/login`
- 要素IDは D-06 の `elements[].id` に従うこと

### 2. `/auth/reset-password` ページ (SCR-007)

- 新パスワード + 確認入力の2フィールドフォーム → `POST /api/auth/update-password` に送信
- パスワード不一致: クライアントサイドバリデーション（APIに送信しない）
- 送信成功: フォームを非表示にし完了メッセージ + ログインリンク表示
- 送信失敗: エラーメッセージ表示
- このページは `/api/auth/confirm?type=recovery` 経由でリダイレクトされる（edge-token Cookie が既に発行済み）
- `password` フィールドのみAPIに送信（確認フィールドは送らない）
- 要素IDは D-06 の `elements[].id` に従うこと

### 3. `/login` ページ改修

- パスワード入力欄の下、ログインボタンの上に以下を追加:
  - `id="login-forgot-password-link"`
  - リンク先: `/auth/forgot-password`
  - テキスト: 「パスワードを忘れた方はこちら」
- 既存コードの変更は最小限に留める

## 完了条件

- [ ] 3ファイルの作成・改修が完了
- [ ] `npx vitest run` 全件PASS（既存テスト含む回帰テスト）
- [ ] `npx cucumber-js` 全件PASS（password reset 3シナリオ含む）
- [ ] D-06 の要素IDが全て使用されている

## スコープ外

- API routes の変更（実装済み）
- Service層の変更（実装済み）
- BDDステップ定義の変更（実装済み）
- 単体テストの追加（ページコンポーネントの単体テストは本プロジェクトでは不要）

## 補足・制約

- UIスタイルは既存の `/login` ページや `/auth/verify` ページと統一すること（Tailwind CSS、同じカラーパレット）
- `"use client"` ディレクティブ必須（フォーム状態管理のため）
- D-06 の要素IDをそのまま HTML id 属性として使用すること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3ファイルの作成・改修、vitest全件PASS、cucumber-js全件PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- `src/app/(web)/auth/forgot-password/page.tsx` 新規作成 (SCR-006 全8要素ID対応)
- `src/app/(web)/auth/reset-password/page.tsx` 新規作成 (SCR-007 全9要素ID対応)
- `src/app/(web)/login/page.tsx` 改修 (`login-forgot-password-link` 追加)

### テスト結果サマリー
- npx vitest run: 95ファイル / 1828テスト 全件PASS
- npx cucumber-js: 347シナリオ (331 passed, 16 pending) 全件PASS
  - pending は既存の未実装シナリオであり今回の作業対象外
