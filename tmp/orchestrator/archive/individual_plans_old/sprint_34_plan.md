# Sprint-34 計画

> 開始日: 2026-03-17
> ステータス: completed

## スプリント目標

reactions.feature（草コマンド !w）の本格実装 + mypage草カウント表示の実装

## 背景

- GrassHandler は現在 MVP スタブ（メッセージ返却のみ、永続化なし）
- reactions.feature に 22 シナリオ、mypage.feature に草カウント 2 シナリオ（undefined）が存在
- BDDシナリオは承認済みのため即着手可能

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-098 | bdd-architect | 草システム設計（DB・Repository・Handler契約） | なし | `tmp/workers/bdd-architect_TASK-098/` |
| TASK-099 | bdd-coding | 草コア実装（DB + domain rules + repository + GrassHandler書き直し + 単体テスト） | TASK-098 | `src/lib/services/handlers/grass-handler.ts`, `src/lib/domain/rules/grass-rules.ts [NEW]`, `src/lib/domain/models/reaction.ts [NEW]`, `src/lib/infrastructure/repositories/grass-repository.ts [NEW]`, `sql/草関連 [NEW]` |
| TASK-100 | bdd-coding | reactions.feature BDDステップ定義（22シナリオ） | TASK-099 | `features/step_definitions/reactions.steps.ts [NEW]`, `features/support/world.ts` |
| TASK-101 | bdd-coding | mypage草カウント表示 + BDDステップ定義（2シナリオ） | TASK-099 | `src/lib/services/mypage-service.ts`, `src/app/(web)/mypage/`, `features/step_definitions/mypage.steps.ts` |

## 実行順序

```
TASK-098 (architect)
  ↓
TASK-099 (coding: core)
  ↓
TASK-100 (coding: BDD steps) ← 並行可 → TASK-101 (coding: mypage)
```

## 完了条件

- [ ] reactions.feature 22シナリオ全PASS
- [ ] mypage.feature 草カウント2シナリオPASS（undefined解消）
- [ ] 既存テスト全PASS（回帰なし）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 0 failed

## 最終テスト結果

- vitest: 36ファイル / 1005テスト / 全PASS
- cucumber-js: 211シナリオ (202 passed, 9 pending) / 0 failed
  - reactions.feature: 22/22 PASS（新規）
  - mypage.feature 草カウント: 2/2 PASS（undefined→PASS）

## 結果欄

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-098 | completed | 設計書出力 |
| TASK-099 | completed | 草コア実装（55テスト追加） |
| TASK-100 | completed | reactions BDDステップ定義（22シナリオPASS） |
| TASK-101 | completed | mypage草カウント表示（2シナリオPASS） |
| TASK-102 | completed | incentive flaky調査（一過性、修正不要） |
