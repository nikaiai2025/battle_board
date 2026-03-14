# スプリント状況サマリー

> 最終更新: 2026-03-15

## 現在のフェーズ

**Phase 2 準備（専ブラ実機テスト中）**

Sprint-19でChMate毎回認証問題を修正（write_token永続化）+ UIコピーボタン追加。デプロイ後にChMateで実機検証予定。

## Sprint-19 サマリー（ChMate毎回認証問題修正 + UI改善）

ChMate実機テストで発覚した「毎回認証コードが必要」問題を修正。

**主な変更:**
- write_tokenをワンタイム消費→永続化（30日有効、何度でも使用可能）に変更
- buildAuthRequired案内文にwrite_token永続利用案内を追記
- /auth/verifyページにwrite_tokenワンタッチコピーボタン追加
- 案内文を永続化仕様に合わせて更新（30日有効、sage併用例）

**テスト結果:**
- vitest: 18ファイル / 590テスト / 全PASS
- cucumber-js: 95シナリオ / 454ステップ / 全PASS

## Sprint-18 サマリー（専ブラ向けレスポンス改善）

Siki/ChMate実機テストで発見された複数の問題を修正（6タスク）。

**主な変更:**
- `buildAuthRequired` の認証URLを絶対URL化
- Shift-JISデコード順序修正（URLデコード→SJISデコード）
- `sanitizeForCp932()` ラウンドトリップ方式
- `TextDecoder('shift_jis')` 導入（Cloudflare Workers互換）
- verifyEdgeTokenからIPチェック廃止

## Sprint-17 サマリー（認証フロー是正）

本番環境で発見された認証バイパス（G1: 認証コード未入力でも書き込み成功）と関連ギャップ（G2〜G4）を是正。

## Phase 1 完了サマリー

Phase 1（Step 0〜10）の全実装 + フェーズ5検証サイクル + 差し戻し修正が完了。
- 全87 BDDシナリオ PASS（除外3件: Phase 2依存）
- 全468単体テスト PASS
- Critical指摘2件（CR-001: Cookie名不一致, CR-002: authToken漏洩）を修正済み
- ドキュメント整合性指摘1件（C-01: D-08クラスベース記述）を修正済み

## 専ブラ実機テスト状況

| 専ブラ | ホスト | 読み取り | 書き込み | 備考 |
|---|---|---|---|---|
| Siki | Vercel | ✅ | ✅ | 正常動作 |
| Siki | Cloudflare | ✅ | ✅ | 正常動作 |
| ChMate | Vercel | ❌ | ❌ | HTTP:80→308リダイレクトで接続不可（既知。修正予定なし） |
| ChMate | Cloudflare | ✅ | ⚠️ | 読み取り可。書き込みは認証+write_tokenで成功。Sprint-19でwrite_token永続化済み、デプロイ後に再検証 |

### ChMate書き込み対応状況

- **Sprint-18**: 日本語書き込み成功（Shift-JISデコード順序修正）、IPチェック廃止
- **Sprint-19**: write_token永続化（30日有効、ワンタイム消費廃止）。ChMateユーザーはmail欄に `sage#<write_token>` を入れ続けることで認証が継続する
- **将来（Phase 2候補）**: 書き込み確認フロー（`<title>書き込み確認</title>`）でCookie定着を試みる。BDDシナリオ追加が必要（人間承認要）

## Phase 2 着手前の課題

`tmp/phase2_prerequisites.md` に整理済み。進捗:
1. ~~専ブラ互換の実機テスト~~ → 上記テーブル参照。**G5: デプロイ後再検証**
2. ~~ブラウザ自動テスト（E2E）の導入検討~~ → **完了**（Sprint-11）
3. ~~Supabase Localセットアップ（TDR-ENV-001）~~ → **完了**
4. 技術的負債（post-service.ts の Date, >>N ステップ汎用化） → **未着手（優先度低）**
5. Phase 1除外シナリオ3件 → **Phase 2スコープ**
6. ~~統合テスト基盤~~ → **完了**（Sprint-12）
7. ~~APIテスト基盤~~ → **完了**（Sprint-13）
8. ~~Vercelデプロイ + 本番DB構築~~ → **完了**
9. ~~Deployment Protection解除~~ → **完了**
10. Flakyテスト: BDD `スレッド復興ボーナスは付与されない`（incentive.feature）が散発的に失敗する → **未着手（優先度低）**
11. ~~Cloudflare Pages移行~~ → **完了**（Sprint-15）
12. ~~SSR直接import残課題~~ → **完了**（Sprint-16）
13. ~~本番DBリセット手順整備~~ → **完了**（`docs/operations/runbooks/reset-remote-db.md`）
14. ~~認証フロー是正（G1〜G4）~~ → **完了**（Sprint-17）
15. 本番DBマイグレーション適用（00005_auth_verification.sql） → **デプロイ時に実施**

## スプリント履歴

| Sprint | 対応Step | ステータス | 計画書 |
|---|---|---|---|
| Sprint-19 | ChMate毎回認証問題修正（write_token永続化）+ UI改善 | completed | `tmp/orchestrator/sprint_19_plan.md` |
| Sprint-18 | 専ブラ向けレスポンス改善（絶対URL + Shift-JIS + IPチェック廃止 + デコード順序） | completed | `tmp/orchestrator/sprint_18_plan.md` |
| Sprint-17 | 認証フロー是正（G1〜G4: is_verified + write_token） | completed | `tmp/orchestrator/sprint_17_plan.md` |
| Sprint-16 | SSR直接import残課題（キャッシュ制御+ドキュメント+TDR） | completed | `tmp/orchestrator/sprint_16_plan.md` |
| Sprint-15 | Cloudflare Pages移行 | completed | `tmp/orchestrator/sprint_15_plan.md` |
| Sprint-14 | 専ブラ互換URL rewrite修正 + ChMateデバッグ | completed | `tmp/orchestrator/sprint_14_plan.md` |
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

- vitest: 18ファイル / 590テスト / 全PASS
- cucumber-js: 95シナリオ / 454ステップ / 全PASS（除外3件: Phase 2依存）
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
| `tmp/escalations/archive/` | Phase 1 全エスカレーション (5件+ESC-TASK-041-1+ESC-AUTH-REVIEW-1、全resolved) |
| `tmp/workers/archive/` | Phase 1 ワーカー作業空間 |
