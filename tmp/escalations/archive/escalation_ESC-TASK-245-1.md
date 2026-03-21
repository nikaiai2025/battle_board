---
esc_id: ESC-TASK-245-1
task_id: TASK-245
status: open
created_at: 2026-03-21T20:30:00+09:00
---

## 問題の内容

mypage.featureの「検索結果が0件の場合はメッセージが表示される」シナリオで、
Cucumberのステップ定義がambiguousエラーになっている。

### 該当シナリオ (features/mypage.feature:118)

```gherkin
Scenario: 検索結果が0件の場合はメッセージが表示される
  Given ユーザーが過去に書き込みを行っている
  When キーワード "存在しないワード12345" で書き込み履歴を検索する
  Then "該当する書き込みはありません" と表示される
```

### ambiguousの原因

featureの `Then "該当する書き込みはありません" と表示される` に対して、
以下の2つのステップ定義が両方マッチするためambiguousになっている。

1. `features/step_definitions/mypage.steps.ts:1455`
   - `'"該当する書き込みはありません" と表示される'`（mypage.steps.tsで新規定義）
   - postHistoryResult.total === 0 を検証する

2. `features/step_definitions/thread.steps.ts:660`
   - `{string} と表示される`（既存の汎用ステップ）
   - "まだ書き込みがありません" の分岐あり。それ以外はスレッドリスト0件チェック

Cucumberは両方がマッチする場合にambiguousエラーを返す。
固有ステップはmypage.steps.tsにあり（locked_files内）、
汎用ステップはthread.steps.tsにある（locked_files外）。

## 選択肢と影響

### 選択肢A: thread.steps.tsを変更する（推奨）

`thread.steps.ts` の `{string} と表示される` ステップに
"該当する書き込みはありません" 分岐を追加する。

```typescript
// thread.steps.tsの該当箇所に追加
if (message === "まだ書き込みがありません") {
  // 既存ロジック
} else if (message === "該当する書き込みはありません") {
  assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
  assert.strictEqual(this.postHistoryResult.total, 0, ...);
} else {
  // 既存ロジック（スレッドリスト0件チェック）
}
```

同時にmypage.steps.tsの固有ステップ `'"該当する書き込みはありません" と表示される'` を削除してambiguousを解消する。

**影響**: thread.steps.tsの変更（locked_files外）が必要。ただしビジネスロジックの変更ではなく、テスト実行の技術的問題の解消のみ。

### 選択肢B: mypage.steps.tsの固有ステップのみ残してthread.steps.tsを削除・置換

thread.steps.tsの `{string} と表示される` から「まだ書き込みがありません」の分岐を
mypage.steps.tsに移行する。ただしthread.steps.tsが他のfeatureでも使われているため影響範囲が大きい。

**影響**: 大規模な変更が必要。選択肢Aより複雑。

### 選択肢C: featureファイルのステップを変更する

`Then "該当する書き込みはありません" と表示される` を
`Then 検索結果が0件であることが確認できる` 等に変更する。

**影響**: featureファイルはAI変更禁止（CLAUDE.md: 人間の承認なしに変更してはならない）。

## 推奨

選択肢Aを推奨。変更内容は最小限（分岐追加のみ）で、テスト実行の技術的問題を解消する。

## 関連ファイル

- 対象featureシナリオ: `features/mypage.feature:118`
- locked_filesの変更済みファイル: `features/step_definitions/mypage.steps.ts`
- 変更が必要なlocked_files外ファイル: `features/step_definitions/thread.steps.ts:660`

## 現在の進捗状況

mypage.featureの19シナリオのうち18がPASS（既存11 + 新規7）。
残る1シナリオ「検索結果が0件の場合はメッセージが表示される」のみambiguousで失敗。
thread.steps.tsへの変更承認を得られれば直ちに解消可能。
