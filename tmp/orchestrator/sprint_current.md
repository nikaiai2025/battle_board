# スプリント状況サマリー

> 最終更新: 2026-03-24

## 現在のフェーズ

**Sprint-112 完了 — 管理者課金ステータス変更 + 管理画面修正 + 開発環境整備**

### Sprint-112の成果
- TASK-301: Backend — API（PUT/DELETE `/api/admin/users/[userId]/premium`）+ Service + BDDステップ + 単体テスト
- TASK-302: Frontend — 管理画面ユーザー詳細ページに課金ステータス切り替えボタン追加
- TASK-303: 管理画面を`(admin)`ルートグループに分離（テーマ漏れ・Header重複解消）
- TASK-304: 管理スレッド詳細からユーザー詳細へのリンク追加
- TASK-305: ダークテーマbody背景色修正（`:root:has(.dark)`セレクタ追加）
- TASK-306: ローカル開発用seed.sql（admin@local.test / admin1234）
- プレミアムテーマCSS追加（ocean/forest/sunset）、エージェント設定更新（人間作業）
- E2Eリファクタリング: 共有スレッド方式に変更（人間作業）
- admin.feature v4: シナリオ2件追加（有料化/無料化）
- vitest 1769 PASS / cucumber-js 341シナリオ（325 passed, 16 pending）
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

### Sprint-111の成果
- TASK-298: 管理画面スレッド・レス管理ページ新設（`/admin/threads`、一覧/詳細/削除UI）
- TASK-300: チュートリアルBOT `!w`コマンドバグ修正（本文改行分割で後方引数問題回避）
- TASK-299: 非同期コマンド即時トリガー（workflow_dispatch）導入 + cron 30分→4時間フォールバック化 + CI failure notifier権限修正
- vitest 1758 PASS / cucumber-js 339 passed, 16 pending / tsc エラーなし
- コミット: ecd81eb, cebd451
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

### Sprint-110の成果（認証フロー簡素化コード実装）
- TASK-294〜297: Backend Core + Frontend UI + BDD Steps + E2E修正（40+ファイル変更）
- 6桁認証コード廃止 → Turnstileのみに変更
- vitest 1747 PASS / cucumber-js 323 passed / 本番スモーク 29/34 PASS
- コミット: 7a3fe43, 3e3db3f, eabb73e

### Sprint-109の成果（認証フロー簡素化ドキュメントレビュー）
- TASK-292/293: 外部仕様 + アーキテクチャ設計レビュー → 全指摘修正
- コミット: 0d6f777

### Sprint-105〜108 概要
- Sprint-108: サイトリネーム Phase 2 — BattleBoard→ボットちゃんねる（66+ファイル）
- Sprint-107: サイトリネーム Phase 1 — 板ID定数化リファクタリング
- Sprint-106: ダッシュボード統計500エラー修正
- Sprint-105: 管理者ログインページUI + 画面テーマ機能段階1（テーマ12シナリオ全PASS）

※ Sprint-75〜104の詳細は `tmp/orchestrator/archive/sprint_past.md` を参照

## テスト状況

- vitest: 1769 PASS
- cucumber-js: 341シナリオ / 325 passed / 0 failed / 16 pending
  - pending 16件のうち11件はE2E層で検証済み（thread-ui 7 + polling 2 + bot-display 2）
  - 残りpending 5件: 専ブラインフラ3 + Discord OAuth 2
- playwright E2E (ローカル): 16 passed, 0 fixme
- playwright API: 29テスト / 全PASS（専ブラ互換18 + 認証Cookie11）
- cucumber-js integration: 7シナリオ / 全PASS
- schema consistency: 3テスト / 全PASS
- **本番スモークテスト (Sprint-112後):** 29/34 PASS（5件は設計上のスキップ）

## 人間タスク（次回セッション開始時に確認）

### HUMAN-003: ネタ師BOT詳細定義 + BDDシナリオ作成（優先度: 中）

Strategy Step 3・4の着手に必要。`features/` の変更は人間承認必須。

決めるべきこと:
- ネタの収集元（どのWebソース？ RSS / API？）
- AIプロンプトの方向性（要約型？煽り型？）
- スレ立ての頻度・条件
- HP・報酬パラメータ
- BDDシナリオ（`features/bot_system.feature` に追加 or 別ファイル）

### HUMAN-004: 設計判断3件 + OpenAPI更新承認（優先度: 低→中に格上げ）

| ID | 判断内容 | 状態 |
|---|---|---|
| DOC-004 | **D-04 OpenAPIにInternal API 3本追加** | 人間承認待ち（Sprint-56で検出） |
| DOC-005 | **D-04 OpenAPIに認証ルート7本追加** | 人間承認待ち（Sprint-56で検出） |
| DOC-003 | D-04 OpenAPIにinlineSystemInfoフィールド追加 | 設計判断待ち |
| MEDIUM-006 | 管理APIの認証エラー 401/403統一 | 人間承認待ち |
| MEDIUM-003 | 日次集計のタイムゾーン UTC/JST | 設計判断待ち |

※ 完了済み人間タスク（HUMAN-001/002/005/007）は `tmp/orchestrator/archive/sprint_past.md` を参照

## AI側の次アクション

