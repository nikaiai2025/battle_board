# スプリント状況サマリー

> 最終更新: 2026-03-26

## 現在のフェーズ

**Sprint-120 完了 — !newspaper 403修正 + BOT !w 本番復旧**

### Sprint-120の成果
- TASK-317: !newspaper GitHub workflow_dispatch 403修正
  - `github-workflow-trigger.ts` に `User-Agent: "BattleBoard-Worker"` ヘッダ追加
  - CF Workers の fetch は User-Agent を自動付与しないため、GitHub API 必須要件を満たせていなかった
- TASK-318: welcome bot !w 診断・本番復旧確認
  - BOT !w 統合テスト14件追加（GrassHandler単体/CommandService経由/PostService経由の3レベル）
  - `[BOT-DIAG]` 診断ログ追加（post-service.ts, command-service.ts）
  - テスト環境ではバグ再現せず。CFの再デプロイによりワーカーインスタンスがリフレッシュされ問題解消
  - 根本修正はSprint-119（isBotGiver フラグ）
- vitest: 1891テスト 全PASS / cucumber-js: 331 passed, 16 pending
- コミット: dbb7b74
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

### Sprint-119の成果
- TASK-316: GrassHandler BOT草付与パス実装
  - `CommandContext`/`CommandExecutionInput` に `isBotGiver` フラグ追加
  - BOT草付与時: grass_reactions INSERTスキップ、草カウント加算+メッセージ生成は実行
  - BOT草付与テスト10件追加
  - vitest: 1877テスト 全PASS / cucumber-js: 331 passed, 16 pending
- コミット: 1d5088b
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

### Sprint-118の成果
- TASK-315: getUserList N+1問題修正 + フロントエンド型修正
  - `CurrencyRepository.getBalancesByUserIds` 新設（IN句一括取得）
  - サブリクエスト数 52→3 に削減（CF Workers Free plan上限50を回避）
  - フロントエンド `page.tsx` を `UserListItem` 型に修正、balance実数値表示
  - `UserListItem` に `streakDays`/`lastPostDate` 追加
  - vitest: 1867テスト 全PASS / cucumber-js: 331 passed, 16 pending
- コミット: 237ef50
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

### Sprint-117の成果
- TASK-314: 管理者ユーザー管理の機能欠損2件修正 + BAN設計意図明文化
  - ATK-006-1: getUserList に通貨残高（balance）を追加
  - ATK-006-2: getUserDetail/getUserPosts にスレッド名（threadTitle）を追加（PostWithThread流用）
  - ATK-003-1: admin.feature にBAN段階設計の意図をコメント明文化
  - 単体テスト新規27件追加
  - vitest: 1855テスト 全PASS / cucumber-js: 331 passed, 16 pending

### Sprint-116の成果
- TASK-313: パスワード再設定フロントエンド + バックエンド一括実装
  - 新規ページ: `/auth/forgot-password` (SCR-006), `/auth/reset-password` (SCR-007)
  - ログインページ改修: 「パスワードを忘れた方はこちら」リンク追加
  - API: `POST /api/auth/reset-password`, `POST /api/auth/update-password`
  - confirm route: `type=recovery` 対応追加
  - Service層: `requestPasswordReset()`, `handleRecoveryCallback()`, `updatePassword()`
  - D-06仕様書: `auth-forgot-password.yaml`, `auth-reset-password.yaml`
  - vitest: 1828テスト 全PASS / cucumber-js: 331 passed, 16 pending
- コミット: 6915329
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）
  - `/auth/forgot-password`, `/auth/reset-password`, `/login` いずれも200応答確認済み

### Sprint-115の成果
- TASK-312: loginWithEmail のレイヤー規約違反修正（TD-TEST-001 解消）
  - `client.ts` に `createAuthOnlyClient()` ファクトリ関数追加
  - `registration-service.ts` から `@supabase/supabase-js` の直接importを除去
  - vitest 1793/1793 全PASS（失敗ゼロ達成）
  - BDD 328 passed / 0 failed / 16 pending
- コミット: 6273289
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

