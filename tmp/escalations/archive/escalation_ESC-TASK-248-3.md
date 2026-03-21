---
escalation_id: ESC-TASK-248-3
task_id: TASK-248
status: open
created_at: 2026-03-21T21:15:00+09:00
---

## 問題の内容

TASK-248 の 3修正（cucumber.js登録、thread.steps.ts分岐追加、specialist_browser_compat.steps.ts seedDummyPost追加）は全て完了し、以前の 2 failures（mypage検索0件、専ブラコマンド）は解消された。

しかし、cucumber.js に welcome.feature / welcome.steps.ts を登録したことで、welcome.steps.ts 内の pre-existing bugs が顕在化し、11シナリオ中 8 シナリオが FAIL している。

### 失敗の原因（全て welcome.steps.ts の既存バグ）

**原因1: InMemoryPendingTutorialRepo が mock-installer.ts に未登録**
- welcome.steps.ts は `InMemoryPendingTutorialRepo` をインポートしている
- InMemory実装 `features/support/in-memory/pending-tutorial-repository.ts` は存在するが、`features/support/mock-installer.ts` に登録されていない
- 結果: `InMemoryPendingTutorialRepo` が undefined となり、`findAll()` 呼び出しで TypeError
- 影響: 6シナリオ（FAIL 1-4, 6, 7）

**原因2: botService.processPendingTutorials が未実装**
- welcome.steps.ts が `botService.processPendingTutorials()` を呼び出している
- BotService にこのメソッドが存在しない（または mock-installer に未登録）
- 影響: 2シナリオ（FAIL 5, 8: チュートリアルBOT関連）

### 現在のテスト結果

```
290 scenarios (8 failed, 16 pending, 266 passed)
1628 vitest tests, all passed
```

- 8 failures は全て welcome.feature のみ
- 以前の 2 failures（mypage + senbra）は解消済み
- 非 welcome シナリオは全て PASS (263 passed + 16 pending)

## 選択肢と影響

### 選択肢A: welcome.steps.ts と mock-installer.ts を locked_files に追加して修正
- mock-installer.ts に InMemoryPendingTutorialRepo を登録
- welcome.steps.ts または BotService の processPendingTutorials を修正
- 影響: 274 passed 達成可能

### 選択肢B: TASK-248 を現状で完了とし、welcome.feature の修正を別タスクに分離
- TASK-248 のスコープ外明記（welcome.steps.ts の変更は禁止）
- 266 passed, 8 failed (welcome only), 16 pending で完了
- 別タスクで welcome.steps.ts インフラ整備

### 選択肢C: welcome.feature を cucumber.js の paths から一時的に除外
- welcome.feature の paths 登録を維持しつつ、name フィルタで 8 失敗シナリオを除外
- 影響: 見かけ上 0 failed にできるが、根本解決にならない

## 関連ファイル
- features/welcome.feature
- features/step_definitions/welcome.steps.ts（locked_files 外）
- features/support/mock-installer.ts（locked_files 外）
- features/support/in-memory/pending-tutorial-repository.ts
