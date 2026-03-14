# スプリント状況サマリー

> 最終更新: 2026-03-14

## 現在のフェーズ

**Phase 2 準備（前提課題消化中）**

Phase 1完了。Phase 2着手前の前提課題を順次消化中。

## Phase 1 完了サマリー

Phase 1（Step 0〜10）の全実装 + フェーズ5検証サイクル + 差し戻し修正が完了。
- 全87 BDDシナリオ PASS（除外3件: Phase 2依存）
- 全468単体テスト PASS
- Critical指摘2件（CR-001: Cookie名不一致, CR-002: authToken漏洩）を修正済み
- ドキュメント整合性指摘1件（C-01: D-08クラスベース記述）を修正済み

## Phase 2 着手前の課題

`tmp/phase2_prerequisites.md` に整理済み。進捗:
1. ~~専ブラ互換の実機テスト（Vercelデプロイ後）~~ → APIテストで自動化済み（Sprint-13）。本番URL rewrite修正（Sprint-14）。専ブラ実機テストはデプロイ後に確認
2. ~~ブラウザ自動テスト（E2E）の導入検討~~ → **完了**（Sprint-11）
3. ~~Supabase Localセットアップ（TDR-ENV-001）~~ → **完了**
4. 技術的負債（post-service.ts の Date, >>N ステップ汎用化） → **未着手（優先度低）**
10. Flakyテスト: BDD `スレッド復興ボーナスは付与されない`（incentive.feature）が散発的に失敗する → **未着手（優先度低）**
5. Phase 1除外シナリオ3件 → **Phase 2スコープ**
6. ~~統合テスト基盤~~ → **完了**（Sprint-12）
7. ~~APIテスト基盤~~ → **完了**（Sprint-13）
8. ~~Vercelデプロイ + 本番DB構築~~ → **完了**
9. ~~Deployment Protection解除~~ → **完了**

## スプリント履歴

| Sprint | 対応Step | ステータス | 計画書 |
|---|---|---|---|
| Sprint-14 | 専ブラ互換URL rewrite修正 | completed | `tmp/orchestrator/sprint_14_plan.md` |
| Sprint-13 | APIテスト基盤構築 + 専ブラ互換・認証Cookie | completed | `tmp/orchestrator/sprint_13_plan.md` |
| Sprint-12 | 統合テスト基盤構築 | completed | `tmp/orchestrator/sprint_12_plan.md` |
| Sprint-11 | E2Eテスト基盤構築 + 基本機能確認 | completed | `tmp/orchestrator/sprint_11_plan.md` |
| Sprint-10-fix | Phase 5差し戻し: CR-001/CR-002/C-01修正 | completed | `tmp/orchestrator/sprint_10_plan.md` |
| Sprint-10 | Step 10: マイページ + 時刻リファクタ | completed | `tmp/orchestrator/sprint_10_plan.md` |
| Sprint-1〜9 | Step 0〜9: 基盤〜専ブラ互換 | completed | アーカイブ参照 |

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
| Step 8 | 管理機能 + BDDステップ定義 | **completed** | Sprint-9 |
| Step 9 | 専ブラ互換 Adapter + BDDステップ定義 | **completed** | Sprint-9 |
| Step 10 | マイページ + 仕上げ + BDDステップ定義 | **completed** | Sprint-10 |

## テスト状況

- vitest: 15ファイル / 468テスト / 全PASS
- cucumber-js: 87シナリオ / 419ステップ / 全PASS（除外3件: Phase 2依存）
- playwright E2E: 1テスト / 全PASS（基本機能確認フロー）
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

## フェーズ5検証結果

- BDDゲート: 87シナリオ全PASS
- コードレビュー: Critical 2件（修正済）, Warning 5件, Info 5件 → `tmp/reports/code_review_phase1.md`
- ドキュメントレビュー: Critical 1件（修正済）, Warning 4件 → `tmp/reports/doc_review_phase1.md`

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `tmp/orchestrator/archive/sprint_001_009.md` | Sprint 1〜9 計画書統合 |
| `tmp/orchestrator/archive/sprint_8_bdd_guide.md` | Sprint-8 BDDガイド |
| `tmp/tasks/archive/` | Phase 1 全タスク指示書 (TASK-002〜029) |
| `tmp/escalations/archive/` | Phase 1 全エスカレーション (5件、全resolved/closed) |
| `tmp/workers/archive/` | Phase 1 ワーカー作業空間 |
