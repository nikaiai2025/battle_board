# スプリント状況サマリー

> 最終更新: 2026-03-17

## 現在のフェーズ

**Sprint-42 完了 — Phase 3 BOT基盤実装 + Strategy設計確定**

Sprint-42で荒らし役のexecuteBotPost/selectTargetThread/getNextPostDelayを実装（BDDシナリオC/D passed化）。
人間レビューでPhase 3以降の多種BOT非対応が発覚し、アーキテクトによるStrategy設計を実施・D-07/D-08に反映。
bot.md v6（Strategy パターン + プロバイダー抽象化）、architecture.md TDR-008 追記。

## テスト状況

- vitest: 39ファイル / 1061テスト / 全PASS（Sprint-41比 +14件）
- cucumber-js: 228シナリオ (221 passed, 7 pending) / 0 failed
  - Sprint-42でpassed化: @荒らし役ボットは1〜2時間間隔で書き込む、@荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
  - 残pending 7件: インフラ制約3件 + bot_system UI 2件 + Discord OAuth 2件 — 意図的Pending
- playwright E2E smoke: 8テスト / 全PASS
- playwright E2E flow: 1テスト / 全PASS
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

## 次に対応すべき作業: BOT Strategy移行（4ステップ）

bot.md v6 §2.12 に基づく段階的移行計画。TASK-122の荒らし役専用実装をStrategy インターフェースの一実装に切り出し、ネタ師等の新BOT種別に対応する。

| Step | 内容 | 規模 | 検証基準 |
|---|---|---|---|
| **Step 1** | Strategy インターフェース定義 + 荒らし役の3 Strategy切り出し（FixedMessage / RandomThread / FixedInterval） | 中 | 既存テスト全PASS（動作変更なし） |
| **Step 2** | BotService.executeBotPost を Strategy 委譲にリファクタ | 中 | 既存テスト全PASS |
| **Step 3** | bot_profiles.yaml スキーマ拡張（content_strategy, behavior_type, scheduling, ai_config） | 小 | 荒らし役動作変更なし |
| **Step 4** | ネタ師の Strategy 実装 + collected_topics テーブル + 収集ジョブ | 大 | ネタ師BDD（要新規作成）+ 荒らし役全PASS |

※ TASK-123（Internal API + GitHub Actions cron）は Step 2 完了後に再計画する

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

## Phase 3 未実装事項

| 項目 | 必要な実装 | 状態 |
|---|---|---|
| BOT Strategy移行 | bot-strategies/ ディレクトリ + BotServiceリファクタ | **次Sprint（4ステップ計画あり）** |
| BOT定期書き込みcronジョブ | `.github/workflows/` cron + 内部APIルート | Step 2完了後 |
| 日次リセットcronジョブ | `.github/workflows/daily-maintenance` cron | Step 2完了後 |
| BOTマーク専ブラ反映 | DAT差分同期問題の解決 | 未着手 |
| ネタ師BOT | Strategy Step 4 + BDDシナリオ新規作成 | Step 3完了後 |

## 残課題

- BOT Strategy移行（4ステップ）— 次Sprint
- デザイン・レイアウト改善（機能優先のため後回し）
- 残存MEDIUM指摘2件（MEDIUM-006, MEDIUM-003 — 人間判断待ち）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
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
