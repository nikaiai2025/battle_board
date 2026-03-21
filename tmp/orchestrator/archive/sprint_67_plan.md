# Sprint-67: コマンドパーサー ルール9（スペース省略対応）

> 開始: 2026-03-19
> ステータス: in_progress

## 背景

人間がコマンドシステムの仕様追加を実施。アンカー（>>N）とコマンドの間のスペース省略を許容するルール9の追加。
feature, 実装, 単体テスト, 設計書の一式が人間作業で作成済み。検証と仕上げが必要。

### 人間作業済みの変更
- `features/command_system.feature` — シナリオ2件追加（スペースなし直結認識）
- `src/lib/domain/rules/command-parser.ts` — 正規表現修正（COMMAND_PATTERN, FORWARD_ARG_PATTERN）
- `src/lib/domain/rules/__tests__/command-parser.test.ts` — 単体テスト6件追加
- `docs/architecture/components/command.md` — ルール9追記

## タスク一覧

| TASK_ID | 内容 | 担当 | ステータス |
|---|---|---|---|
| TASK-185 | 単体テスト + BDDテスト実行検証、不具合があれば修正 | bdd-coding | completed |

## 結果

**TASK-185 completed** — 人間実装の正規表現に1件バグ発見・修正。

- **バグ**: `COMMAND_PATTERN` の後読み `(?:^|(?<=[\s\u3000]))` が `>>5!w` の `!w` を検出不可（直前が数字`5`のため）
- **修正**: `(?<=>>\\d+)` を後読みに追加
- vitest: 1381件 PASS（リグレッションなし）
- cucumber-js: 254シナリオ (238 passed, 16 pending, 0 failed) — 新規2シナリオPASS
