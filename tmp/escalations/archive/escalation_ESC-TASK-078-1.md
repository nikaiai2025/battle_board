---
escalation_id: ESC-TASK-078-1
task_id: TASK-078
status: open
created_at: 2026-03-16T12:30:00+09:00
---

## 問題の内容

TASK-078 において `src/lib/services/command-service.ts` のコンストラクタを変更し `AccusationService` を第2引数として追加しました。

この変更により、既存テストファイル `src/lib/services/__tests__/command-service.test.ts` が壊れています（TSエラー: Expected 2-3 arguments, but got 1）。

`command-service.test.ts` は locked_files に含まれていないため、ワーカーAIの書き込み権限の範囲外です。しかし、このテストを修正しないと完了条件「既存テスト全件PASS（回帰なし）」が満たせません。

## 選択肢と各選択肢の影響

### 選択肢A: command-service.test.ts の修正を許可する（推奨）

- `command-service.test.ts` を locked_files に追加するか、修正を例外として許可する
- 修正内容: 各テストケースで `AccusationService` のモック（`vi.fn()` ベース）を第2引数に追加する
- また `!tell stub は未実装メッセージを返す` というテストケース（行304）は TellHandlerStub が削除されたため、TellHandler の振る舞いに合わせて修正が必要
- **影響**: 既存テスト全件PASS が達成可能

### 選択肢B: CommandService コンストラクタを後方互換に変更する

- `accusationService` を `AccusationService | null = null` のオプション引数にし、null の場合は TellHandlerStub にフォールバック
- **影響**: 設計上の後退（テスト用コードが本番コードに混入）。既存テストは1引数で通るが、TellHandlerStub がソースに残る
- 設計の観点から推奨しない

### 選択肢C: エスカレーションのまま待機

- command-service.test.ts を修正せずにタスクを保留する
- **影響**: TASK-078 が完了できない

## 関連するfeatureファイル・シナリオタグ

- `features/phase2/command_system.feature`
- `features/phase2/ai_accusation.feature`

## 現在の作業状態（エスカレーション時点）

完了済み:
- `src/lib/domain/rules/accusation-rules.ts` — 実装完了
- `src/lib/domain/models/accusation.ts` — AccusationResult型をD-08設計に修正済み
- `src/lib/services/accusation-service.ts` — 実装完了
- `src/lib/services/handlers/tell-handler.ts` — 実装完了
- `src/lib/services/command-service.ts` — TellHandlerStub削除・TellHandler統合完了

未完了:
- `src/__tests__/lib/domain/rules/accusation-rules.test.ts` — 未作成（TSエラー解決後に作成予定）
- `src/__tests__/lib/services/accusation-service.test.ts` — 未作成（TSエラー解決後に作成予定）
- `command-service.test.ts` の修正（locked_files外のため保留中）

## 推奨事項

選択肢A（修正を許可）を推奨します。command-service.test.ts の修正内容は以下の通りです:
1. `createMockAccusationService()` ヘルパー関数を追加する
2. 各テストで `new CommandService(currencyService, accusationService)` の2引数形式に変更
3. `!tell stub は未実装メッセージを返す` テストを削除または変更（TellHandlerStub は削除済みのため）
