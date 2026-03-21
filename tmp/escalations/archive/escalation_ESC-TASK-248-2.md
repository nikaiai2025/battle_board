---
escalation_id: ESC-TASK-248-2
task_id: TASK-248
status: open
created_at: 2026-03-21T22:00:00+09:00
---

## 問題の内容

TASK-248 のエスカレーション解決後の残作業において、locked_files 外の3ファイルの変更が必要な状態。

### 現在のテスト結果
- `npx cucumber-js`: 279 scenarios, 2 failed, 16 pending, 261 passed
- `npx vitest run`: 78 test files, 1628 tests, all passed

### 完了済み作業
1. InMemoryPostRepo に `countByAuthorId` メソッドを追加済み
2. InMemoryBotRepo に `deleteEliminatedTutorialBots` メソッドを追加済み
3. mypage.feature のページネーション/検索 8シナリオのうち 7シナリオ分のステップ定義を実装済み（26ステップ中25ステップが正常動作）
4. seedDummyPost を `isSystemMessage: true` に修正し、searchByAuthorId の検索結果にダミー投稿が混入しないよう改善済み

### 残る2つの failure

#### Failure 1: mypage.feature「検索結果が0件の場合はメッセージが表示される」

- **対象ファイル**: `features/step_definitions/thread.steps.ts` (locked_files 外)
- **原因**: `"{string} と表示される"` ステップが thread.steps.ts で定義されている。`"まだ書き込みがありません"` のケースは postHistoryResult を使って正しくハンドリングされるが、`"該当する書き込みはありません"` のケースはハンドリングされておらず、スレッド一覧の0件チェックにフォールスルーして失敗する
- **修正案**: thread.steps.ts の `"{string} と表示される"` ステップハンドラに以下の条件を追加:
  ```typescript
  if (message === "該当する書き込みはありません") {
      assert(this.postHistoryResult !== null, "書き込み履歴の取得が実行されていません");
      assert.strictEqual(this.postHistoryResult.posts.length, 0, ...);
      return;
  }
  ```

#### Failure 2: command_system.feature「専ブラからの書き込みに含まれるコマンドが実行される」

- **対象ファイル**: `features/step_definitions/specialist_browser_compat.steps.ts` (locked_files 外)
- **原因**: `ユーザーが専ブラで認証済みである` ステップが seedDummyPost を呼んでいないため、ウェルカムシーケンスが発動し、最新レスの本文がウェルカムメッセージになってしまう
- **修正案**: specialist_browser_compat.steps.ts の `ユーザーが専ブラで認証済みである` ステップに `seedDummyPost(userId)` を追加

### 補足: welcome.feature のテスト実行について

タスク指示書の完了条件（更新版）には「274 passed, 0 failed, 16 pending」とあるが、現在の cucumber.js 設定に `features/welcome.feature` と `features/step_definitions/welcome.steps.ts` が含まれていないため、welcome シナリオは実行対象外（279 total）。274 passed の達成には welcome.feature (11シナリオ) の追加が必要（279 + 11 = 290, 290 - 16 = 274）。

- **対象ファイル**: `cucumber.js` (locked_files 外)
- **修正案**: paths に `features/welcome.feature`、require に `features/step_definitions/welcome.steps.ts` を追加

## 選択肢と各選択肢の影響

### 選択肢A: locked_files に thread.steps.ts, specialist_browser_compat.steps.ts, cucumber.js を追加

- TASK-248 のスコープ内で全修正完了可能
- 影響: 3ファイルの最小限の修正で対応

### 選択肢B: 現状で TASK-248 を完了とし、残る修正を別タスクで対応

- 261 passed / 2 failed / 16 pending で完了
- mypage.feature は 19 シナリオ中 18 シナリオ PASS（1シナリオは thread.steps.ts 依存）
- welcome.feature の cucumber.js 登録は welcome 実装タスクの残作業として扱う

## 関連する feature ファイル・シナリオタグ

- `features/mypage.feature` @書き込み履歴をキーワードや日付範囲で絞り込める (Failure 1)
- `features/command_system.feature` 専ブラからの書き込みに含まれるコマンドが実行される (Failure 2)
- `features/welcome.feature` 全11シナリオ (cucumber.js 未登録)
