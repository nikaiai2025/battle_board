# スプリント状況サマリー

> 最終更新: 2026-03-12

## 現在のフェーズ

Phase 1: 掲示板の土台構築（全体計画: `tmp/phase1_implementation_plan.md`）

## 直近の完了スプリント

| Sprint | 対応Step | ステータス | 計画書 |
|---|---|---|---|
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
| Step 7.5 | BDD負債返済（Step 1〜7のステップ定義一括実装） | **進行中** (Sprint-8) | Sprint-8 |
| Step 8 | 管理機能 + BDDステップ定義 | 未着手（Step 7.5完了後） | — |
| Step 9 | 専ブラ互換 Adapter + BDDステップ定義 | 未着手（Step 7.5完了後） | — |
| Step 10 | マイページ + 仕上げ + BDDステップ定義 | 未着手（Step 7.5完了後） | — |

## テスト状況

- vitest: 8ファイル / 330テスト / 全PASS
- cucumber-js: 56シナリオ / 303ステップ / 全PASS

## 現在進行中: Sprint-8 (Step 7.5 BDD負債返済)

計画書: `tmp/orchestrator/sprint_8_plan.md`

| TASK_ID | 内容 | ステータス |
|---|---|---|
| TASK-015 | BDDテスト戦略・インフラ設計 | **completed** → `docs/architecture/bdd_test_strategy.md` (D-10) |
| TASK-016 | BDDインフラ実装 + 共通ステップ定義 | **completed** |
| TASK-017 | authentication + posting + thread + currency ステップ定義 | **completed** (26シナリオ全PASS) |
| TASK-018 | incentive ステップ定義 | **completed** |
| TASK-019 | incentive-service.ts バグ修正 | **completed** |

## 次スプリント候補

Step 7.5完了後:
- **Step 8（管理機能）** — AdminService + 管理者UI + BDDステップ定義
- **Step 9（専ブラ互換 Adapter）** — DAT形式・bbs.cgi・subject.txt + BDDステップ定義
- **Step 10（マイページ + 仕上げ）** — マイページUI・日次リセットID残シナリオ + BDDステップ定義

Step 8/9/10は並行実行可能（locked_filesの重複なし）。各Stepの完了条件に `npx cucumber-js` PASSを含む。

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 対象Sprint |
|---|---|
| （まだアーカイブなし） | — |
