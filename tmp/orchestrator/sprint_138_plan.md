---
sprint_id: Sprint-138
status: in_progress
created_at: 2026-03-29
---

# Sprint-138 計画書 — Ops 基盤障害修正

## 背景・目的

運用監視で以下の障害が発見された:

1. **Daily Maintenance 500**: `/api/internal/daily-reset` が断続的に500エラー（03-22以降4回失敗）。
   原因: `performDailyReset` 内の全BOTへの逐次DB呼び出し (O(N)) がVercel Hobby 10秒制限を超過。
2. **CI Failure Notifier 起票失敗**: `ci-failure` ラベルがリポジトリに未作成のため、Issue作成コマンドが失敗。
   → **ラベル作成により即座に解決済み**
3. **collect-topics スケジュール未実行**: GHA schedule トリガーが1度も発火していない（手動dispatchのみ2件）。
   → 手動トリガーで動作確認後、経過観察

## スコープ

| TASK_ID | 担当 | 内容 | ステータス | depends_on |
|---------|------|------|-----------|------------|
| TASK-355 | bdd-coding | `performDailyReset` バッチ化（逐次DB→一括SQL） | **completed** | - |
| TASK-356 | bdd-coding | RPC関数マイグレーション (00035) | **completed** | TASK-355 |
| - | orchestrator | ci-failure ラベル作成 | **completed** | - |
| - | orchestrator | collect-topics 手動トリガー＋経過観察 | **completed** (手動成功) | - |

## locked_files (TASK-355)

- `src/lib/services/bot-service.ts`
- `src/lib/infrastructure/repositories/bot-repository.ts`
- `src/__tests__/lib/services/bot-service.test.ts`

## 完了条件

- `npx vitest run` 全件 PASS
- `npx cucumber-js` 既存 PASS 数維持
- Daily Maintenance を手動dispatch して成功を確認
- CF デプロイ後スモークテスト PASS

## 結果

| TASK_ID | 結果 | 備考 |
|---------|------|------|
| ci-failure label | completed | `gh label create "ci-failure"` で即座に解決 |
| TASK-355 | completed | vitest 2087 PASS / cucumber-js 373 PASS |
| TASK-356 | completed | migration 00035 ローカル適用成功 |
| collect-topics | completed | 手動トリガー成功(34s)。スケジュール実行は経過観察 |
