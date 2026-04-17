---
escalation_id: ESC-TASK-387-1
task_id: TASK-387
sprint_id: Sprint-154
severity: medium
status: open
escalated_at: 2026-04-17
assigned_to: orchestrator
---

## 問題の内容

TASK-387 では `IBotRepository.deleteEliminatedTutorialBots()` を削除し `deleteEliminatedSingleUseBots()` に差し替えるが、当該インターフェースは locked_files 外の複数ファイルで**モック定義**されており、インターフェース型定義変更だけではTypeScriptコンパイル／既存単体テストが通らない。

locked_files 外で追加修正が必要なファイル（全て `deleteEliminatedTutorialBots: vi.fn()` のモック定義を持つ）:

1. `src/__tests__/lib/services/admin-premium.test.ts` L65
2. `src/__tests__/lib/services/admin-dashboard.test.ts` L73
3. `src/__tests__/lib/services/admin-service.test.ts` L74
4. `src/lib/services/__tests__/admin-service.test.ts` L103
5. `src/__tests__/lib/services/bot-service-scheduling.test.ts` L88
6. `features/support/in-memory/bot-repository.ts` L441（関数本体定義）※タスク指示書 §4 で修正指示あり
7. `features/step_definitions/welcome.steps.ts` L1207, L1220（コメントのみ、修正不要の可能性）

影響の性質:
- いずれもテスト用モック（vi.fn()）のプロパティ名修正のみ
- プロダクションコード（`src/app/`, `src/lib/services/`, `src/lib/infrastructure/`）への波及はない
- BDDシナリオ・APIエンドポイントに影響はない

完了条件「既存単体テスト全件 PASS（`npx vitest run`: 2296+）」「BDDテスト全件 PASS（`npx cucumber-js`: 411+）」を満たすには、少なくとも 1〜5 のテストファイル群と 6 の in-memory 実装の同期が必須。

## 選択肢と各選択肢の影響

### 選択肢A: locked_files を暗黙的に拡張して進める（推奨）

上記 1〜7 のファイル全てにモック定義のプロパティ名変更（`deleteEliminatedTutorialBots` → `deleteEliminatedSingleUseBots`）を適用する。追加変更はプロパティ名の1行単位の機械的な書き換えのみで、モック戻り値・呼び出しシグネチャは全く同じ。

- 影響範囲: テストモック定義のみ。プロダクション振る舞いは不変
- リスク: 極めて低い（SDD原則: インターフェース変更は実装＋テストモックの同期が必然）
- タスク指示書 §4「既存 BDD テストへの影響を確認し、必要に応じて同期」と整合する解釈

### 選択肢B: deleteEliminatedTutorialBots を deprecated 関数として残し両方実装する

旧 `deleteEliminatedTutorialBots` を残し、内部的に `deleteEliminatedSingleUseBots` を呼ぶラッパーにする。既存モック定義は触らずに済む。

- メリット: locked_files 厳守
- デメリット: 削除指示に反する（タスク指示書 §2.3 で「旧メソッドは削除」明記）。デッドコードが残り、`tutorial` のみ対象の旧仕様が混乱を招く

### 選択肢C: 当エスカレーションを起票し人間判断を待つ

本エスカレーションがこれに該当。進行停止。

## 関連するfeatureファイル・シナリオタグ

- `features/bot_system.feature` L116-118「荒らし役ボットは10体が並行して活動する」
- `features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる`（タグ名上の孤児参照。実シナリオなし）
- `features/command_aori.feature` L110-113「煽りBOTは日次リセットで復活しない」
- `features/command_hiroyuki.feature` L40 コメント「使い切り」仕様

## 推奨

**選択肢A**。タスク指示書本文 §4 にも「既存 BDD テストへの影響を確認し、必要に応じて同期」と記載があり、locked_files の列挙が網羅的でなかっただけと解釈可能。モック定義のプロパティ名変更という極めて機械的な同期作業であり、プロダクション振る舞いの変更は伴わない。

オーケストレーター判断を仰ぐ。
