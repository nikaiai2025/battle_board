# Sprint-136 計画書

> 作成: 2026-03-28
> 目標: キュレーションBOT Phase 3（DB基盤 + 速報+速報ボット実装）

## スプリントゴール

`features/curation_bot.feature` の全13シナリオをPASSさせる。
- Step 3: `collected_topics` テーブル + `bot_profiles.yaml` スキーマ拡張
- Step 4 Phase A: SubjectTxtAdapter + ThreadCreatorBehaviorStrategy + TopicDrivenSchedulingStrategy + 収集ジョブ

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-349 | bdd-architect | アーキテクト設計: 詳細実装設計書（BDDステップ・Strategy実装・収集アダプター） | — | assigned |
| TASK-350 | bdd-coding | DB基盤: migration 00034 + CollectedTopicRepository + bot_profiles.yaml拡張 | TASK-349 | waiting |
| TASK-351 | bdd-coding | Strategy実装: ThreadCreatorBehaviorStrategy + TopicDrivenSchedulingStrategy + strategy-resolver更新 | TASK-350 | waiting |
| TASK-352 | bdd-coding | 収集ジョブ: collection-job.ts + SubjectTxtAdapter + GitHub Actions workflow | TASK-349 | waiting |
| TASK-353 | bdd-coding | BDDステップ定義: curation_bot.steps.ts + InMemory実装 | TASK-350, TASK-351 | waiting |

## locked_files 管理

| TASK_ID | locked_files |
|---|---|
| TASK-349 | tmp/workers/bdd-architect_TASK-349/ (成果物のみ) |
| TASK-350 | supabase/migrations/00034_collected_topics.sql, config/bot_profiles.yaml, src/lib/infrastructure/repositories/collected-topic-repository.ts, [NEW] features/support/in-memory/collected-topic-repository.ts |
| TASK-351 | src/lib/services/bot-strategies/strategy-resolver.ts, src/lib/services/bot-strategies/types.ts, src/lib/services/bot-service.ts, [NEW] src/lib/services/bot-strategies/behavior/thread-creator.ts, [NEW] src/lib/services/bot-strategies/scheduling/topic-driven.ts |
| TASK-352 | [NEW] src/lib/collection/collection-job.ts, [NEW] src/lib/collection/adapters/subject-txt.ts, [NEW] .github/workflows/collect-topics.yml |
| TASK-353 | [NEW] features/step_definitions/curation_bot.steps.ts |

## 結果

| TASK_ID | 状態 | 備考 |
|---|---|---|
| TASK-349 | — | — |
| TASK-350 | — | — |
| TASK-351 | — | — |
| TASK-352 | — | — |
| TASK-353 | — | — |

## テスト目標

- vitest: 2025+ PASS（新規テスト追加）
- cucumber-js: 361 passed → 374+ passed（curation_bot.feature 13シナリオ追加）
- 本番スモーク: 17/17 PASS維持
