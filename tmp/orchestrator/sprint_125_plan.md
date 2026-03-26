# Sprint-125: 削除済みレス非表示バグ修正

> 作成日: 2026-03-26
> ステータス: completed

## 背景

Sprint-123で `findByThreadId` に `.eq("is_deleted", false)` フィルタを追加した結果、スレッド閲覧時に削除済みレスが「このレスは削除されました」表示ではなく完全に非表示になるバグが発生。Feature説明（L6）の設計意図と矛盾するシナリオ（L69-73）もSprint-123で混入していた。

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 |
|---------|------|------|------|
| TASK-327 | findByThreadId is_deletedフィルタ除去 + admin.featureシナリオ修正 | bdd-coding (Opus) | completed |

## TASK-327 結果

### 変更ファイル
- `src/lib/infrastructure/repositories/post-repository.ts`: `findByThreadId` の2分岐から `.eq("is_deleted", false)` 除去
- `features/support/in-memory/post-repository.ts`: `findByThreadId` から `&& !p.isDeleted` 除去
- `features/admin.feature` L69-73: シナリオ名・Thenステップを設計意図に合致するよう修正（人間承認済み）
- `features/step_definitions/admin.steps.ts`: スレッド削除検証を全レス `isDeleted===true` チェックに変更 + 新ステップ定義追加

### エスカレーション
- ESC-TASK-327-1: BDDテスト2件FAIL（admin.feature矛盾）→ 人間承認でfeature修正 → 解決

### テスト結果
- vitest: 1896テスト 全PASS
- cucumber-js: 334 passed, 0 failed
- 本番スモーク: **29/29 PASS**

### その他
- `.claude/commands/adversarial-review.md`: パステンプレートを実運用に合わせて修正
- `tmp/discussion/`: 完了済みレビュー4件をarchiveに移動
