# スプリント状況サマリー

> 最終更新: 2026-03-17

## 現在のフェーズ

**Sprint-40 完了 — 技術的負債解消（MEDIUM指摘4件解決）**

Phase 5検証APPROVE取得後、Sprint-40でMEDIUM残課題4件（new Date()統一残存 + DB集計化 + N+1修正）を解消。

## テスト状況

- vitest: 39ファイル / 1047テスト / 全PASS
- cucumber-js: 228シナリオ (219 passed, 9 pending) / 0 failed
  - pending 9件: インフラ制約3件 + bot_system UI/GitHub Actions 6件 — 意図的Pending
- playwright E2E smoke: 8テスト / 全PASS
- playwright E2E flow: 1テスト / 全PASS
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

## Sprint-40 結果

| TASK | 内容 | 判定 |
|---|---|---|
| TASK-117 | new Date() → new Date(Date.now()) 残存3箇所修正（auth-service, auth-code-repository） | **completed** |
| TASK-118 | リポジトリ性能最適化（sumAllBalances DB SUM / countActiveThreadsByDate INNER JOIN / softDeleteByThreadId バッチ削除） | **completed** |

## 残存MEDIUM/LOW指摘

| ID | 内容 | リスク | 状態 |
|---|---|---|---|
| MEDIUM-006 | 管理API認証ステータス不統一（401 vs 403）— 実装はOpenAPI仕様に一致。仕様変更にはAPI契約変更が必要 | 低 | 未対応（人間承認待ち） |
| MEDIUM-003 | aggregate-daily-stats タイムゾーン（UTC vs JST設計判断） | 中 | 未対応（設計判断待ち） |
| LOW-003 | bot_system/incentive.steps.ts コメント乖離 | 低 | 未対応 |
| ~~MEDIUM-007~~ | ~~auth-service.ts new Date() 残存~~ | — | Sprint-40 TASK-117 で解決 |
| ~~MEDIUM-001~~ | ~~sumAllBalances DB側集計化~~ | — | Sprint-40 TASK-118 で解決 |
| ~~MEDIUM-002~~ | ~~countActiveThreadsByDate DB側集計化~~ | — | Sprint-40 TASK-118 で解決 |
| ~~MEDIUM-005~~ | ~~スレッド削除N+1 UPDATE~~ | — | Sprint-40 TASK-118 で解決 |

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
- 残存MEDIUM/LOW指摘（MEDIUM-006, MEDIUM-003, LOW-003）
- Phase 3 インフラ層実装

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-40 | 技術的負債解消（new Date()統一+DB集計化+N+1修正） | completed | `tmp/orchestrator/sprint_40_plan.md` |
| Sprint-39 | Phase5修正（APIエラーハンドリング+Dateモック統一+ドキュメント同期+再検証） | completed | `tmp/orchestrator/sprint_39_plan.md` |
| Sprint-38 | Phase 5検証サイクル（bdd-gate+code-reviewer+doc-reviewer） | completed | `tmp/orchestrator/sprint_38_plan.md` |
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
| `tmp/tasks/archive/` | 全タスク指示書 (TASK-002〜116) |
| `tmp/escalations/archive/` | 全エスカレーション (13件、全resolved) |
| `tmp/workers/archive/` | 全ワーカー作業空間 |
| `tmp/reports/` | Phase 5検証レポート（code_review, doc_review） |
| `tmp/reports/archive/` | Phase 1検証レポート |
| `tmp/archive/` | 一時ファイル（feature計画書、監査レポート等） |
