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
| TASK-113 | bdd-architect | ドキュメント同期（人間承認済み） | assigned | docs/specs/openapi.yaml, docs/architecture/components/admin.md, docs/specs/*_state_transitions.yaml, docs/requirements/ubiquitous_language.yaml |
| TASK-115 | bdd-gate | コード修正の再検証（テスト全件+整合性チェック） | assigned | （読取専用） |
| TASK-116 | bdd-code-reviewer | コード修正の再レビュー | assigned | （読取専用） |

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
- **ステータス**: completed
- OpenAPI 11パス定義追加、admin.md全面改訂、D-05 3ファイル更新、D-02 3用語追加

### TASK-115: コード修正再検証（Opus）
- **ステータス**: completed — **PASS（条件付き）**
- テスト全件PASS、HIGH/LOW修正5件確認済み、監査レポート高リスク6件確認済み
- 残存: auth-service.ts 2箇所 + auth-code-repository.ts 1箇所（中〜低リスク、次スプリント対象）

### TASK-116: コード修正再レビュー（Opus）
- **ステータス**: completed — **APPROVE**
- 前回HIGH 4件 + LOW 1件 全て適切に修正済み
- Date修正（高リスク6件 + 中リスク18件）全件確認済み
- 新たなCRITICAL/HIGH なし
