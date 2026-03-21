---
escalation_id: ESC-TASK-248-4
task_id: TASK-248
status: open
created_at: 2026-03-21T21:25:00+09:00
---

## 問題の内容

TASK-248 の register-mocks.js / mock-installer.ts への InMemoryPendingTutorialRepo 登録は完了した。ESC-TASK-248-3 時点の8件のwelcome.feature失敗のうち4件は解消されたが、残り4件はプロダクションコードの未実装に起因しており、テスト基盤側では対処不可能。

### 残り4件の失敗シナリオと原因

**原因A: `BotService.processPendingTutorials` が未実装（3件）**

- welcome.feature:114 「チュートリアルBOTがスポーンしてユーザーの初回書き込みに !w で反応する」
- welcome.feature:125 「ユーザーがチュートリアルBOTを1回の !attack で撃破できる」
- welcome.feature:134 「チュートリアルBOTは毎回新規スポーンなので必ず生存状態である」

`welcome.steps.ts` が `botService.processPendingTutorials()` を呼び出すが、`src/lib/services/bot-service.ts` にこのメソッドが存在しない。`TypeError: botService.processPendingTutorials is not a function` が発生する。

**原因B: `performDailyReset` がチュートリアルBOTを復活させる（1件）**

- welcome.feature:141 「チュートリアルBOTは日次リセットで復活しない」

`performDailyReset()` の Step 4（`bulkReviveEliminated()`）が全 eliminated ボット（チュートリアルBOT含む）を `isActive=true` に復活させた後、Step 6（`deleteEliminatedTutorialBots()`）を実行する。しかし Step 6 は `isActive=false` のボットを対象とするため、Step 4 で既に復活済みのチュートリアルBOTは削除されない。

## 選択肢と各選択肢の影響

### 選択肢1: TASK-248 のスコープを拡大し、BotService にプロダクションコード変更を含める

- `bot-service.ts` に `processPendingTutorials()` メソッドを実装する
- `performDailyReset()` の Step 4 で `bulkReviveEliminated()` がチュートリアルBOTを除外するよう修正する
- 影響: TASK-248 のスコープ（テスト基盤修正のみ）を逸脱する。プロダクションコード変更が含まれるため、単体テストの追加も必要

### 選択肢2: 4件の失敗を既知のpre-existing bugとしてTASK-248を完了し、別タスクで対応する

- TASK-248 は 270 passed (ESC-TASK-248-3 時点の 266 から +4 改善) で完了とする
- 残り4件は welcome.feature 実装タスク（TASK-243/TASK-246/TASK-247 等）のスコープで対応
- 影響: TASK-248 の完了条件（274 passed, 0 failed）は未達だが、テスト基盤修正の責務は完遂

### 選択肢3: welcome.steps.ts の該当ステップを pending に変更して 0 failed を達成する

- `processPendingTutorials` を呼ぶステップと日次リセットの検証ステップに `return "pending"` を追加
- 影響: 0 failed にはなるが、pending が 16 → 20 に増加。問題を隠蔽するリスクがある

## 関連するfeatureファイル・シナリオタグ

- `features/welcome.feature` -- チュートリアルBOT関連シナリオ（:114, :125, :134, :141）
- `src/lib/services/bot-service.ts` -- processPendingTutorials 未実装、performDailyReset のチュートリアルBOT除外漏れ