練習コマンド①〜④全完了。Phase 5検証サイクル完了（Sprint-98で HIGH 3件修正済み）。
newspaper非同期処理は本番稼働中（Sprint-111でworkflow_dispatch即時トリガー導入 + cron 4hフォールバック）。

| 人間タスク完了 | AI側で実行するスプリント |
|---|---|
| HUMAN-003 完了 | BOT Strategy Step 3・4（スキーマ拡張 + ネタ師実装） |
| HUMAN-004 完了 | OpenAPI更新 + 該当コード修正（小規模） |

## BOT Strategy移行 進捗

| Step | 内容 | 状態 |
|---|---|---|
| Step 1〜2.5 | Strategy定義 + BotService委譲リファクタ + Phase 5検証 | **完了（Sprint-43〜45）** |
| Step 3 | bot_profiles.yaml スキーマ拡張 | HUMAN-003 待ち |
| Step 4 | ネタ師 Strategy 実装 + collected_topics + 収集ジョブ | HUMAN-003 待ち |

## 技術負債リスト

| ID | 内容 | 優先度 | 推奨時期 |
|---|---|---|---|
| TD-ARCH-002 | `use cache` ディレクティブのキャッシュ戦略反映 | 中 | 次の最適化スプリント |
| TD-ARCH-003 | React Compiler 有効化検討 | 中 | Phase 3 |
| TD-ARCH-004 | Vitest Visual Regression でpendingシナリオ解消 | 低 | UI安定後 |
| TD-ARCH-005 | BDDテストのESM移行検討 | 低 | 問題発生時 |

### ウォッチリスト（対応不要・監視のみ）
- Cloudflare Vinext（実験的）、supabase-js v3、Playwright Agent CLI

## 残課題

- HUMAN-003/004（上記「人間タスク」参照）
- サイトリネーム Phase 3: ドメイン変更（新ドメイン確定待ち。詳細: `tmp/site_rename_migration_plan.md` Section 4）
- デザイン・レイアウト改善（機能優先のため後回し）
- BOTマーク専ブラ反映（DAT差分同期問題の解決 — 未着手）
- 専ブラ実機テスト: Siki正常動作 / ChMate CF正常・Vercel非対応（既知）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-112 | 管理者課金ステータス変更 + テーマバグ修正 | completed | `tmp/orchestrator/sprint_112_plan.md` |
| Sprint-111 | 管理画面スレッド管理UI + !wバグ修正 + 非同期コマンド即時トリガー | completed | `tmp/orchestrator/sprint_111_plan.md` |
| Sprint-105〜110 | テーマ機能 + サイトリネーム Phase 1-2 + 認証簡素化 | completed | `archive/sprint_105_110.md` |
| Sprint-95〜104 | !aori〜!livingbot v2 + newspaper GH Actions移行 + Phase 5 | completed | `archive/sprint_095_104.md` |
| Sprint-85〜94 | ウェルカムシーケンス + コマンド基盤 + Phase 5差し戻し | completed | `archive/sprint_085_094.md` |
| Sprint-75〜84 | 調査コマンド + UI改善 + E2E + ウェルカム設計 | completed | `archive/sprint_075_084.md` |
| Sprint-70〜74 | BDDステップスタブ修正〜E2Eスモーク全ページカバー | completed | `archive/sprint_070_074.md` |
| Sprint-60〜69 | UI構造改善（設計〜Phase 5再検証APPROVE） | completed | `archive/sprint_060_069.md` |
| Sprint-50〜59 | UUID修正〜Discord OAuth + Phase 5検証 | completed | `archive/sprint_050_059.md` |
| Sprint-42〜49 | BOT基盤〜固定スレッド自動デプロイ | completed | `archive/sprint_042_049.md` |
| Sprint-1〜41 | Phase 1〜Phase 2初期 | completed | `archive/sprint_001_009.md` 〜 `sprint_038_041.md` |

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `archive/sprint_past.md` | Sprint 44〜104成果、完了HUMAN詳細、解決済みバグ、専ブラ実機テスト等の履歴情報 |
| `archive/sprint_105_110.md` | Sprint 105〜110 計画書統合 |
| `archive/sprint_095_104.md` | Sprint 95〜104 計画書統合 |
| `archive/sprint_085_094.md` | Sprint 85〜94 計画書統合 |
| `archive/sprint_075_084.md` | Sprint 75〜84 計画書統合 |
| `archive/sprint_070_074.md` | Sprint 70〜74 計画書統合 |
| `archive/sprint_060_069.md` | Sprint 60〜69 計画書統合 |
| `archive/sprint_050_059.md` | Sprint 50〜59 計画書統合 |
| `archive/sprint_042_049.md` | Sprint 42〜49 計画書統合 |
| `archive/sprint_030_037.md` | Sprint 30〜37 計画書統合 |
| `archive/sprint_023_029.md` | Sprint 23〜29 計画書統合 |
| `archive/sprint_001_009.md` 〜 `sprint_020_022.md` | Sprint 1〜22 計画書統合 |
| `tmp/tasks/archive/` | 全タスク指示書 |
| `tmp/escalations/archive/` | 全エスカレーション（全resolved） |
| `tmp/workers/archive/` | 全ワーカー作業空間 |
| `tmp/reports/` | 最新Phase 5検証レポート（code_review, doc_review, test_audit） |
| `tmp/reports/archive/` | 過去の検証レポート・障害記録 |
| `tmp/archive/` | 完了済み一時ファイル |
