# テスト結果レポート — TASK-109 / Sprint-38

作成日時: 2026-03-17
実行者: bdd-gate

---

## テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 1047/1047 | 約2.8s |
| BDD (Cucumber.js) | PASS | 219 passed + 9 pending / 228 シナリオ（failed: 0） | 約1.3s |

E2Eテスト（Playwright）はタスク指示書の完了条件に含まれないため、本レポートのスコープ外。

---

## 完了条件チェック

- [x] `npx cucumber-js` 全シナリオ実行完了（219 passed, 9 pending, 0 failed）— 期待値と一致
- [x] `npx vitest run` 全テスト実行完了（1047 passed, 0 failed）— 期待値と一致
- [x] テスト結果レポート作成

---

## 詳細

### 単体テスト（Vitest）

- 実行ファイル数: 39ファイル
- テスト数: 1047件全件PASS、失敗0件
- stderrに出力されているエラーログ（例: `[PostService] IncentiveService.evaluateOnPost failed`）は、エラーハンドリングの動作確認テストが意図的に発生させているエラーであり、テストのFAILではない

### BDD（Cucumber.js）

- シナリオ数: 228件
- 結果内訳: 219 passed / 9 pending / 0 failed
- ステップ数: 1226件（1197 passed / 9 pending / 20 skipped）

#### 9件のpendingシナリオについて

9件のpendingはいずれも `bot_system.feature` のWebブラウザ表示関連シナリオ（撃破済みボットの表示・トグル切り替えなど）。ステップ定義内で明示的に `Pending` を返しており、実装が意図的に未完了とされているもの。failedではないため、完了条件に照らして合格。

---

## 環境情報

- Supabase Local: 停止中（Docker Desktop 未起動）
- BDDテストおよびVitestはインメモリ実装を使用するためSupabase不要。テスト実行に影響なし
- E2Eテスト（Playwright）: Supabase Local が必要なため実行対象外（タスク指示書のスコープ外）

---

## 判定

**PASS** — タスク指示書の完了条件をすべて満たす。
