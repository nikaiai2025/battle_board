# Sprint-85: Welcome Sequence Wave 3 + Mypage UI + BDD Steps

> 開始日: 2026-03-21
> ステータス: completed

## 背景

Sprint-84で実装したウェルカムシーケンス・マイページ拡張の残りを完成させる。
チュートリアルBOTのスポーン処理（非同期部分）、マイページUIのページネーション・検索、
全新規BDDシナリオのstep definitions、D-08ドキュメント更新を実施する。

## タスク一覧

### Wave 1-2（初期タスク）

| TASK_ID | 担当 | 内容 | 状態 |
|---|---|---|---|
| TASK-243 | bdd-coding | processPendingTutorials + bot/execute拡張 | ~~completed~~ 変更消失→TASK-249で再実装 |
| TASK-244 | bdd-coding | Mypage UI PostHistorySection | ~~completed~~ page.tsx統合消失→TASK-250で再実装 |
| TASK-245 | bdd-coding | Mypage BDD step definitions（8シナリオ） | **completed** |
| TASK-246 | bdd-coding | Welcome BDD step definitions（11シナリオ） | **completed** |
| TASK-247 | bdd-coding | D-08 ドキュメント更新 | ~~completed~~ 変更消失→TASK-250で再実装 |
| TASK-248 | bdd-coding (Opus) | BDDリグレッション修正（seedDummyPost + InMemory登録） | **completed** |

### Wave 3（消失した変更の再実装 + 修正）

| TASK_ID | 担当 | 内容 | 状態 |
|---|---|---|---|
| TASK-249 | bdd-coding (Opus) | processPendingTutorials再実装 + 単体テスト7件追加 | **completed** |
| TASK-250 | bdd-coding | InMemory bulkReviveEliminated修正 + page.tsx統合 + D-08 docs | **completed** |
| TASK-251 | bdd-coding | tutorial BOT name修正（"チュートリアルBOT"→"名無しさん"） | **completed** |

## 結果

### テスト結果
- **cucumber-js: 290 scenarios, 274 passed, 0 failed, 16 pending**
- **vitest: 78 files, 1635 tests, all passed**

### 成果物
- processPendingTutorials: pending検出→BOT生成→executeBotPost→pending削除フロー完成
- bot/execute route.ts: tutorials フィールド追加
- BDD step definitions: mypage 8シナリオ + welcome 11シナリオ = 19新規シナリオ全PASS
- BDD基盤: seedDummyPost（welcome sequence抑制）+ InMemoryPendingTutorialRepo登録
- InMemory bulkReviveEliminated: tutorial BOT除外（本番実装と一致）
- PostHistorySection: ページネーション・検索UIコンポーネント + page.tsx統合
- D-08 docs: bot.md, posting.md, currency.md をSprint-84/85実装に合わせて更新
- 単体テスト: +7件（processPendingTutorials 5 + route tutorials 2）
