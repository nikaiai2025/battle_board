# Sprint-4 計画・結果

> Sprint ID: Sprint-4
> 期間: 2026-03-08
> ステータス: **completed**

---

## 目的

1. Phase 1 Step 4 — 認証サービス（AuthService）+ Turnstileクライアント + 認証API を実装する
2. Sprint-3 で判明した追加マイグレーション — リポジトリ層が前提とするPostgreSQL RPC関数を定義する

## スコープ

| TASK_ID | 対応Step | 内容 | 担当 | ステータス | 依存 |
|---|---|---|---|---|---|
| TASK-006 | Step 4 | 認証サービス（AuthService + TurnstileClient + API Route） | bdd-coding | assigned | なし |
| TASK-007 | (補完) | PostgreSQL RPC関数マイグレーション追加 | bdd-coding | assigned | なし |

## locked_files 競合チェック

| TASK_ID | locked_files |
|---|---|
| TASK-006 | `[NEW] src/lib/infrastructure/external/turnstile-client.ts`, `[NEW] src/lib/services/auth-service.ts`, `[NEW] src/app/api/auth/auth-code/route.ts` |
| TASK-007 | `[NEW] supabase/migrations/00004_create_rpc_functions.sql` |

→ **重複なし。並行実行可能。**

## 完了基準

- [ ] TASK-006: AuthService実装完了、`npx vitest run` PASS
- [ ] TASK-007: RPC関数マイグレーションSQL作成完了

## 結果

### TASK-006: 認証サービス — **completed**

| 成果物 | 内容 |
|---|---|
| `src/lib/infrastructure/external/turnstile-client.ts` | Cloudflare Turnstile検証クライアント（環境変数未設定時フォールバック） |
| `src/lib/services/auth-service.ts` | verifyEdgeToken, issueEdgeToken, issueAuthCode, verifyAuthCode, verifyAdminSession, hashIp, reduceIp |
| `src/app/api/auth/auth-code/route.ts` | POST /api/auth/auth-code エンドポイント |
| `src/lib/services/__tests__/auth-service.test.ts` | AuthService単体テスト（44件追加） |

- テスト: 5ファイル 208件 PASS（前回164件 + 新規44件）
- エスカレーション: なし

### TASK-007: RPC関数マイグレーション — **completed**

| 成果物 | 内容 |
|---|---|
| `supabase/migrations/00004_create_rpc_functions.sql` | increment_thread_post_count, credit_currency, deduct_currency の3関数 |

- テスト: 既存164件 PASS
- エスカレーション: なし

## Sprint-4 判定

- エスカレーション: 0件
- BDDシナリオ変更: なし
- 人間確認要否: **不要**（自律的に次スプリントへ進行可能）
