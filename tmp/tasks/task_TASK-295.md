---
task_id: TASK-295
sprint_id: Sprint-110
status: completed
assigned_to: bdd-coding
depends_on: [TASK-294]
created_at: 2026-03-24T18:00:00+09:00
updated_at: 2026-03-24T18:00:00+09:00
locked_files:
  - src/app/(web)/_components/AuthModal.tsx
  - src/app/(web)/_components/PostForm.tsx
  - src/app/(web)/_components/ThreadCreateForm.tsx
  - src/app/(web)/auth/verify/page.tsx
  - src/app/(web)/auth/verify/__tests__/verify-page-logic.test.ts
---

## タスク概要

認証フロー簡素化のフロントエンドUI改修。6桁認証コードの表示・入力UIを削除し、Turnstileのみの認証フローに変更する。
TASK-294（バックエンド）完了後に実施する。

## 対象BDDシナリオ

- `features/authentication.feature` @Turnstile通過で認証に成功する

## 必読ドキュメント（優先度順）

1. [必須] `docs/specs/screens/auth-verify.yaml` — 更新済み画面要素定義（Turnstileのみ）
2. [必須] `docs/specs/openapi.yaml` — 更新済みAPI仕様（`/api/auth/verify` エンドポイント）
3. [参考] `tmp/auth_simplification_analysis.md` §5.2 — 変更方針

## 入力（前工程の成果物）

- TASK-294 完了後のバックエンドAPI: `/api/auth/verify` が `turnstileToken` のみを受け付ける

## 変更内容の詳細

### 1. AuthModal.tsx

**削除:**
- `authCode` props（L51）
- 認証コード表示エリア（`auth-code-display`, L234-247）
- 認証コード入力フィールド（`auth-code-input`, L248-262）
- リクエストボディから `code` を削除

**変更:**
- API URL: `/api/auth/auth-code` → `/api/auth/verify`
- コメント・JSDoc更新: 認証コード関連の記述を削除

### 2. PostForm.tsx

**削除:**
- `authCode` state（L67）
- `setAuthCode(data.authCode)` 呼び出し（L93）
- `authCode` props の AuthModal への渡し（L255）

**変更:**
- コメント（L16）: 認証コード入力フローの説明を更新
- AuthModal に渡す props から authCode を削除

### 3. ThreadCreateForm.tsx

**削除:**
- `authCode` state（L51）
- `setAuthCode(data.authCode)` 呼び出し（L78-79）
- `authCode` props の AuthModal への渡し（L209）

**変更:**
- 401レスポンス処理: authCode を読み取る必要なし

### 4. auth/verify/page.tsx

**削除:**
- 認証コード入力フィールド（`auth-code-input`, L357-370付近）
- URLパラメータ `code` の処理
- リクエストボディから `code` を削除

**変更:**
- API URL: `/api/auth/auth-code` → `/api/auth/verify`
- ページの説明文: Turnstile認証のみの案内に変更
- レスポンス型の更新

### 5. verify-page-logic.test.ts

- 認証コードバリデーション関連テストを削除
- Turnstileのみの認証テストに更新

## 完了条件

- [ ] `npx vitest run` 全件PASS
- [ ] `npx tsc --noEmit` エラーなし
- [ ] UI内に `authCode`, `auth-code-display`, `auth-code-input` の残存なし

## スコープ外

- バックエンドAPIの変更（TASK-294で完了済み）
- BDDステップ定義（TASK-296が担当）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全5ファイル修正完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- AuthModal.tsx: authCode props削除、auth-code-display/auth-code-input削除、API URL変更（/api/auth/auth-code → /api/auth/verify）、説明文更新
- PostForm.tsx: authCode state削除、setAuthCode呼び出し削除、AuthModal props更新、AuthRequiredResponse型定義削除
- ThreadCreateForm.tsx: authCode state削除、setAuthCode呼び出し削除、AuthModal props更新
- auth/verify/page.tsx: inputCode/codeParam state削除、auth-code-input削除、API URL変更、説明文更新、型名更新（AuthCodeResponse → AuthVerifyResponse）
- verify-page-logic.test.ts: validateAuthCode削除 → validateTurnstileToken に置換、テスト内容更新（15 tests）

### テスト結果サマリー

- `npx vitest run`: 1758 PASS / 1 FAIL (89 test files)
  - 失敗1件: schema-consistency.test.ts（theme_id/font_id DBカラム未適用・daily_events/pending_async_commands テーブル未作成） — このタスクとは無関係の既存失敗
  - verify-page-logic.test.ts: 15 tests PASS
- `npx tsc --noEmit`: エラーなし
- 対象4ファイルに authCode / auth-code-display / auth-code-input の残存なし
