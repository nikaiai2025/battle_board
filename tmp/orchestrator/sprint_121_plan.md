# Sprint-121 計画: HUMAN-004解消 + リファクタリング2件 + BOT-DIAGクリーンアップ

> 作成: 2026-03-26

## 背景

HUMAN-004（Sprint-56検出のOpenAPI未定義指摘 + 設計判断2件）を人間承認のもと一括解消する。
併せて、Sprint-120で追加した[BOT-DIAG]診断ログを除去する。

## スコープ

| TASK_ID | 内容 | 担当 | locked_files |
|---|---|---|---|
| TASK-319 | OpenAPI仕様書更新 (DOC-003/004/005) | bdd-coding | `docs/specs/openapi.yaml` |
| TASK-320 | 管理API 401→403統一 (MEDIUM-006) | bdd-coding | `src/app/api/admin/dashboard/route.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[userId]/route.ts`, `src/app/api/admin/users/[userId]/posts/route.ts` + テスト |
| TASK-321 | 日次集計タイムゾーンJST境界修正 (MEDIUM-003) | bdd-coding | `src/lib/services/daily-stats-service.ts` + テスト |
| TASK-322 | BOT-DIAG診断ログ除去 | bdd-coding | `src/lib/services/post-service.ts`, `src/lib/services/command-service.ts` |

## 依存関係

4タスクすべて独立（locked_files重複なし）→ 全並行実行可能

## 結果

| TASK_ID | ステータス | 結果 |
|---|---|---|
| TASK-319 | completed | OpenAPI追記完了。認証ルート9本+Internal API 5本+securityScheme追加。DOC-003(inlineSystemInfo)は既に記載済み |
| TASK-320 | completed | admin API 5ファイルの401→403統一。エラーメッセージも`FORBIDDEN`/`管理者権限が必要です`に統一 |
| TASK-321 | completed | 集計クエリ日付境界をJST基準に修正。`getJstDateRange()`新設。テスト+5件。既存5件のテスト失敗も解消 |
| TASK-322 | completed | post-service.ts 4箇所 + command-service.ts 1箇所のBOT-DIAGログ除去 |

## テスト結果

- vitest: 1896テスト 全PASS（+5件: daily-stats JST境界テスト）
- cucumber-js: 331 passed / 16 pending（変更なし）
