# Sprint-70 計画: BDDステップスタブ残存バグ修正 + 本登録ページ未実装修正

> 作成日: 2026-03-19

## 背景

1. 本番手動テストで発見されたインシデント 2件（`docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md`）。BDDステップ定義内の「Phase 3 実装予定」スタブにより、テストPASSだが仕様未充足。
2. 人間がE2Eテストを追加し、本登録ページ（`/register/email`, `/register/discord`）が未実装で404を返すことが判明。

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | 重大度 |
|---|---|---|---|---|
| TASK-191 | !attack撃破時の★システム独立レス投稿 | bdd-coding | なし | Medium |
| TASK-192 | ボット「既存スレッドのみ書き込み」検証格上げ | bdd-coding | TASK-191 | Low |
| TASK-193 | 本登録ページ（/register/email, /register/discord）新規作成 | bdd-coding | なし | Medium |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-191 | `src/lib/services/command-service.ts`, `src/lib/services/handlers/attack-handler.ts`, `src/lib/services/post-service.ts`, `features/step_definitions/bot_system.steps.ts` |
| TASK-192 | `features/step_definitions/bot_system.steps.ts` |
| TASK-193 | `[NEW] src/app/(web)/register/email/page.tsx`, `[NEW] src/app/(web)/register/discord/page.tsx` |

**競合:** TASK-191/192 は `bot_system.steps.ts` 重複 → 直列。TASK-193 は独立。

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-191 | completed | 型拡張+独立レス投稿+ステップ実検証化。全テストPASS |
| TASK-192 | completed | assert(true)→InMemoryリポジトリ実検証。全テストPASS |
| TASK-193 | completed | /register/email, /register/discord ページ新規作成。全テストPASS |
