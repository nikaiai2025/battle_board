---
sprint_id: Sprint-139
status: in_progress
created_at: 2026-03-29
---

# Sprint-139 計画書 — ユーザーコピペ管理機能

## 背景・目的

ユーザーがマイページからコピペ(AA)を登録・編集・削除できる機能を実装する。
登録されたコピペは `!copipe` コマンドで全ユーザーが検索・利用できる（グローバル共有）。

人間が事前に以下のドキュメントを作成済み:
- DBマイグレーション: `supabase/migrations/00036_user_copipe_entries.sql`
- OpenAPI仕様: `docs/specs/openapi.yaml`（スキーマ3種 + エンドポイント4本追加）
- 画面要素定義: `docs/specs/screens/mypage.yaml`（コピペ管理セクション追加）
- コンポーネント境界設計: `docs/architecture/components/user-copipe.md`（新規）

## スコープ

| TASK_ID | 担当 | 内容 | ステータス | depends_on |
|---------|------|------|-----------|------------|
| TASK-357 | bdd-coding | UserCopipe CRUD（Repository + Service + API routes + 単体テスト） | assigned | - |
| TASK-358 | bdd-coding | CopipeRepository マージ検索 + CopipeHandler 更新 | assigned | - |
| TASK-359 | bdd-coding | BDDステップ定義（user_copipe.feature 全17シナリオ） | assigned | TASK-357, TASK-358 |

## locked_files

### TASK-357
- `[NEW] src/lib/infrastructure/repositories/user-copipe-repository.ts`
- `[NEW] src/lib/services/user-copipe-service.ts`
- `[NEW] src/app/api/mypage/copipe/route.ts`
- `[NEW] src/app/api/mypage/copipe/[id]/route.ts`
- `[NEW] src/__tests__/lib/services/user-copipe-service.test.ts`
- `[NEW] src/__tests__/lib/infrastructure/repositories/user-copipe-repository.test.ts`
- `[NEW] features/support/in-memory/user-copipe-repository.ts`
- `supabase/migrations/00036_user_copipe_entries.sql`

### TASK-358
- `src/lib/infrastructure/repositories/copipe-repository.ts`
- `src/lib/services/handlers/copipe-handler.ts`
- `src/__tests__/lib/services/handlers/copipe-handler.test.ts`
- `features/support/in-memory/copipe-repository.ts`

### TASK-359
- `[NEW] features/step_definitions/user_copipe.steps.ts`
- `features/support/world.ts`（InMemory登録のみ）

## 完了条件

- `features/user_copipe.feature` 全17シナリオ PASS
- `npx vitest run` 全件 PASS（回帰なし）
- `npx cucumber-js` 既存 PASS 数維持 + 17シナリオ追加
- CF デプロイ後スモークテスト PASS

## 結果

| TASK_ID | 結果 | 備考 |
|---------|------|------|
| TASK-357 | completed | UserCopipe CRUD: Repository+Service+API+InMemory+単体テスト37件PASS。Migration 00036適用 |
| TASK-358 | completed | CopipeRepository マージ検索: findByName→配列化、両テーブル並列検索。単体テスト44件PASS(+5新規) |
| TASK-359 | completed | BDDステップ定義: 16シナリオ全PASS（389 passed / 0 failed）。回帰なし |

### テスト結果（Sprint全体）
- vitest: 2131 PASS / 13 failed（既存Discord OAuth関連のみ）
- cucumber-js: 410シナリオ / 389 passed / 0 failed / 18 pending / 3 undefined
  - +16: user_copipe.feature 全シナリオ追加
