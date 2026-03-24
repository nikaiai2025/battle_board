# Sprint-116 計画書

> 作成日: 2026-03-25

## 目標

パスワード再設定フロントエンド実装。D-06(SCR-006, SCR-007) に基づくページ2つの新規作成と、ログインページへの導線追加。

## 背景

- バックエンド（API routes、Service層、BDDステップ定義、テスト）は全て実装済み（未コミット）
- Supabaseダッシュボードの Reset Password メールテンプレート変更も完了済み
- 残りはフロントエンドページのみ

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-313 | bdd-coding | パスワード再設定ページ2つ + ログインページ改修 | なし | completed |

## 成果物

- `src/app/(web)/auth/forgot-password/page.tsx` (新規)
- `src/app/(web)/auth/reset-password/page.tsx` (新規)
- `src/app/(web)/login/page.tsx` (改修: forgot-passwordリンク追加)

## コミット計画

フロントエンド実装完了後、バックエンド未コミット分と合わせて一括コミット:
- D-06仕様書 (auth-forgot-password.yaml, auth-reset-password.yaml)
- API routes (reset-password, update-password)
- confirm route 改修 (recovery対応)
- Service層 (requestPasswordReset, handleRecoveryCallback, updatePassword)
- BDDステップ定義・インメモリモック
- 単体テスト
- フロントエンドページ (本タスクの成果物)

## 結果

- TASK-313: **completed**
  - `forgot-password/page.tsx` 新規作成 (SCR-006 全8要素ID)
  - `reset-password/page.tsx` 新規作成 (SCR-007 全9要素ID)
  - `login/page.tsx` 改修 (`login-forgot-password-link` 追加)
  - vitest: 95ファイル / 1828テスト 全件PASS
  - cucumber-js: 347シナリオ (331 passed, 16 pending) 全件PASS
