# Sprint-55: Discord OAuth ルートハンドラー実装

> 開始: 2026-03-19
> ステータス: completed

## 背景

HUMAN-002完了（Discord Developer Portal + Supabase Dashboard設定済み）。RegistrationServiceのDiscord関連メソッド（registerWithDiscord, loginWithDiscord, handleOAuthCallback）は実装・テスト済みだが、これらを呼び出すNext.js APIルートハンドラーが未実装。本スプリントで3本のルートハンドラーを作成し、Discord OAuth フローを本番で動作可能にする。

## スコープ

- `/api/auth/callback` (GET) — OAuth / メール確認共通コールバック
- `/api/auth/register/discord` (POST) — Discord本登録開始（OAuth URL返却）
- `/api/auth/login/discord` (POST) — Discordログイン開始（OAuth URL返却）
- 上記3ルートの単体テスト
- `supabase/config.toml` に Discord プロバイダー設定追加（ローカル開発用）

## スコープ外

- BDDステップ定義のpending解除（D-10 §7.3.1: 外部OAuth依存のためCucumber層では検証不可。意図的pending維持）
- フロントエンドUI（マイページの「Discordで本登録」ボタン等）
- E2Eテスト（後続スプリントで検討）

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-154 | OAuth/Email Callback + Discord登録/ログインルート + テスト + config.toml | bdd-coding | - | completed |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-154 | [NEW] src/app/api/auth/callback/route.ts, [NEW] src/app/api/auth/register/discord/route.ts, [NEW] src/app/api/auth/login/discord/route.ts, [NEW] src/__tests__/api/auth/callback/, [NEW] src/__tests__/api/auth/register/discord/, [NEW] src/__tests__/api/auth/login/discord/, supabase/config.toml |

## 結果

全タスク completed。

| TASK_ID | 結果 |
|---|---|
| TASK-154 | APIルート3本 + 単体テスト22件 + config.toml Discord設定。vitest 55ファイル/1284テスト全PASS |

### テスト状況
- 新規テスト: 22件（callback: 13, register/discord: 5, login/discord: 4）
- 既存テスト: 1262件全PASS
- 合計: 1284件全PASS（既存の schema-consistency 1件FAILは Sprint-54のnext_post_atマイグレーション未適用が原因、本スプリントと無関係）
