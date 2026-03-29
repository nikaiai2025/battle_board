# Sprint-144: 陳腐化した単体テスト修正（Discord OAuth + スキーマ整合性）

> 開始: 2026-03-29

## スコープ

vitest で常時失敗している 15 テスト（5ファイル）を修正する。
コード変更にテストのモック期待値が追随できていないことが原因。実装の変更は不要。

## 失敗テスト一覧

| ファイル | 失敗数 | 原因 |
|---|---|---|
| `src/__tests__/api/auth/callback/route.test.ts` | 4 | handleOAuthCallback の引数シグネチャ変更に未追随 |
| `src/__tests__/lib/services/registration-service.test.ts` | 5 | 戻り値の形状変更 + rejects の使い方不正 |
| `src/__tests__/api/auth/login/discord/route.test.ts` | 2 | モック期待値が旧シグネチャ |
| `src/__tests__/api/auth/register/discord/route.test.ts` | 2 | モック期待値が旧シグネチャ |
| `src/app/api/auth/verify/__tests__/route.test.ts` | 1 | バリデーション期待値の不一致 |
| `src/__tests__/integration/schema-consistency.test.ts` | 1 | Row型 vs 実DBスキーマの乖離 |

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 |
|---|---|---|---|
| TASK-369 | 失敗テスト15件の修正（テストコードのみ変更） | bdd-coding | - |
| TASK-370 | APIテスト2ファイル修正（品質ゲート差し戻し） | bdd-coding | TASK-369 |

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-369 | `src/__tests__/api/auth/callback/route.test.ts`, `src/__tests__/lib/services/registration-service.test.ts`, `src/__tests__/api/auth/login/discord/route.test.ts`, `src/__tests__/api/auth/register/discord/route.test.ts`, `src/app/api/auth/verify/__tests__/route.test.ts`, `src/__tests__/integration/schema-consistency.test.ts` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-369 | completed | 6ファイル15テスト修正。vitest 2224 PASS（回帰なし） |
| TASK-GATE-144 | FAIL→再検証PASS | vitest 2224/BDD 414/E2E 34+1既知/API 28 全PASS |
| TASK-370 | completed | auth-cookie期待値修正 + senbra-compat cleanupDatabase FK順序修正 |
| TASK-SMOKE-144 | completed | 30/35 PASS（5件ローカル限定スキップ） |
