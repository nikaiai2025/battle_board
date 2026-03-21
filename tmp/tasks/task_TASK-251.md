---
task_id: TASK-251
sprint_id: Sprint-85
status: completed
assigned_to: bdd-coding
depends_on: [TASK-249]
created_at: 2026-03-21T22:30:00+09:00
updated_at: 2026-03-21T22:30:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
---

## タスク概要

processPendingTutorials でチュートリアルBOTを作成する際の name を修正する。
BDDシナリオ `features/welcome.feature` が「名無しさん」表示名を期待しているのに対し、
現在は `name: "チュートリアルBOT"` で作成している。

## 修正内容

`src/lib/services/bot-service.ts` の `processPendingTutorials()` メソッド内、
`this.botRepository.create()` の呼び出しで:

```typescript
// 修正前
name: "チュートリアルBOT",

// 修正後
name: "名無しさん",
```

BOTの識別は `botProfileKey: "tutorial"` で行うため、name フィールドは表示用途のみ。

## 完了条件
- [x] `npx cucumber-js features/welcome.feature` で11シナリオ全PASS
- [x] `npx vitest run` で全PASS

## スコープ外
- welcome.steps.ts のステップ定義変更
- その他のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記 -->

### チェックポイント
- 状態: 完了
- 完了済み: bot-service.ts 942行目の `name: "チュートリアルBOT"` を `name: "名無しさん"` に変更
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- `src/lib/services/bot-service.ts` L942: `name: "チュートリアルBOT"` → `name: "名無しさん"` 修正完了

### テスト結果サマリー
- `npx cucumber-js features/welcome.feature`: 290 scenarios (16 pending, 274 passed) — FAIL 0件
  - welcome.feature 11シナリオ全PASS確認
- `npx vitest run`: 78 test files passed, 1635 tests passed — FAIL 0件
