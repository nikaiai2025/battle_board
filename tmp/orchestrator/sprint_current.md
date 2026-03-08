# スプリント状況サマリー

> 最終更新: 2026-03-09

## 現在のフェーズ

Phase 1: 掲示板の土台構築（全体計画: `tmp/phase1_implementation_plan.md`）

## 直近の完了スプリント

| Sprint | 対応Step | ステータス | 計画書 |
|---|---|---|---|
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
| Step 6 | インセンティブサービス | **次スプリント候補** | — |
| Step 7 | Web UI | 未着手（Step 5,6 に依存） | — |
| Step 8 | 管理機能 | 未着手（Step 5 に依存）→ **着手可能** | — |
| Step 9 | 専ブラ互換 Adapter | 未着手（Step 5 に依存）→ **着手可能** | — |
| Step 10 | マイページ + 仕上げ | 未着手（Step 5,4 に依存）→ **着手可能** | — |

## テスト状況

- vitest: 7ファイル / 285テスト / 全PASS

## 次スプリント候補

- **Step 6（インセンティブサービス）** — Step 5 完了により着手可能。PostService の TODO プレースホルダーに IncentiveService を統合する
- Step 7（Web UI）は Step 6 完了後
- Step 8（管理機能）/ Step 9（専ブラ互換）/ Step 10（マイページ）は Step 5 完了で着手可能だが、Step 6 との優先度比較が必要

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 対象Sprint |
|---|---|
| （まだアーカイブなし） | — |
