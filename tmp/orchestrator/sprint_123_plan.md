# Sprint-123: soft deleteフィルタ修正 + BDDシナリオ追加

> 作成日: 2026-03-26
> ステータス: completed

## 背景

敵対的コードレビュー（thread.feature）で検出されたCRITICAL問題。
`findById`/`findByThreadKey`/`findByThreadId`に`is_deleted=false`フィルタがなく、
管理者が削除したスレッド・レスがURL直接アクセスで閲覧可能。

アーキテクト判定: **対応必須**
人間承認: 済（Feature追加もOK）

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | 依存 |
|---------|------|------|------|------|
| TASK-324 | soft deleteフィルタ追加 + BDDシナリオ追加 | bdd-coding | completed | TASK-323 |

## TASK-324: soft deleteフィルタ修正

### 変更概要

1. **thread-repository.ts**: `findById`/`findByThreadKey`に`.eq("is_deleted", false)`追加
2. **post-repository.ts**: `findByThreadId`に`.eq("is_deleted", false)`追加
3. **InMemory thread-repository.ts**: `findById`/`findByThreadKey`に`!t.isDeleted`追加
4. **AdminService対応**: `deleteThread`の存在確認がfindByIdで動くよう調整（findByIdForAdmin or includeDeletedオプション）
5. **BDDシナリオ追加**: 削除済みスレッド/レスの非表示を検証するシナリオを`admin.feature`に追加
6. **単体テスト追加**: フィルタ動作の検証

### locked_files
- `src/lib/infrastructure/repositories/thread-repository.ts`
- `src/lib/infrastructure/repositories/post-repository.ts`
- `features/support/in-memory/thread-repository.ts`
- `features/support/in-memory/post-repository.ts`
- `src/lib/services/admin-service.ts`
- `features/admin.feature`
- `features/step_definitions/admin.steps.ts`

## 結果

### TASK-324 完了

**変更ファイル:**
- `src/lib/infrastructure/repositories/thread-repository.ts`: `findById`/`findByThreadKey`に`.eq("is_deleted", false)`追加
- `src/lib/infrastructure/repositories/post-repository.ts`: `findByThreadId`の両分岐に`.eq("is_deleted", false)`追加
- `features/support/in-memory/thread-repository.ts`: `findById`/`findByThreadKey`に`isDeleted`チェック追加 + `_findByIdIncludeDeleted`ヘルパー追加
- `features/admin.feature`: 削除済みスレッド/レスの非表示シナリオ3件追加
- `features/step_definitions/admin.steps.ts`: 新シナリオのステップ定義5件追加 + 既存テスト修正
- `admin-service.ts`: 変更不要（findById→null→not_foundが冪等動作として正常）

**テスト結果:**
- vitest: 98ファイル / 1896テスト / 全PASS
- cucumber-js: 355シナリオ (334 passed, 5 undefined, 16 pending, 0 failed)
- エスカレーション: 0件
