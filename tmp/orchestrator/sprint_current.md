# スプリント状況サマリー

> 最終更新: 2026-03-17

## 現在のフェーズ

**Sprint-43 完了 — BOT Strategy移行 Step 1・2（リファクタリング）**

Sprint-43でbot.md v6 §2.12に基づくStrategy パターン移行のStep 1・2を完了。
荒らし役の固定実装（executeBotPost/selectTargetThread/getNextPostDelay）をStrategy インターフェースへの委譲に書き換え。
外部振る舞いの変更なし、全テスト維持。

## テスト状況

- vitest: 43ファイル / 1094テスト / 全PASS（Sprint-42比 +33件 — Strategy単体テスト新規追加）
- cucumber-js: 228シナリオ (221 passed, 7 pending) / 0 failed
  - 残pending 7件: インフラ制約3件 + bot_system UI 2件 + Discord OAuth 2件 — 意図的Pending
- playwright E2E smoke: 8テスト / 全PASS
- playwright E2E flow: 1テスト / 全PASS
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

## 次に対応すべき作業

### BOT Strategy移行 残ステップ（BOT詳細定義後に着手）

| Step | 内容 | 状態 |
|---|---|---|
| ~~Step 1~~ | ~~Strategy インターフェース定義 + 荒らし役3 Strategy切り出し~~ | **完了（Sprint-43）** |
| ~~Step 2~~ | ~~BotService を Strategy 委譲にリファクタ~~ | **完了（Sprint-43）** |
| Step 3 | bot_profiles.yaml スキーマ拡張 | BOT詳細定義後 |
| Step 4 | ネタ師 Strategy 実装 + collected_topics + 収集ジョブ | BOT詳細定義後（BDDシナリオ新規作成必要） |

### その他の未実装事項

| 項目 | 必要な実装 | 状態 |
|---|---|---|
| TASK-123: Internal API + cron | `.github/workflows/` cron + 内部APIルート | Step 2完了 → 再計画可能 |
| 日次リセットcronジョブ | `.github/workflows/daily-maintenance` cron | 再計画可能 |
| BOTマーク専ブラ反映 | DAT差分同期問題の解決 | 未着手 |
| ネタ師BOT | Strategy Step 4 + BDDシナリオ新規作成 | BOT詳細定義後 |

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

## 残課題

- BOT Strategy移行 Step 3・4（BOT詳細定義待ち）
- TASK-123再計画（Internal API + cron）
- デザイン・レイアウト改善（機能優先のため後回し）
- 残存MEDIUM指摘2件（MEDIUM-006, MEDIUM-003 — 人間判断待ち）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-43 | BOT Strategy移行 Step 1・2（リファクタリング） | completed | `tmp/orchestrator/sprint_43_plan.md` |
| Sprint-42 | Phase 3 BOT基盤実装 + Strategy設計確定 + D-07/D-08反映 | completed | `tmp/orchestrator/sprint_42_plan.md` |
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
| `tmp/tasks/archive/` | 全タスク指示書 (TASK-002〜120) |
| `tmp/escalations/archive/` | 全エスカレーション (13件、全resolved) |
| `tmp/workers/archive/` | 全ワーカー作業空間 |
| `tmp/reports/` | Phase 5検証レポート（code_review, doc_review） |
| `tmp/reports/archive/` | Phase 1検証レポート |
| `tmp/archive/` | 一時ファイル（feature計画書、監査レポート等） |
