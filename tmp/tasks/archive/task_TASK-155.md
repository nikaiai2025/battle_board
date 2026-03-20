---
task_id: TASK-155
sprint_id: Sprint-56
status: assigned
assigned_to: bdd-gate
depends_on: []
created_at: 2026-03-19T13:00:00+09:00
updated_at: 2026-03-19T13:00:00+09:00
artifacts_dir: tmp/workers/bdd-gate_TASK-155
locked_files: []
---

## タスク概要

Phase 5 検証サイクルの一環として、BDDシナリオ全件実行を行う。Sprint-46〜55の変更がBDDシナリオの振る舞いに影響を与えていないことを確認する。

## 対象スプリント
- Sprint-46〜55（計画書: `tmp/orchestrator/sprint_46_plan.md` 〜 `sprint_55_plan.md`）

## Sprint-46〜55で変更されたファイル一覧
`tmp/orchestrator/sprint_56_plan.md` の「変更ファイル一覧」セクションを参照。

## 実行すべきテスト

### 1. BDDテスト（cucumber-js）
```bash
npx cucumber-js
```
期待値: 227 passed, 7 pending, 0 failed

### 2. 単体テスト（vitest）
```bash
npx vitest run
```
期待値: 55ファイル / 1,284テスト / 全PASS（schema-consistency 1件FAILは既知: Sprint-54のnext_post_atマイグレーション未適用）

### 3. E2Eテスト（playwright）
注意: ローカルサーバーが必要な場合はスキップ可（事前起動されていない場合）。実行可能であれば:
```bash
npx playwright test tests/e2e/smoke/
npx playwright test tests/e2e/flow/
```

## 出力
- `tmp/workers/bdd-gate_TASK-155/gate_report.md` — 実行結果サマリー

## 完了条件
- [ ] cucumber-js 全件実行、結果をレポートに記録
- [ ] vitest 全件実行、結果をレポートに記録
- [ ] FAIL が0件（既知の schema-consistency を除く）であればAPPROVE
- [ ] FAILがあればFAIL箇所の詳細をレポートに記録

## 作業ログ

### テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| BDD (Cucumber.js) | PASS | 227/234 (7 pending) | 0.944s |
| 単体テスト (Vitest) | FAIL (既知) | 1262/1263 | 4.58s |
| E2E (Playwright) | PASS | 13/13 | 24.1s |

**総合判定: APPROVE**

Vitestの1件FAILは `schema-consistency.test.ts` における `BotRow.next_post_at` の未マイグレーション（Sprint-54既知不具合）。他すべてPASS。

### チェックポイント
- 状態: 完了
- 完了済み: cucumber-js実行、vitest実行、playwright実行、レポート作成
- 次にすべきこと: なし
- 未解決の問題: schema-consistency FAIL（Sprint-54既知、マイグレーション未適用）
