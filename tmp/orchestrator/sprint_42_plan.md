# Sprint-42 計画書

> 作成日: 2026-03-17
> ステータス: in_progress

## スプリント目標

1. **Housekeeping**: 前セッションの§7.3コンプライアンス変更をテスト検証・コミット
2. **Phase 3**: BOT定期書き込み基盤（executeBotPost + selectTargetThread 実装）

## 背景

Sprint-41完了・Phase 5 APPROVE後、前セッションで§7.3コンプライアンス修正が実施されたが未コミット。
Phase 3のBOT定期書き込み機能は `bot-service.ts` にスタブ（throw Error）として存在し、設計書（bot.md）は完成済み。
BDDシナリオC/D（bot_system.feature）が pending 状態で、Phase 3実装により解消予定。

## 優先度判定

| 課題 | 優先度基準 | 判定 |
|---|---|---|
| §7.3未コミット変更 | ブロッカー（Phase 3作業前にクリーンな状態が必要） | 最高 |
| executeBotPost + selectTargetThread | BDDシナリオ存在・未実装 | 高 |
| Internal API + GitHub Actions | Phase 3完成に必要 | 高 |

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | locked_files | 状態 |
|---|---|---|---|---|---|
| TASK-121 | §7.3未コミット変更のテスト検証 + .gitignore更新 | bdd-coding | - | .gitignore | assigned |
| TASK-122 | executeBotPost + selectTargetThread 実装 + BDDステップ定義更新 | bdd-coding | TASK-121コミット後 | bot-service.ts, bot-service.test.ts, bot_system.steps.ts | pending |
| TASK-123 | Internal APIルート + GitHub Actionsワークフロー作成 | bdd-coding | TASK-122 | src/app/api/internal/*, .github/workflows/* | pending |

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-121 | - | - |
| TASK-122 | - | - |
| TASK-123 | - | - |
