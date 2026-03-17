# スプリント状況サマリー

> 最終更新: 2026-03-17

## 現在のフェーズ

**Sprint-41 完了 — 技術的負債全解消（Phase5 MEDIUM/LOW指摘全件対応完了）**

Phase 5検証APPROVE後、Sprint-40〜41で全MEDIUM/LOW自律解決可能な指摘を解消。
残存はMEDIUM-006（API契約変更要）・MEDIUM-003（設計判断要）のみ — いずれも人間判断待ち。

## テスト状況

- vitest: 39ファイル / 1047テスト / 全PASS
- cucumber-js: 228シナリオ (219 passed, 9 pending) / 0 failed
  - pending 9件: インフラ制約3件 + bot_system UI/GitHub Actions 6件 — 意図的Pending
- playwright E2E smoke: 8テスト / 全PASS
- playwright E2E flow: 1テスト / 全PASS
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

## Sprint-40〜41 技術的負債解消結果

| TASK | Sprint | 内容 | 判定 |
|---|---|---|---|
| TASK-117 | 40 | new Date() → new Date(Date.now()) 残存3箇所修正 | **completed** |
| TASK-118 | 40 | リポジトリ性能最適化（DB SUM / INNER JOIN COUNT / バッチ削除） | **completed** |
| TASK-119 | 41 | ステップ定義コメント乖離修正（LOW-003） | **completed** |

## 残存指摘（人間判断待ち）

| ID | 内容 | リスク | 状態 |
|---|---|---|---|
| MEDIUM-006 | 管理API認証ステータス不統一（401 vs 403）— 実装はOpenAPI仕様に一致。仕様変更にはAPI契約変更が必要 | 低 | 人間承認待ち |
| MEDIUM-003 | aggregate-daily-stats タイムゾーン（UTC vs JST設計判断） | 中 | 設計判断待ち |

## 専ブラ実機テスト状況

| 専ブラ | ホスト | 読み取り | 書き込み | 備考 |
|---|---|---|---|---|
| Siki | Vercel | ✅ | ✅ | 正常動作 |
| Siki | Cloudflare | ✅ | ✅ | 正常動作 |
| ChMate | Vercel | ❌ | ❌ | HTTP:80→308リダイレクト（既知。Vercel仕様） |
| ChMate | Cloudflare | ✅ | ✅ | 正常動作 |

## Phase 3 未実装事項（BDDスコープ外・インフラ層）

| 項目 | 必要な実装 |
|---|---|
| BOT定期書き込みcronジョブ | `.github/workflows/` cron + 内部APIルート |
| 日次リセットcronジョブ | `.github/workflows/daily-maintenance` cron |
| BOTマーク専ブラ反映 | DAT差分同期問題の解決 |

## 残課題

- デザイン・レイアウト改善（機能優先のため後回し）
- 残存MEDIUM指摘2件（MEDIUM-006, MEDIUM-003 — 人間判断待ち）
- Phase 3 インフラ層実装

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-41 | LOW-003コメント修正 + クリーンアップ | completed | `tmp/orchestrator/sprint_41_plan.md` |
| Sprint-40 | 技術的負債解消（new Date()統一+DB集計化+N+1修正） | completed | `tmp/orchestrator/sprint_40_plan.md` |
| Sprint-38〜39 | Phase 5検証サイクル + HIGH修正 + 再検証APPROVE | completed | `archive/sprint_038_041.md` |
| Sprint-30〜37 | 本登録DB〜管理機能拡充② | completed | `archive/sprint_030_037.md` |
| Sprint-23〜29 | Phase 2準備〜E2Eスモークテスト | completed | `archive/sprint_023_029.md` |
| Sprint-1〜22 | Phase 1完了+専ブラ互換+各種修正 | completed | `archive/sprint_001_009.md` 〜 `sprint_020_022.md` |

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `tmp/orchestrator/archive/sprint_001_009.md` | Sprint 1〜9 計画書統合 |
| `tmp/orchestrator/archive/sprint_010_019.md` | Sprint 10〜19 計画書統合 |
| `tmp/orchestrator/archive/sprint_020_022.md` | Sprint 20〜22 計画書統合 |
| `tmp/orchestrator/archive/sprint_023_029.md` | Sprint 23〜29 計画書統合 |
| `tmp/orchestrator/archive/sprint_030_037.md` | Sprint 30〜37 計画書統合 |
| `tmp/orchestrator/archive/sprint_038_041.md` | Sprint 38〜41 計画書統合 |
| `tmp/tasks/archive/` | 全タスク指示書 (TASK-002〜119) |
| `tmp/escalations/archive/` | 全エスカレーション (13件、全resolved) |
| `tmp/workers/archive/` | 全ワーカー作業空間 |
| `tmp/reports/` | Phase 5検証レポート（code_review, doc_review） |
| `tmp/reports/archive/` | Phase 1検証レポート |
| `tmp/archive/` | 一時ファイル（feature計画書、監査レポート等） |
