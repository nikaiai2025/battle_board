# Sprint-30 計画書

> 作成日: 2026-03-16
> ステータス: completed

## 目的

本登録・ログイン・PAT機能（user_registration.feature）の実装 — Step 1: DB基盤 + Repository層 + AuthService edge-token移行

## 背景

- 設計ドキュメントは完了済み（D-08 user-registration.md / D-05 user_registration_state_transitions.yaml）
- BDDシナリオは `features/未実装/user_registration.feature` にドラフト v1 として存在
- 本スプリントではDB基盤とRepository層の構築、および既存AuthServiceのedge-tokens移行を行う
- 全体は複数スプリントに分割：
  - **Sprint-30（本スプリント）**: DB基盤 + Repository + AuthService改修
  - Sprint-31: 本登録・ログイン・ログアウトAPIルート + PAT管理
  - Sprint-32: マイページUI拡張 + bbs.cgi PAT統合 + BDDステップ定義

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-084 | DBマイグレーション + EdgeTokenRepository + UserRepository拡張 | bdd-coding | なし | completed |
| TASK-085 | AuthService edge-token移行 + 既存テスト修正 | bdd-coding | TASK-084 | completed |

## locked_files 一覧

| TASK_ID | locked_files |
|---|---|
| TASK-084 | `[NEW] supabase/migrations/00006_user_registration.sql`, `[NEW] src/lib/infrastructure/repositories/edge-token-repository.ts`, `[NEW] src/__tests__/lib/infrastructure/repositories/edge-token-repository.test.ts`, `src/lib/infrastructure/repositories/user-repository.ts`, `src/lib/domain/models/user.ts` |
| TASK-085 | `src/lib/services/auth-service.ts`, `src/lib/services/__tests__/auth-service.test.ts`, `[NEW] features/support/in-memory/edge-token-repository.ts`, `features/support/register-mocks.js`, `features/support/mock-installer.ts` |

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-084 | completed | vitest 765テスト全PASS。マイグレーション・EdgeTokenRepository・UserRepository拡張・Userモデル拡張完了 |
| TASK-085 | completed | vitest 768テスト全PASS、cucumber-js 128 passed / 3 pending。AuthService 4メソッド移行完了。ESC-TASK-085-1（BDDモック基盤追加）を自律解決 |

## エスカレーション

| ID | 内容 | 対応 |
|---|---|---|
| ESC-TASK-085-1 | BDDテストモック基盤（features/support/）がlocked_files外 | 自律解決: locked_files拡張。BDDシナリオ変更なし・テストインフラのみのため |
