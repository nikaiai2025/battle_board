# Sprint-142: 管理画面BOT管理 + ユーザー語録登録

> 開始: 2026-03-29

## スコープ

### A. 管理画面BOT管理（admin.feature v5）
admin.feature で追加された BOT管理シナリオ4件:
1. スレッド詳細で投稿者の種別を識別できる（BOT/人間/システムバッジ）
2. 活動中のBOT一覧を閲覧できる
3. 撃破済みのBOT一覧を閲覧できる
4. BOTの詳細を確認できる（稼働状態・統計・投稿履歴）

### B. ユーザー語録登録（user_bot_vocabulary.feature）
user_bot_vocabulary.feature 16シナリオ + bot_system.feature 1シナリオ変更:
- マイページから荒らしBOTの語録を登録（20ポイント消費、24時間有効）
- バリデーション（!禁止、30文字上限、空入力）
- 一覧表示（自分の有効語録のみ）
- BOT書き込みへの反映（管理者固定文 + ユーザー語録 = 語録プール）
- bot_system.feature: 「固定文リスト」→「語録プール」に変更

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 | モデル |
|---|---|---|---|---|
| TASK-364 | Backend: BOT管理API | bdd-coding | - | opus |
| TASK-365 | Frontend + BDD: BOT管理UI + ステップ定義4件 | bdd-coding | TASK-364 | opus |
| TASK-366 | Backend: 語録システム（migration + repo + service + strategy改修 + API） | bdd-coding | - | opus |
| TASK-367 | Frontend + BDD: 語録UI + ステップ定義16件 + bot_system.steps.ts更新 | bdd-coding | TASK-366 | opus |

### 依存グラフ・並行実行計画

```
Wave 1 (並行): TASK-364 ─→ Wave 2: TASK-365 ─→ Wave 3 (並行): [365, 367]
               TASK-366 ─→ Wave 2: TASK-367 ─┘   (365と367はファイル競合なし)
```

※ TASK-364 と TASK-366 はファイル競合なし → 並行起動
※ TASK-365 と TASK-367 はファイル競合なし → 並行起動可能

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-364 | `src/app/api/admin/threads/[threadId]/route.ts`, `src/lib/infrastructure/repositories/bot-post-repository.ts`, `src/lib/infrastructure/repositories/bot-repository.ts`, `[NEW] src/app/api/admin/bots/route.ts`, `[NEW] src/app/api/admin/bots/[botId]/route.ts` |
| TASK-365 | `src/app/(admin)/admin/threads/page.tsx`, `src/app/(admin)/admin/layout.tsx`, `features/step_definitions/admin.steps.ts`, `features/support/in-memory/bot-repository.ts`, `features/support/in-memory/bot-post-repository.ts`, `[NEW] src/app/(admin)/admin/bots/page.tsx`, `[NEW] src/app/(admin)/admin/bots/[botId]/page.tsx` |
| TASK-366 | `src/lib/services/bot-strategies/content/fixed-message.ts`, `[NEW] supabase/migrations/00038_user_bot_vocabularies.sql`, `[NEW] src/lib/infrastructure/repositories/user-bot-vocabulary-repository.ts`, `[NEW] src/lib/domain/models/user-bot-vocabulary.ts`, `[NEW] src/lib/domain/rules/vocabulary-rules.ts`, `[NEW] src/lib/services/user-bot-vocabulary-service.ts`, `[NEW] src/app/api/mypage/vocabularies/route.ts` |
| TASK-367 | `features/step_definitions/bot_system.steps.ts`, `[NEW] features/step_definitions/user_bot_vocabulary.steps.ts`, `[NEW] features/support/in-memory/user-bot-vocabulary-repository.ts`, `src/app/(web)/mypage/page.tsx` |

ロック競合: なし（4タスク間で重複ファイルなし）

## 結果

| TASK_ID | ステータス | 新規テスト | 備考 |
|---|---|---|---|
| TASK-364 | completed | 20 PASS | BOT管理API 3エンドポイント + findEliminated |
| TASK-365 | completed | BDD 4シナリオ PASS | BOT管理UI 3ページ + ナビ + バッジ |
| TASK-366 | completed | 56 PASS | 語録Backend 7ファイル新設 + Strategy改修 |
| TASK-367 | completed | BDD 16シナリオ PASS | 語録UI + ステップ定義 + strategy注入 + vitest回帰修正 |

### 最終テスト結果
- vitest: 2211 PASS / 14 failed（全て既存Discord OAuth関連）
- cucumber-js: 435シナリオ / 414 passed / 0 failed / 18 pending / 3 undefined
  - 新規: admin BOT管理 4 + 語録 16 + bot_system語録プール更新 1 = +21
- エスカレーション: 1件（ESC-TASK-367-1: BDDテスト基盤定型変更）→ 自律承認・解決済み
