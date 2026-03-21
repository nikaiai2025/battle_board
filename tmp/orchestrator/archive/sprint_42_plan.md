# Sprint-42 計画書

> 作成日: 2026-03-17
> ステータス: completed

## スプリント目標

1. **Housekeeping**: 前セッションの§7.3コンプライアンス変更をテスト検証・コミット
2. **Phase 3 BOT基盤（荒らし役）**: executeBotPost + selectTargetThread 実装
3. **Phase 3 BOT設計レビュー**: 多種BOT対応のStrategy設計をアーキテクトに依頼
4. **設計ドキュメント反映**: D-07/D-08にStrategy設計を正式反映

## 背景

Sprint-41完了・Phase 5 APPROVE後、前セッションで§7.3コンプライアンス修正が実施されたが未コミット。
Phase 3のBOT定期書き込み機能は `bot-service.ts` にスタブ（throw Error）として存在し、設計書（bot.md）は完成済み。
BDDシナリオC/D（bot_system.feature）が pending 状態で、Phase 3実装により解消予定。

## 計画修正（スプリント中）

TASK-122完了後、人間レビューにより設計上の問題が発覚:
- `executeBotPost` が荒らし役専用にハードコードされており、Phase 3以降のBOT種別（ネタ師・レイドボス等）を扱えない
- **根本原因**: オーケストレーターがPhase境界をまたぐ実装タスクに対してアーキテクト設計評価を省略した（ステップ3違反）
- TASK-123（API routes + GitHub Actions）は設計レビュー完了まで保留
- TASK-124/125 としてアーキテクト設計レビュー + ドキュメント反映を追加

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | locked_files | 状態 |
|---|---|---|---|---|---|
| TASK-121 | §7.3未コミット変更のテスト検証 + .gitignore更新 | bdd-coding | - | .gitignore | **completed** |
| TASK-122 | executeBotPost + selectTargetThread 実装 + BDDステップ定義更新 | bdd-coding | TASK-121 | bot-service.ts, bot-service.test.ts, bot_system.steps.ts | **completed** |
| TASK-123 | Internal APIルート + GitHub Actionsワークフロー作成 | bdd-coding | TASK-124 | src/app/api/internal/*, .github/workflows/* | **blocked** → 次Sprint |
| TASK-124 | Phase 3 BOTシステム設計レビュー（多種BOT対応） | bdd-architect | - | なし | **completed** |
| TASK-125 | D-07/D-08にStrategy設計を反映 + provider指摘追記 | bdd-architect | TASK-124 | bot.md, architecture.md | **completed** |

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-121 | completed | vitest 1047 PASS, cucumber 219 passed / 9 pending |
| TASK-122 | completed | vitest 1061 PASS (+14), cucumber 221 passed / 7 pending (+2). 荒らし役専用として動作。方針Cで汎用インターフェースの一実装に位置づけ |
| TASK-123 | blocked | Strategy設計完了。次Sprintで実装予定 |
| TASK-124 | completed | 再設計書 + スキーマ提案出力。Strategy パターン（3軸分離）+ 4段階移行計画 |
| TASK-125 | completed | bot.md v6、architecture.md TDR-008。provider指摘反映済み |

## 反省事項

TASK-122の発行時に「Phase 3 で実装予定」のスタブを見て即座にコーディングタスクを発行したが、Phase境界をまたぐ機能実装には**まずアーキテクト設計評価（bdd-architect）を挟むべき**だった。スプリント運営ルールのステップ3「設計が必要なタスク（bdd-architect担当）とコーディングが必要なタスク（bdd-coding担当）を分解する」に違反。

## 次Sprintへの引き継ぎ

bot.md v6 §2.12 に記載された段階的移行計画（4ステップ）を次Sprint以降で実施する:

| Step | 内容 | 依存 |
|---|---|---|
| Step 1 | Strategy インターフェース導入 + 荒らし役の3 Strategy 切り出し | - |
| Step 2 | BotService を Strategy 委譲にリファクタ | Step 1 |
| Step 3 | bot_profiles.yaml スキーマ拡張 | Step 2 |
| Step 4 | ネタ師の Strategy 実装 + collected_topics + 収集ジョブ | Step 3 |

加えて、TASK-123（Internal API + GitHub Actions）は Step 2 完了後に再計画する。