### Sprint-114後のホットフィックス3件（スプリント外、コミット: e5308b2）
1. **メール本登録リダイレクト不備**: `redirectTo` 必須化 + email_confirmフローをCookie→URLパラメータベースに変更。詳細: `docs/operations/incidents/2026-03-25_email_auth_redirect_missing.md`
2. **チュートリアルBOT cron再投稿エラー**: 使い切りBOTの `nextPostAt` を `null` に修正。詳細: `docs/operations/incidents/2026-03-25_tutorial_bot_cron_repost_error.md`
3. **auth-code重複レコード防御**: `.single()` → `.order().limit(1)` + 未検証レコード削除。詳細: `docs/operations/incidents/2026-03-25_senbra_auth_findByTokenId_duplicate.md`

### 本番障害: Supabase 522 Connection Timeout（2026-03-25）
- Supabase PostgRESTレイヤーの一時的障害（DB自体は稼働中）。自然復旧
- 教訓: `wrangler tail` は過去ログ照会不可。`.claude/skills/cf-workers-logs/` にCLIログ取得手順をスキル化
- 未対応: Security Advisor警告 — `public.dev_posts` / `public.daily_events` の RLS Disabled

### Sprint-113の成果
- TASK-307〜309: BOT情報漏洩修正(LEAK-1/2/3) + 専ブラedgeTokenフォールバック
- vitest 1782 PASS / cucumber-js 322/344 PASS
- 本番スモーク: 29/34 PASS

### Sprint-112の成果
- TASK-301〜306: 管理者課金ステータス変更 + 管理画面修正 + 開発環境整備
- vitest 1769 PASS / cucumber-js 325 passed, 16 pending
- 本番スモーク: 29/34 PASS

### Sprint-111の成果
- TASK-298〜300: 管理画面スレッド管理UI + !wバグ修正 + 非同期コマンド即時トリガー
- vitest 1758 PASS / cucumber-js 339 passed, 16 pending
- 本番スモーク: 29/34 PASS

### Sprint-105〜110 概要
- Sprint-110: 認証フロー簡素化コード実装
- Sprint-109: 認証フロー簡素化ドキュメントレビュー
- Sprint-108: サイトリネーム Phase 2
- Sprint-107: サイトリネーム Phase 1
- Sprint-106: ダッシュボード統計500エラー修正
- Sprint-105: 管理者ログインページUI + テーマ機能

※ Sprint-75〜104の詳細は `tmp/orchestrator/archive/sprint_past.md` を参照

## テスト状況

- vitest: **1877 PASS / 0 failed**（Sprint-119で10件追加）
- cucumber-js: 347シナリオ / **331 passed / 0 failed** / 16 pending
  - pending 16件のうち11件はE2E層で検証済み（thread-ui 7 + polling 2 + bot-display 2）
  - 残りpending 5件: 専ブラインフラ3 + Discord OAuth 2
- playwright E2E (ローカル): 16 passed, 0 fixme
- playwright API: 29テスト / 全PASS（専ブラ互換18 + 認証Cookie11）
- cucumber-js integration: 7シナリオ / 全PASS
- schema consistency: 3テスト / 全PASS
- **本番スモークテスト (Sprint-114後):** 29/34 PASS（5件は設計上のスキップ）

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

BOT情報漏洩修正完了。既知のテスト失敗6件（BDD）+4件（vitest）は Sprint-113以前の問題。
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
| ~~TD-TEST-001~~ | ~~loginWithEmail テスト失敗~~ → **Sprint-115で解消** | ~~高~~ | 完了 |
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
- Supabase Custom SMTP: 稼働増加時にサードパーティSMTPインフラ（SendGrid等）の導入を検討

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-119 | BOT !wコマンド FK制約違反修正 | completed | `tmp/orchestrator/sprint_119_plan.md` |
| Sprint-118 | 管理者ユーザー一覧 N+1問題修正（本番障害対応） | completed | `tmp/orchestrator/sprint_118_plan.md` |
| Sprint-117 | ATK指摘修正（balance/threadTitle追加 + BAN設計明文化） | completed | `tmp/orchestrator/sprint_117_plan.md` |
| Sprint-116 | パスワード再設定機能（フルスタック実装） | completed | `tmp/orchestrator/sprint_116_plan.md` |
| Sprint-115 | loginWithEmailレイヤー規約違反修正 + 障害対応3件 | completed | `tmp/orchestrator/sprint_115_plan.md` |
| Sprint-114 | テーマ/フォントダウングレードロールバック修正 | completed | `tmp/orchestrator/sprint_114_plan.md` |
| Sprint-113 | BOT情報漏洩修正(LEAK-1/2/3) + 専ブラedgeTokenフォールバック | completed | `tmp/orchestrator/sprint_113_plan.md` |
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
