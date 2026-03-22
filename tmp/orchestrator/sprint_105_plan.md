# Sprint-105 計画書

> 開始: 2026-03-23

## 目標

1. 管理者ログインページUI実装（/admin/login）
2. 画面テーマ機能 段階1 設計

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-283 | bdd-architect | テーマ機能段階1 コンポーネント設計 | なし | assigned |
| TASK-284 | bdd-coding | 管理者ログインページUI実装 | なし | assigned |
| TASK-285 | bdd-coding | テーマ機能段階1 実装 | TASK-283 | 待機 |

### TASK-283 locked_files
- （設計のみ、ソースコード変更なし）

### TASK-284 locked_files
- src/app/(web)/admin/login/page.tsx [NEW]
- src/app/(web)/admin/layout.tsx

### TASK-285 locked_files（TASK-283完了後に確定）
- src/lib/domain/models/theme.ts [NEW]
- src/lib/infrastructure/repositories/user-repository.ts
- src/app/api/mypage/theme/route.ts [NEW]
- src/app/(web)/layout.tsx
- src/app/(web)/mypage/page.tsx
- supabase/migrations/00025_add_theme_columns.sql [NEW]
- features/step_definitions/theme.steps.ts [NEW]
- features/support/in-memory/user-repository.ts

## 結果

（実行後に記載）
