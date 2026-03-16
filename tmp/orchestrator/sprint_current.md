# スプリント状況サマリー

> 最終更新: 2026-03-16

## 現在のフェーズ

**Phase 2 実装中 — Step 1完了、BDD安定化済み**

Phase 2 Step 1（コマンド基盤）実装完了。Sprint-25でBDD失敗10件を全修正し、テスト基盤が安定。

## Phase 1 完了状況

- 全実装Step 0〜10: completed
- フェーズ5検証: PASS（Critical指摘全修正済み）
- 専ブラ互換: Siki/ChMate共に正常動作（Sprint-18〜20で修正・検証完了）
- Web UI機能整備: マイページ導線開通 + API認証整合（Sprint-22）

## テスト状況

- vitest: 20ファイル / 672テスト / 全PASS
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

## 残課題

- Phase 2 Step 2: !tell ハンドラ本実装（AccusationService連携）
- cucumber.js設定にphase2パスを追加
- デザイン・レイアウト改善（機能優先のため後回し）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-25 | BDD失敗10件修正（incentive二段階評価 + mypage★置換 + admin削除コメント） | completed | `tmp/orchestrator/sprint_25_plan.md` |
| Sprint-24 | Phase 2 Step 1: コマンド基盤実装（parser+Service+PostService統合） | completed | `tmp/orchestrator/sprint_24_plan.md` |
| Sprint-23 | Phase 2準備: GAP-1〜7解消（仕様確定・ドキュメント更新） | completed | `tmp/orchestrator/sprint_23_plan.md` |
| Sprint-22 | Web UI機能整備（マイページ導線 + 認証整合） | completed | アーカイブ参照 |
| Sprint-20〜21 | ChMate Cookie根本原因解決 + 新規BDDシナリオ実装 + ログ除去 | completed | アーカイブ参照 |
| Sprint-17〜19 | 認証フロー是正 + 専ブラ向けレスポンス改善 + ChMate調査 | completed | アーカイブ参照 |
| Sprint-10〜16 | Phase 1完了 + テスト基盤 + CF移行 + SSR修正 | completed | アーカイブ参照 |
| Sprint-1〜9 | Phase 1 Step 0〜9 基盤〜専ブラ互換 | completed | アーカイブ参照 |

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `tmp/orchestrator/archive/sprint_001_009.md` | Sprint 1〜9 計画書統合 |
| `tmp/orchestrator/archive/sprint_010_019.md` | Sprint 10〜19 計画書統合 |
| `tmp/orchestrator/archive/sprint_020_022.md` | Sprint 20〜22 計画書統合 |
| `tmp/tasks/archive/` | 全タスク指示書 (TASK-002〜062) |
| `tmp/escalations/archive/` | 全エスカレーション (10件、全resolved) |
| `tmp/workers/archive/` | ワーカー作業空間 |
| `tmp/reports/` | Phase 1検証レポート（code_review, doc_review） |
