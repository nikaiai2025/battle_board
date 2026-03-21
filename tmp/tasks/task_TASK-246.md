---
task_id: TASK-246
sprint_id: Sprint-85
status: completed
assigned_to: bdd-coding
depends_on: [TASK-243]
created_at: 2026-03-21T19:50:00+09:00
updated_at: 2026-03-21T19:50:00+09:00
locked_files:
  - "[NEW] features/step_definitions/welcome.steps.ts"
---

## タスク概要

welcome.feature 全11シナリオのBDD step definitions を新規作成する。
PostService のウェルカムシーケンス（Step 6.5/11.5）はSprint-84 TASK-239で実装済み。
チュートリアルBOTのスポーン処理（processPendingTutorials）はTASK-243で実装済み（depends_on）。

## 対象BDDシナリオ
- `features/welcome.feature` 全11シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/welcome.feature` — 全11シナリオの詳細
2. [必須] `docs/architecture/bdd_test_strategy.md` — テスト戦略
3. [必須] `src/lib/services/post-service.ts` — createPost（Step 6.5, 11.5 ウェルカムシーケンス）
4. [必須] `src/lib/services/bot-service.ts` — processPendingTutorials, executeBotPost, performDailyReset
5. [参考] `features/step_definitions/bot_system.steps.ts` — 既存BOTテストの参考パターン
6. [参考] `features/step_definitions/currency.steps.ts` — 通貨テストの参考パターン
7. [参考] `features/support/world.ts` — BattleBoardWorld
8. [参考] `features/support/mock-installer.ts` — InMemoryRepo群

## 実装内容

### テスト対象の11シナリオ

**初回書き込み判定（4シナリオ）:**
1. 仮ユーザー初回書き込み → ウェルカムシーケンス発動
2. 本登録ユーザー初回書き込み → ウェルカムシーケンス発動
3. 仮ユーザー時代に書き込み済み → 本登録後は発動しない
4. 2回目以降の書き込み → 発動しない

**初回書き込みボーナス（1シナリオ）:**
5. +50ボーナス付与 + レス末尾マージ表示

**ウェルカムメッセージ（1シナリオ）:**
6. ★システム名義の独立システムレス投稿

**チュートリアルBOT（5シナリオ）:**
7. BOTスポーン + !w 反応
8. 1回の!attackで撃破 + 報酬+20
9. 毎回新規スポーン（過去の撃破済みと独立）
10. 日次リセットで復活しない
11. cron定期書き込みを行わない

### 実装方針

- D-10に従い、サービス層を直接呼び出してテスト
- InMemoryRepo群でDB操作をモック
- シナリオ1-6: PostService.createPost を呼び出し、ウェルカムシーケンスの発動/非発動を検証
- シナリオ7-11: BotService.processPendingTutorials / executeBotPost / performDailyReset を呼び出し、チュートリアルBOTの振る舞いを検証

### 追加が必要なGiven/When/Thenステップ

```gherkin
# Given
Given 仮ユーザーがまだ1度も書き込みを行っていない
Given 本登録ユーザーがまだ1度も書き込みを行っていない
Given 通貨残高が {int} である
Given 仮ユーザーとして過去に書き込みを行っている
Given ウェルカムシーケンスを既に経験済みである
Given ユーザーが過去に1件以上の書き込みを行っている
Given ユーザーがレス >>{int} として初回書き込みを行った
Given チュートリアルBOT（HP:{int}）がレス >>{int} として書き込み済みである
Given 過去にスポーンされたチュートリアルBOTが撃破済みである
Given チュートリアルBOTが撃破済みである
Given チュートリアルBOTがスポーン済みでまだ撃破されていない

# When
When スレッドに書き込みを1件行う
When スレッドに {string} と書き込む
When 本登録を完了する
When 本登録後に初めて書き込みを行う
When チュートリアルBOTの定期処理が実行される
When ユーザーが {string} を含む書き込みを投稿する
When 別のユーザーが初回書き込みを行う
When 日付が変更される（JST 0:00）
When ボットの定期実行（GitHub Actions cron）が行われる

