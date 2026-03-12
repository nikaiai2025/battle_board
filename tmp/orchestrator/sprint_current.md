# スプリント状況サマリー

> 最終更新: 2026-03-13

## 現在のフェーズ

Phase 1: 掲示板の土台構築（全体計画: `tmp/phase1_implementation_plan.md`）

## 直近の完了スプリント

| Sprint | 対応Step | ステータス | 計画書 |
|---|---|---|---|
| Sprint-8 | Step 7.5: BDD負債返済 | completed | `tmp/orchestrator/sprint_8_plan.md` |
| Sprint-7 | Step 7: Web UI | completed | `tmp/orchestrator/sprint_7_plan.md` |
| Sprint-6 | Step 6: インセンティブサービス | completed | `tmp/orchestrator/sprint_6_plan.md` |
| Sprint-5 | Step 5: 書き込み + スレッド管理 | completed | `tmp/orchestrator/sprint_5_plan.md` |
| Sprint-4 | Step 4 + RPC関数補完 | completed | `tmp/orchestrator/sprint_4_plan.md` |
| Sprint-3 | Step 3: リポジトリ層 | completed | `tmp/orchestrator/sprint_3_plan.md` |
| Sprint-2 | Step 1 + Step 2 (並行) | completed | `tmp/orchestrator/sprint_2_plan.md` |
| Sprint-1 | Step 0: プロジェクト基盤整備 | completed | `tmp/orchestrator/sprint_1_plan.md` |

## Phase 1 進捗一覧

| Step | 内容 | ステータス | Sprint |
|---|---|---|---|
| Step 0 | プロジェクト基盤整備 | **completed** | Sprint-1 |
| Step 1 | DBスキーマ（マイグレーションSQL） | **completed** | Sprint-2 |
| Step 2 | ドメインモデル + 純粋関数 + vitest 単体テスト | **completed** | Sprint-2 |
| Step 3 | リポジトリ層 | **completed** | Sprint-3 |
| Step 4 | 認証サービス (AuthService) | **completed** | Sprint-4 |
| Step 5 | 書き込み + スレッド管理 | **completed** | Sprint-5 |
| Step 6 | インセンティブサービス | **completed** | Sprint-6 |
| Step 7 | Web UI | **completed** | Sprint-7 |
| Step 7.5 | BDD負債返済 | **completed** | Sprint-8 |
| Step 8 | 管理機能 + BDDステップ定義 | **進行中** (Sprint-9) | Sprint-9 |
| Step 9 | 専ブラ互換 Adapter + BDDステップ定義 | **進行中** (Sprint-9) | Sprint-9 |
| Step 10 | マイページ + 仕上げ + BDDステップ定義 | 未着手 | — |

## テスト状況

- vitest: 14ファイル / 436テスト / 全PASS
- cucumber-js: 78シナリオ / 389ステップ / 全PASS（除外3件: Phase2コマンド1件 + インフラ制約2件）

## 現在進行中: Sprint-9 (Step 8 + Step 9 並行)

計画書: `tmp/orchestrator/sprint_9_plan.md`

| TASK_ID | 内容 | ステータス |
|---|---|---|
| TASK-020 | AdminService + 管理者認証実装 | **completed** |
| TASK-021 | admin + authentication管理者 BDDステップ定義 | **completed** |
| TASK-022 | 専ブラAdapterコア実装 | **completed** |
| TASK-023 | 専ブラRoute Handler実装 | **completed** |
| TASK-024 | specialist_browser_compat BDDステップ定義 | **completed** |

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 対象Sprint |
|---|---|
| （まだアーカイブなし） | — |
