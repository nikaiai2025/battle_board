# スプリント状況サマリー

> 最終更新: 2026-03-15

## 現在のフェーズ

**Phase 2 準備（専ブラ実機テスト中）**

Sprint-18で専ブラ向けレスポンス改善（絶対URL化 + Shift-JIS文字化け修正）が完了。デプロイ後にSiki/ChMateで実機検証予定。

## Sprint-18 サマリー（専ブラ向けレスポンス改善）

Siki実機テストで発見された2つの問題を修正。

**主な変更:**
- `buildAuthRequired` の認証URLを相対パスから絶対URL（`{baseUrl}/auth/verify?...`）に変更
- `ShiftJisEncoder` に `sanitizeForCp932()` メソッド追加: CP932未マッピング文字（絵文字等）を全角 `？` に自動置換

**テスト結果:**
- vitest: 18ファイル / 568テスト / 全PASS
- cucumber-js: 95シナリオ / 454ステップ / 全PASS

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
| ChMate | Cloudflare | ✅ | ❌ | 読み取り可。書き込み認証フローに問題（G5: Sprint-17修正後に再検証予定） |

### ChMate書き込み問題（G5: デプロイ後に再検証）

- **Sprint-17修正の影響**: G1+G4修正により認証フローが正常化。未検証edge-tokenに対して一貫して認証案内を返すようになったため、無限ループ発生リスクは低減
- **残タスク**: デプロイ後にChMateで実機テストし、`buildAuthRequired` のHTMLがChMateに正しく認識されるか確認

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
| Sprint-18 | 専ブラ向けレスポンス改善（絶対URL + Shift-JIS文字化け） | completed | `tmp/orchestrator/sprint_18_plan.md` |
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

- vitest: 18ファイル / 568テスト / 全PASS
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