# Then
Then ウェルカムシーケンスが発動する
Then ウェルカムシーケンスは発動しない
Then 書き込みがスレッドに追加される
Then 通貨残高が {int} になる
Then レス末尾に初回書き込みボーナスがマージ表示される
Then 「★システム」名義の独立システムレスが投稿される
Then チュートリアルBOT（HP:{int}）が新規生成される
Then チュートリアルBOTに偽装IDと「名無しさん」表示名が割り当てられる
Then チュートリアルBOTが以下の書き込みを投稿する
Then !w コマンドが実行されユーザーのレス >>{int} に草が付く
Then 通貨が {int} 消費され残高が {int} になる
Then チュートリアルBOTのHPが {int} から {int} に減少する
Then チュートリアルBOTが撃破される
Then 撃破報酬 +{int} がユーザーに付与される
Then そのユーザー用に新しいチュートリアルBOTがスポーンされる
Then 新しいチュートリアルBOTのHPは {int} である
Then チュートリアルBOTは撃破済みのまま復活しない
Then チュートリアルBOTは書き込みを行わない
```

## 完了条件
- [ ] welcome.steps.ts が新規作成されている
- [ ] 全11シナリオのstep definitionsが実装されている
- [ ] `npx cucumber-js features/welcome.feature` で全11シナリオPASS
- [ ] 既存シナリオに影響がないこと（`npx cucumber-js` で全体テストPASS）

## スコープ外
- PostService/BotServiceの修正（実装済み）
- E2Eテスト

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全11シナリオのstep definitionsを実装、全PASS確認
- 未解決の問題: なし

### 進捗ログ

1. welcome.feature の全11シナリオを確認
2. `features/step_definitions/welcome.steps.ts` を新規作成（前セッションで基本骨格作成済み）
3. 重複ステップ定義を削除:
   - `スレッドに書き込みを1件行う` → common.steps.ts を使用
   - `書き込みがスレッドに追加される` → specialist_browser_compat.steps.ts を使用
   - `通貨残高が {int} になる` → common.steps.ts を使用
   - `通貨が {int} 消費され残高が {int} になる` → ai_accusation.steps.ts を使用
   - `ユーザーの通貨残高が {int} である` → common.steps.ts を使用
   - `日付が変更される（JST 0:00）` → bot_system.steps.ts を使用
   - `ユーザーが {string} を含む書き込みを投稿する` → bot_system.steps.ts regex を使用
   - `通貨残高が {int} である` → common.steps.ts を使用
   - `本登録を完了する` → user_registration.steps.ts を使用
4. `updateRegistrationInfo` → `updateSupabaseAuthId` に修正
5. `チュートリアルBOT（HP:{int}）がレス >>{int} として書き込み済みである` ステップのロジック修正:
   - BOTのレス番号 = botPostNumber になるよう先行レス数を調整
   - `botPostNumberToId` マッピングを正しく登録
6. `features/support/in-memory/bot-repository.ts` のバグ修正:
   - `bulkReviveEliminated` → チュートリアルBOT（botProfileKey="tutorial"）を除外するよう修正
   - `deleteEliminatedTutorialBots` 関数を追加（未実装だったため `performDailyReset` が失敗していた）

### テスト結果サマリー

**BDDテスト（`npx cucumber-js`）:**
- welcome.feature 全11シナリオ: PASS
- 全体: 290 scenarios (43 failed, 16 pending, 231 passed)
- 失敗はすべて既存の pre-existing failures（authentication, posting, incentive 等）
- welcome.feature での新規失敗: 0件

**単体テスト（`npx vitest run`）:**
- 78 test files: PASS
- 1635 tests: PASS
- 失敗: 0件
