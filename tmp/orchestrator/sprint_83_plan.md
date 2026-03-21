# Sprint-83: ウェルカムシーケンス + CF Cron移行 + マイページ拡張 — 設計フェーズ

> 開始日: 2026-03-21
> ステータス: completed

## 背景

人間がBDDシナリオ・仕様ドキュメントを更新し、以下の新機能を定義した:
1. **ウェルカムシーケンス** (welcome.feature v1): 初回書き込みボーナス+50、システムメッセージ、チュートリアルBOT
2. **通貨v5** (currency.feature v5): 登録時の初期通貨を50→0に変更（welcome.featureに移管）
3. **マイページ拡張** (mypage.feature v4): 書き込み履歴のページネーション・検索
4. **CF Cron移行** (TDR-013): GitHub Actions cron → Cloudflare Cron Triggers（5分間隔）

本スプリントは**設計フェーズ**。アーキテクトが各機能のコンポーネント設計を行い、後続の実装スプリント用のタスク分解仕様を作成する。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | locked_files | 状態 |
|---|---|---|---|---|---|
| TASK-236 | bdd-architect | ウェルカムシーケンス + CF Cron + Currency v5 コンポーネント設計 | なし | なし（読取専用） | **completed** |
| TASK-237 | bdd-architect | マイページ ページネーション・検索 コンポーネント設計 | なし | なし（読取専用） | **completed** |

## 人間タスク

| ID | 内容 | ブロック対象 | 状態 |
|---|---|---|---|
| HUMAN-006 | CF Workers secrets 設定: `wrangler secret put BOT_API_KEY`（既存GitHub Secretsと同値） | Phase A デプロイ | **完了** |

## 期待される成果物

- `tmp/workers/bdd-architect_TASK-236/design.md` — ウェルカムシーケンス + CF Cron 実装設計書
- `tmp/workers/bdd-architect_TASK-237/design.md` — マイページ拡張 実装設計書

## 結果

- TASK-236 completed: ウェルカムシーケンス + CF Cron設計完了。Phase A-C + E の5タスク分解案（依存関係付き）
- TASK-237 completed: マイページ拡張設計完了。4タスク分解案（A→B∥D→C）
- HUMAN-006 completed: CF Workers BOT_API_KEY設定済み
- 両設計書を基に Sprint-84（実装フェーズ）へ移行
