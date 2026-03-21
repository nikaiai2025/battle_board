# Sprint-25 計画書

> 作成日: 2026-03-16

## 目的

既存BDD失敗10件（8 failed + 2 undefined）を修正し、Phase 2実装の土台を安定化させる。

## 問題分析

### 失敗内訳

| カテゴリ | 件数 | feature | 症状 |
|---|---|---|---|
| インセンティブ | 7 failed | incentive.feature | thread_growth/hot_post/thread_revivalボーナスが付与されない、残高不一致 |
| マイページ | 1 failed | mypage.feature | ★→☆置換ロジック未実装（★最強★戦士 → ☆最強☆戦士にならない） |
| 管理者削除コメント | 2 undefined | admin.feature | TASK-069で追加された削除コメント系ステップ定義が未実装 |

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-070 | bdd-architect | incentive BDD失敗の根本原因分析 | なし | completed |
| TASK-071 | bdd-coding | mypage ★→☆置換ロジック修正 | なし | completed |
| TASK-072 | bdd-coding | admin.feature 削除コメント系ステップ定義 + サービス修正 | なし | completed |
| TASK-073 | bdd-coding | incentive BDD失敗修正（二段階評価） | TASK-070 | completed |
| TASK-074 | bdd-coding | admin-service.test.ts 期待値修正 | TASK-072 | completed |

## 結果

全タスク completed。

### テスト結果
- vitest: 20ファイル / 672テスト / 全PASS
- tsc: エラー0件
- cucumber-js: 108シナリオ (105 passed, 3 pending, 0 failed)
  - Sprint-24時点 8 failed + 2 undefined → 全修正

### エスカレーション
- ESC-TASK-072-1: admin-service.tsフォールバックメッセージ不一致 → 選択肢A（サービス修正）で自律解決

### デプロイ
- Vercel: ● Ready
- Cloudflare: デプロイ済み
