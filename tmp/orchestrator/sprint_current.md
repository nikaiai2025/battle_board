# スプリント状況サマリー

> 最終更新: 2026-03-25

## 現在のフェーズ

**Sprint-114 完了 — テーマ/フォントダウングレードロールバック修正**

### Sprint-114の成果
- TASK-310: テーマ/フォントダウングレード時のCookie同期修正 + BDDテストデータ修正
  - GET /api/mypage にSet-Cookieヘッダー追加（bb-theme/bb-font フォールバック済みIDで同期）
  - theme.steps.ts のテストデータ修正（mincho→noto-sans-jp: minchoは無料フォント）
  - 単体テスト8件追加（GET /api/mypage）
- vitest 1790/1794 PASS / cucumber-js 324/344 PASS (4 failed, 16 pending)
- theme.feature **全13シナリオ PASS**（Sprint-113の2件FAILが解消）
- コミット: 174e58c
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

### Sprint-114後のホットフィックス（スプリント外）
- **auth-code重複レコード防御**: 専ブラ認証フロー `findByTokenId` の `.single()` → `.order().limit(1)` + 未検証レコード削除追加。コミット: 9e00cb5。詳細: `docs/operations/incidents/2026-03-25_senbra_auth_findByTokenId_duplicate.md`

### 本番障害: Supabase 522 Connection Timeout（2026-03-25）
- **症状**: Cloudflare Workers → Supabase REST API (PostgREST) への接続がタイムアウト（error code 522）。スレッド一覧等のDB参照ページが全滅
- **原因**: Supabase PostgRESTレイヤーの一時的障害。PostgreSQL DB自体は稼働中（CLI直接接続で確認済み）。Supabaseグローバルステータスは "All Operational" だったためプロジェクト固有の問題
- **トリガー（推測）**: メール本登録テスト時の認証処理による接続プール負荷
- **復旧**: 自然復旧（ダッシュボード上は "healthy" 表示のまま）
- **教訓**: `wrangler tail` はリアルタイムストリーミング専用で過去ログ照会不可。Workers Observability APIのスコープも不足。CLIからのSupabaseリモート再起動にはAccess Tokenが必要（現在未保存）
- **未対応**: Security Advisor警告 — `public.dev_posts` / `public.daily_events` の RLS Disabled（本障害とは無関係、セキュリティ対応として要検討）

### 既知のテスト失敗（Sprint-112以降、registration-service起因）
- vitest 4 failed: registration-service.test.ts loginWithEmail（SUPABASE_URL環境変数未設定）
- BDD 4 failed: user_registration.feature ×4（同上）

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

- vitest: 1790 PASS / 4 failed（registration-service loginWithEmail環境依存）
- cucumber-js: 344シナリオ / 324 passed / 4 failed / 16 pending
  - 4 failed: user_registration ×4（loginWithEmail環境依存）
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
| TD-TEST-001 | registration-service loginWithEmail テスト失敗（8件）。原因: Service層が `@supabase/supabase-js` を直接import（レイヤー規約違反）。修正方針: `client.ts` に `createAuthOnlyClient()` ファクトリ追加 → 直接import除去。セキュリティレビュー済み（TASK-311: 問題なし）。詳細: `tmp/workers/bdd-architect_TASK-311/security_review_loginWithEmail.md` | 高 | 次スプリント |
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
