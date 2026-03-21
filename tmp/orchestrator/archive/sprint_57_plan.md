# Sprint-57: Phase 5 差し戻し修正（CODE-HIGH + TEST-HIGH）

> 開始: 2026-03-19
> ステータス: completed

## 背景

Sprint-56 Phase 5検証でHIGH指摘8件を検出。うちコード品質4件+テスト監査1件は自律修正可能。OpenAPI関連2件は人間承認必要（HUMAN-004に統合）。

## 修正対象

| ID | 内容 | 対応 |
|---|---|---|
| CODE-HIGH-001 | internal-api-auth.ts タイミング攻撃耐性 | timingSafeEqual置換 |
| CODE-HIGH-002 | daily-stats/route.ts 依存方向違反 | Service層抽出 |
| CODE-HIGH-003 | login/discord/route.ts try-catch欠落 | try-catch追加 |
| CODE-HIGH-004 | register/discord/route.ts try-catch欠落 | try-catch追加 |
| TEST-HIGH-001 | eliminated-bot-display.test.tsx リンク切れ | コメント修正 |

## スコープ外（人間承認待ち）

- DOC-HIGH-001: D-04 OpenAPI に Internal API 3本追加
- DOC-HIGH-002: D-04 OpenAPI に認証ルート7本追加
- MEDIUM/LOW指摘（改善推奨・任意）

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-159 | CODE-HIGH-001〜004 + MEDIUM-003 修正 | bdd-coding | - | completed |
| TASK-160 | TEST-HIGH-001 修正（ステップ定義コメント修正） | bdd-coding | - | completed |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-159 | src/lib/middleware/internal-api-auth.ts, src/app/api/internal/daily-stats/route.ts, [NEW] src/lib/services/daily-stats-service.ts, src/app/api/auth/login/discord/route.ts, src/app/api/auth/register/discord/route.ts, src/__tests__/api/internal/internal-api-auth.test.ts, src/__tests__/api/internal/daily-stats.test.ts, src/__tests__/api/auth/login/discord/route.test.ts, src/__tests__/api/auth/register/discord/route.test.ts, .github/workflows/bot-scheduler.yml, .github/workflows/daily-maintenance.yml |
| TASK-160 | features/step_definitions/bot_system.steps.ts |

→ 重複なし。**並行起動可能**

## 結果

全タスク completed。

| TASK_ID | 結果 |
|---|---|
| TASK-159 | HIGH-001(timingSafeEqual) + HIGH-002(Service抽出) + HIGH-003/004(try-catch) + MEDIUM-003(ymlコメント) — テスト33件PASS |
| TASK-160 | bot_system.steps.ts コメント修正。BDD pending数変化なし |

### テスト状況
- vitest: 56ファイル / 1,271テスト全PASS（+daily-stats-service.test.ts 7件追加）
- cucumber-js: 234シナリオ (227 passed, 7 pending) / 0 failed（変化なし）
- schema-consistency 1件FAILは既知（Sprint-54のnext_post_atマイグレーション未適用）
