# Sprint-39: Phase 5 差し戻し修正（コード品質）

> 作成日: 2026-03-17

## 目的

Sprint-38 Phase 5検証サイクルで検出されたコード品質問題（HIGH 4件 + LOW 1件）+ テストコード内のDate()モック不整合を修正する。

## 背景

- TASK-110 コードレビューで HIGH 4件・LOW 2件検出
- テストコード内に `new Date()` が多数残存（Date.now()モックと不整合。先の修正は3箇所のみ）
- ドキュメント同期（DOC-HIGH 2件）は人間承認待ちのため別タスクで対応

## タスク一覧

| TASK_ID | 担当 | 内容 | ステータス | locked_files |
|---|---|---|---|---|
| TASK-112 | bdd-coding | APIエラーハンドリング修正 + offset修正 + ip_bans制約修正 + inline_system_info修正 | assigned | src/app/api/admin/**, src/app/api/threads/**, src/lib/services/admin-service.ts, src/lib/infrastructure/repositories/post-repository.ts, src/lib/infrastructure/repositories/ip-ban-repository.ts, supabase/migrations/00012_*.sql |
| TASK-114 | bdd-coding | テストコード内 new Date() → new Date(Date.now()) 一括修正 | assigned | features/step_definitions/**, features/support/** |
| TASK-113 | bdd-architect | ドキュメント同期（人間承認後に起動） | pending_approval | docs/specs/openapi.yaml, docs/architecture/components/admin.md, docs/specs/*_state_transitions.yaml, docs/requirements/ubiquitous_language.yaml |

## 結果

### TASK-112: APIエラーハンドリング + offset + ip_bans + inline_system_info + grass-handler修正
- **ステータス**: completed
- HIGH-001〜004, LOW-002, grass-handler修正, コメント更新 全て完了
- vitest 1047 PASS / cucumber-js 219 passed + 9 pending / 0 failed

### TASK-114: new Date() → new Date(Date.now()) 一括置換
- **ステータス**: completed
- 30ファイル修正（features/ + src/lib/）
- vitest 1047 PASS / cucumber-js 219 passed + 9 pending / 0 failed

### TASK-113: ドキュメント同期
- **ステータス**: pending_approval（人間承認待ち）
