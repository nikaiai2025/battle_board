# Sprint-146: キュレーションBOT仕様変更（本文収集廃止 + collect-topics INSERT修正）

> 開始: 2026-03-29

## スコープ

curation_bot.feature v3（承認済み）に合わせて実装を更新する。
- 「投稿内容（本文/content）」の収集・保存・表示を全て廃止
- >>1の投稿形式を「バズスコア + 元ネタURL」に変更
- collect-topics の INSERT ユニーク制約違反を修正（ON CONFLICT対応）
- 削除された2シナリオに対応するBDDステップ定義の整理

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/services/bot-strategies/types.ts` | `CollectedTopic.content` と `CollectedItem.content` を削除 |
| `src/lib/collection/adapters/subject-txt.ts` | DAT >>1 取得ロジック削除。`extractFirstPostBody` 関数削除 |
| `src/lib/collection/collection-job.ts` | save() の rows から content 除去。INSERT を upsert（ON CONFLICT DO UPDATE）に変更 |
| `src/lib/services/bot-strategies/behavior/thread-creator.ts` | `formatBody()` を バズスコア+URL形式に変更 |
| `features/step_definitions/curation_bot.steps.ts` | 削除された2シナリオのステップ除去 + 修正されたシナリオへの対応 |
| `features/support/in-memory/collected-topic-repository.ts` | content フィールド除去 |
| `src/lib/infrastructure/repositories/collected-topic-repository.ts` | content フィールド除去 |
| 関連テストファイル | content フィールドの参照を全て除去 |

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 |
|---|---|---|---|
| TASK-373 | キュレーション本文廃止 + collect-topics INSERT修正 + BDDステップ更新 | bdd-coding | - |

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-373 | `src/lib/services/bot-strategies/types.ts`, `src/lib/collection/adapters/subject-txt.ts`, `src/lib/collection/collection-job.ts`, `src/lib/services/bot-strategies/behavior/thread-creator.ts`, `features/step_definitions/curation_bot.steps.ts`, `features/support/in-memory/collected-topic-repository.ts`, `src/lib/infrastructure/repositories/collected-topic-repository.ts` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-373 | completed | 型/アダプター/ジョブ/Strategy/BDD全更新。vitest 2215 / cucumber 412 PASS |
| TASK-GATE-146 | PASS | vitest 2215/BDD 412/E2E 62+1既知/API 27 全PASS |
| TASK-SMOKE-146 | completed | 30/35 PASS（5件ローカル限定スキップ） |
