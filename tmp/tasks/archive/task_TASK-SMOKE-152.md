---
task_id: TASK-SMOKE-152
sprint_id: Sprint-152
status: done
assigned_to: bdd-smoke
depends_on: [TASK-384]
created_at: 2026-04-15
updated_at: 2026-04-15
locked_files: []
---

## タスク概要

Sprint-152（Daily Maintenance 500 障害修正）の本番スモークテストを実施する。
migration 00043（RPC 型キャスト）/ 00044 / 00045（FK CASCADE × 4 テーブル）の本番適用が完了しているため、本番環境での振る舞いを確認する。

## 実施内容

Playwright による本番スモークテスト全件実行。

## 基準

- 直近の基準値: 31/36 PASS（Sprint-151 時点）
- Sprint-152 での変更は schema 整合性（RPC 型キャスト + FK CASCADE）のみ。UI/API の振る舞い変更は伴わない
- 期待: **31/36 維持** または増加

## 本番検証の補足

daily-maintenance.yml 手動トリガ（run #24427737023）で daily-reset / daily-stats 両ジョブ PASS 済み（Sprint-152 の主検証対象）。本タスクは UI/API 側への副作用なしを確認する補足検証。

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 本番スモークテスト実行・結果記録
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 2026-04-15: デプロイ確認（最新デプロイ 2026-04-14T23:15:37Z、Sprint-152 全コミット含む）
- 2026-04-15: `npx playwright test --config=playwright.prod.config.ts` 実行 → 31 passed / 5 skipped（36テスト中）

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 31/36（5件は `ローカル限定` スキップ） |
| 所要時間 | 54.2s |
| 失敗テスト | なし |
