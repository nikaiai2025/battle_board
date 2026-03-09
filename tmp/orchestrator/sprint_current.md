# スプリント状況サマリー

> 最終更新: 2026-03-09

## 現在のフェーズ

Phase 1: 掲示板の土台構築（全体計画: `tmp/phase1_implementation_plan.md`）

## 直近の完了スプリント

| Sprint | 対応Step | ステータス | 計画書 |
|---|---|---|---|
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
| Step 7 | Web UI | **次スプリント候補** | — |
| Step 8 | 管理機能 | **着手可能**（Step 7と並行可） | — |
| Step 9 | 専ブラ互換 Adapter | **着手可能**（Step 7と並行可） | — |
| Step 10 | マイページ + 仕上げ | **着手可能**（Step 7と並行可） | — |

## テスト状況

- vitest: 8ファイル / 330テスト / 全PASS

## 次スプリント候補

Step 6完了により、Step 7/8/9/10 がすべて着手可能。実装計画の依存関係:
- **Step 7（Web UI）** — スレッド一覧・スレッド閲覧・書き込みフォーム・認証UI。ブラウザで動く状態になる重要なステップ
- **Step 8（管理機能）** — AdminService + 管理者UI。Step 7と並行可
- **Step 9（専ブラ互換 Adapter）** — DAT形式・bbs.cgi・subject.txt。Step 7と並行可
- **Step 10（マイページ + 仕上げ）** — マイページUI・日次リセットID残シナリオ

並行度を最大化する場合: Step 7 + Step 8 + Step 9 を同一スプリントで並行実行可能（locked_filesの重複なし）

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 対象Sprint |
|---|---|
| （まだアーカイブなし） | — |
