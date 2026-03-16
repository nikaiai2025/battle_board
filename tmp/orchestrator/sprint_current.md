# スプリント状況サマリー

> 最終更新: 2026-03-16

## 現在のフェーズ

**Phase 2 実装中 — Step 1完了、BDD安定化済み、絵文字修正デプロイ済み**

Phase 2 Step 1（コマンド基盤）実装完了。Sprint-25でBDD失敗10件を全修正、Sprint-26で専ブラ絵文字バグ修正。実機16パターン再検証待ち。

## テスト状況

- vitest: 20ファイル / 689テスト / 全PASS
- cucumber-js: 108シナリオ (105 passed, 3 pending) / 0 failed
  - pending 3件: インフラ制約（HTTP:80直接応答2件 + WAF非ブロック1件）— 意図的Pending
- playwright E2E: 1テスト / 全PASS（基本機能確認フロー）
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

## 専ブラ実機テスト状況

| 専ブラ | ホスト | 読み取り | 書き込み | 備考 |
|---|---|---|---|---|
| Siki | Vercel | ✅ | ✅ | 正常動作 |
| Siki | Cloudflare | ✅ | ✅ | 正常動作 |
| ChMate | Vercel | ❌ | ❌ | HTTP:80→308リダイレクトで接続不可（既知。Vercel仕様） |
| ChMate | Cloudflare | ✅ | ✅ | 正常動作（Sprint-20でSecure/SameSite除去により解決） |

## 未実施: 絵文字16パターン実機検証

Sprint-26で専ブラ書き込み時のHTML数値参照→UTF-8逆変換を実装・デプロイ済み。
以下16パターンの実機検証が必要（人間側の作業）:

| # | 書き込み元 | 閲覧先 | フィールド | 絵文字種別 | 検証結果 |
|---|---|---|---|---|---|
| 1-8 | Web | Web/専ブラ | スレタイ/本文 | 通常/末尾注意 | コード分析上OK（未実機確認） |
| 9-16 | 専ブラ | Web/専ブラ | スレタイ/本文 | 通常/末尾注意 | Sprint-26で修正済み（未実機確認） |

## 残課題

- 絵文字16パターン実機検証（Sprint-26修正後）
- Phase 2 Step 2: !tell ハンドラ本実装（AccusationService連携）
- cucumber.js設定にphase2パスを追加
- デザイン・レイアウト改善（機能優先のため後回し）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-26 | 専ブラ絵文字バグ修正（HTML数値参照→UTF-8逆変換） | completed | `tmp/orchestrator/sprint_26_plan.md` |
| Sprint-25 | BDD失敗10件修正（incentive二段階評価 + mypage★置換 + admin削除コメント） | completed | `tmp/orchestrator/sprint_25_plan.md` |
| Sprint-24 | Phase 2 Step 1: コマンド基盤実装（parser+Service+PostService統合） | completed | `tmp/orchestrator/sprint_24_plan.md` |
| Sprint-23 | Phase 2準備: GAP-1〜7解消（仕様確定・ドキュメント更新） | completed | `tmp/orchestrator/sprint_23_plan.md` |
| Sprint-22以前 | Phase 1完了 + 専ブラ互換 + 各種修正 | completed | アーカイブ参照 |

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `tmp/orchestrator/archive/sprint_001_009.md` | Sprint 1〜9 計画書統合 |
| `tmp/orchestrator/archive/sprint_010_019.md` | Sprint 10〜19 計画書統合 |
| `tmp/orchestrator/archive/sprint_020_022.md` | Sprint 20〜22 計画書統合 |
| `tmp/tasks/archive/` | 全タスク指示書 (TASK-002〜062) |
| `tmp/escalations/archive/` | 全エスカレーション (11件、全resolved) |
| `tmp/workers/archive/` | ワーカー作業空間 |
| `tmp/reports/` | Phase 1検証レポート（code_review, doc_review） |
