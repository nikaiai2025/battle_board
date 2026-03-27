# スプリント状況サマリー

> 最終更新: 2026-03-28

## 現在のフェーズ

**Sprint-135 完了。次スプリント計画中。**

### 敵対的コードレビュー進捗（一時中断中）

| # | Feature | ステータス | 指摘/採用 | セッション |
|---|---------|-----------|----------|-----------|
| 1 | admin.feature | 完了 | 36/19 | `20260325_admin_auth` |
| 2 | authentication.feature | 完了 | (上と合算) | `20260325_admin_auth` |
| 3 | posting.feature | **完了** | 9/3 (CRITICAL:1, HIGH:2) | `20260326_posting` |
| 4 | thread.feature | **完了** | 18/11 (CRITICAL:1, HIGH:10) | `20260326_thread` |
| 5 | user_registration.feature | **完了** | 12/8 (CRITICAL:4, HIGH:2) | `20260326_user_registration` |
| 6〜22 | （残17件）| 未着手 | | |

**Sprint-134 完了 — command_copipe.feature 8シナリオ修正**

**Sprint-135 完了 — 範囲攻撃BDDステップ + FAB pending + インカーネーションモデル + !w同日制限撤廃**

### Sprint-135の成果
- TASK-345: ボット日次リセット インカーネーション（転生）モデル化
  - bulkReviveEliminated: UPDATE→INSERT（旧レコード凍結 + 新UUID生成）
  - BotRepository / BotService / InMemory実装 / テストモック全更新
- TASK-346: `!w` コマンド同日1回制限撤廃（reactions.feature v4→v5）
  - grass-handler.ts の重複チェック削除
- TASK-347: bot_system.feature 範囲攻撃9シナリオ UNDEFINED→PASS
  - ESC-TASK-347-1: ゼロ報酬プロファイルDI + ダミーボット（選択肢B+C）で解決
- TASK-348: thread.feature @fab 2シナリオ pending化 + FloatingActionMenu Vitestコンポーネントテスト追加
- Discord OAuth PKCE手動実装（前セッションからの継続）
- vitest: 2025テスト PASS / cucumber-js: 361 passed, 18 pending, 0 failed / 本番スモーク: 17/17 PASS
- コミット: cee9882（+ a86658c, a80c90f, bc517a6 等前コミット群）
- フェーズ5: bdd-gate PASS / code-reviewer WARNING→PASS（HIGH 2件アーキテクトで却下/降格）/ doc-reviewer APPROVED / test-auditor APPROVED

### Sprint-134の成果
- TASK-342: 根本原因調査（bdd-architect）
  - `本文に {string} を含めて投稿する` ステップの通貨自動補填欠如を特定
- TASK-343: command_system.steps.ts に通貨自動補填 + IncentiveLog事前挿入ブロック追加
- vitest: 2003テスト PASS / cucumber-js: 353 passed, 16 pending, 0 failed
- コミット: 1d86004
- フェーズ5: bdd-gate PASS / code-reviewer APPROVED / doc-reviewer APPROVED / test-auditor APPROVED

**Sprint-133 完了 — コピペボット(HP:100) + 運営BOTコスト免除**

### Sprint-133の成果
- TASK-341: bot_system.feature の3シナリオ実装（BDDステップ定義）
  - コピペボット作成ヘルパー / 運営BOTコスト免除ステップ追加
- migration 00033: copipe bot レコード挿入（本番適用済み）
- bot_profiles.yaml: コピペプロファイル追加（hp:100, base_reward:50）
- vitest: 2003テスト PASS / cucumber-js: 345 passed
- コミット: 5e3f57f
- 本番スモーク: **30/35 PASS**（5件は設計上のスキップ）

**Sprint-128 完了 — !copipe 曖昧ヒット通知フォーマット変更**

### Sprint-128の成果
- TASK-332: copipe-handler「曖昧です」通知の位置・文言変更
  - 通知をAA末尾→最上部に移動
  - 文言: 「曖昧です（N件ヒット）」→「曖昧です（N件ヒット。うち１件をランダム表示）」
  - テストアサーション3箇所 + テスト名2箇所修正
- vitest: 1939テスト PASS / cucumber-js: 334 passed, 16 pending
- コミット: 3f95560
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

**Sprint-127 完了 — !copipe v2 + seed 195件投入**

### Sprint-127の成果
- TASK-330: !copipe v2 改修
  - 全文検索フォールバック: name 不一致時に content 部分一致へ
  - 曖昧ヒット時: エラー終了 → ランダム1件表示 +「曖昧です（N件ヒット）」
  - コスト変更: 0 → 3（連打防止）
  - BDD 8シナリオ全PASS / 単体テスト33件PASS
- seed データ 195件投入（AA コレクション一括登録）
- trim バグ修正: AA先頭空白の消失を修正（.trim() → trimBlankLines()）
- seed スクリプト: 追記専用 → 完全同期（UPSERT + DELETE）
- vitest: 1928テスト PASS / cucumber-js: 342 passed, 16 pending
- コミット: 37b62a4
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

**Sprint-126 完了 — !copipe コマンド実装**

### Sprint-126の成果
- TASK-328: !copipe メイン実装（Migration + Repository + Handler + Config + Tests + BDD Steps）
  - copipe_entries テーブル作成（migration 00032）
  - CopipeRepository（Supabase + InMemory）
  - CopipeHandler: ランダム選択 + 完全一致優先検索 + 部分一致 + エラーハンドリング
  - commands.yaml / commands.ts に copipe エントリ追加
  - command-service.ts にハンドラ登録
  - BDDステップ定義 + InMemoryモック登録
  - 単体テスト21件追加
- TASK-329: !copipe インフラ（Seed Script + GHA Workflow + ci-failure-notifier）
  - seed-copipe.ts: copipe-seed.txt パース → DB UPSERT
  - seed-copipe.yml: main push 時自動実行
  - ci-failure-notifier.yml に通知追加
- vitest: 1916テスト PASS / cucumber-js: 340 passed, 16 pending
- GHA: migration success + seed success
- コミット: f793c17
- 本番スモーク: **29/34 PASS**（5件は設計上のスキップ）

**Sprint-125 完了 — 削除済みレス非表示バグ修正**

### Sprint-125の成果
- TASK-327: findByThreadId is_deletedフィルタ除去 + admin.featureシナリオ修正
  - Sprint-123で追加した過剰なis_deletedフィルタにより削除済みレスが完全非表示になっていたバグを修正
  - `findByThreadId`の2分岐から`.eq("is_deleted", false)`を除去（post-repository.ts）
  - InMemory post-repository: `findByThreadId`から`!p.isDeleted`除去
  - admin.feature L69-73: 設計意図と矛盾するシナリオを修正（人間承認済み）
  - admin.steps.ts: スレッド削除検証を全レス`isDeleted===true`チェックに変更
  - ESC-TASK-327-1: BDDテストFAIL → 人間承認でfeature修正 → 解決
- vitest: 1896テスト 全PASS / cucumber-js: 334 passed, 16 pending
- コミット: 5f080e7
- 本番スモーク: **29/29 PASS**

**Sprint-122〜124 完了 — TOCTOU原子採番 + soft deleteフィルタ + completeRegistrationアトミック化**

### Sprint-122の成果
- TASK-323: レス番号TOCTOU競合修正（原子採番RPC）
  - 新規RPC `insert_post_with_next_number` で threads FOR UPDATE ロック + 採番 + INSERT原子実行
  - `getNextPostNumber` 廃止、`createWithAtomicNumber` に統合
  - Step 6.5/7/8 を先行実行し、Step 9 でRPC一発に変更
  - Step 9d: milestone_postボーナスをRPC戻り値の実postNumberで遅延評価
  - ESC-TASK-323-1/2 解決: locked_files外のテスト・ステップ定義の機械的置換
- vitest: 1896テスト 全PASS / cucumber-js: 331 passed, 16 pending
- コミット: 21de5a6

**Sprint-121 完了 — HUMAN-004解消 + リファクタリング2件 + BOT-DIAGクリーンアップ**

### Sprint-121の成果
- TASK-319: OpenAPI仕様書更新（DOC-003/004/005一括解消）
  - 認証ルート9本 + Internal API 5本をopenapi.yamlに追記
  - DOC-003(inlineSystemInfo)は既に記載済みのため追記不要
- TASK-320: 管理API 401→403統一（MEDIUM-006解消）
  - admin API 5ファイルの認証エラーを403 Forbiddenに統一
- TASK-321: 日次集計タイムゾーンJST境界修正（MEDIUM-003解消）
  - `getJstDateRange()`新設、全集計クエリの日付境界をJST基準に修正
  - JST境界テスト5件追加、既存テスト失敗5件解消
- TASK-322: BOT-DIAG診断ログ除去
  - post-service.ts 4箇所 + command-service.ts 1箇所のログ除去
- vitest: 1896テスト 全PASS / cucumber-js: 331 passed, 16 pending

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

- vitest: **2025 PASS / 13 failed**（Sprint-135後。13件は全て既存失敗）
- cucumber-js: 382シナリオ / **361 passed / 0 failed** / 18 pending / 3 undefined（Sprint-135後）
  - pending 18件: 内訳 — thread-ui 7 + polling 2 + bot-display 2 + FAB 2 + 専ブラインフラ3 + Discord OAuth 2
  - undefined 3件: 既存の未実装ステップ（Sprint-135で11件解消）
- playwright E2E (ローカル): 16 passed, 0 fixme
- playwright API: 29テスト / 全PASS（専ブラ互換18 + 認証Cookie11）
- cucumber-js integration: 7シナリオ / 全PASS（ローカル環境依存のため環境問題2件は除く）
- schema consistency: 3テスト / 全PASS
- **本番スモークテスト (Sprint-135後):** 17/17 PASS（e2e/smoke/navigation.spec.ts 全件）

## 人間タスク（次回セッション開始時に確認）

### HUMAN-003: キュレーションBOT詳細定義 + BDDシナリオ作成（優先度: 中）

**進捗: BDDシナリオ作成済み（`features/curation_bot.feature` v2）**

Strategy Step 3・4の着手に必要。`features/` の変更は人間承認必須。

決定済み:
- 収集元: 5ch・ふたば・HackerNews・はてブ・Reddit・Wikipedia・YouTube（計12ソース）
- スレタイ: 記事タイトルをそのまま使用（AI要約なし）
- スレ立て頻度: 240〜360分ランダム間隔
- HP: 100 / ゲームシステムはbot_system.feature準拠
- BDDシナリオ: `features/curation_bot.feature`（独立ファイル）
- 蓄積上限: ソースごと6件/回
- 実装フェーズ: Phase A（1ソース検証）→ B（APIテスト）→ C（一括実装）

### ~~HUMAN-004~~ → Sprint-121で解消

Sprint-121で全5件を対応完了:
- DOC-003: 既にOpenAPIに記載済み（対応不要）
- DOC-004/005: OpenAPIにInternal API 5本 + 認証ルート9本追記（TASK-319）
- MEDIUM-006: 管理API 401→403統一（TASK-320）
- MEDIUM-003: 日次集計タイムゾーンJST修正（TASK-321）

※ 完了済み人間タスク（HUMAN-001/002/004/005/007）は `tmp/orchestrator/archive/sprint_past.md` を参照

## AI側の次アクション

HUMAN-004は Sprint-121で全件解消済み。残る人間タスクはHUMAN-003のみ。

| 人間タスク完了 | AI側で実行するスプリント |
|---|---|
| HUMAN-003 完了 | BOT Strategy Step 3・4（スキーマ拡張 + キュレーションBOT実装） |

## BOT Strategy移行 進捗

| Step | 内容 | 状態 |
|---|---|---|
| Step 1〜2.5 | Strategy定義 + BotService委譲リファクタ + Phase 5検証 | **完了（Sprint-43〜45）** |
| Step 3 | bot_profiles.yaml スキーマ拡張 | HUMAN-003 待ち |
| Step 4 | キュレーションBOT Strategy 実装 + collected_topics + 収集ジョブ | HUMAN-003 待ち |

## 技術負債リスト

| ID | 内容 | 優先度 | 推奨時期 |
|---|---|---|---|
| ~~TD-TEST-001~~ | ~~loginWithEmail テスト失敗~~ → **Sprint-115で解消** | ~~高~~ | 完了 |
| TD-ARCH-002 | `use cache` ディレクティブのキャッシュ戦略反映 | 中 | 次の最適化スプリント |
| TD-ARCH-003 | React Compiler 有効化検討 | 中 | Phase 3 |
| TD-ARCH-004 | Vitest Visual Regression でpendingシナリオ解消 | 低 | UI安定後 |
| TD-ARCH-005 | BDDテストのESM移行検討 | 低 | 問題発生時 |
| TD-REG-001 | メール重複検出の文字列依存（identities配列チェックに変更） | 中 | 人間判断待ち |
| TD-REG-002 | パスワード更新のrecovery認可チェック欠如（purposeカラム追加） | 中 | 人間判断待ち |
| TD-REG-003 | PAT平文がmypage APIに含まれる（専用API分離） | 中 | 人間判断待ち |
| TD-REG-004 | MockBbsCgiResponseBuilder引数シグネチャ乖離 | 低 | 次のテスト整備 |
| TD-REG-005 | NOT_REGISTERED単体テスト欠落 | 低 | 次のテスト整備 |
| TD-REG-006 | `bulkReviveEliminated()` N+1 INSERT（Supabase一括insertで改善可） | 低 | 次のBOT関連タスク時 |

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
| Sprint-135 | 範囲攻撃BDDステップ + FAB pending + インカーネーションモデル + !w同日制限撤廃 + Discord PKCE | completed | `tmp/orchestrator/sprint_135_plan.md` |
| Sprint-134 | command_copipe.feature 8シナリオ修正（テストバグ修正） | completed | `tmp/orchestrator/sprint_134_plan.md` |
| Sprint-133 | コピペボット(HP:100) + 運営BOTコスト免除 | completed | `tmp/orchestrator/sprint_133_plan.md` |
| Sprint-132 | コピペAA スマホスクロール修正 | completed | — |
| Sprint-131 | hiroyukiコマンドE2E修正 + おみくじv3 | completed | — |
| Sprint-128 | !copipe 曖昧ヒット通知フォーマット変更 | completed | `tmp/orchestrator/sprint_128_plan.md` |
| Sprint-127 | !copipe v2 + seed 195件投入 | completed | — |
| Sprint-126 | !copipe コマンド実装 | completed | `tmp/orchestrator/sprint_126_plan.md` |
| Sprint-125 | 削除済みレス非表示バグ修正 | completed | `tmp/orchestrator/sprint_125_plan.md` |
| Sprint-124 | completeRegistrationアトミック化 + user_registration敵対的レビュー | completed | `tmp/orchestrator/sprint_124_plan.md` |
| Sprint-123 | soft deleteフィルタ修正 + BDDシナリオ追加 | completed | `tmp/orchestrator/sprint_123_plan.md` |
| Sprint-122 | TOCTOU原子採番修正 | completed | `tmp/orchestrator/sprint_122_plan.md` |
| Sprint-121 | HUMAN-004解消 + リファクタリング2件 + BOT-DIAGクリーンアップ | completed | `tmp/orchestrator/sprint_121_plan.md` |
| Sprint-120 | !newspaper 403修正 + BOT !w 本番復旧 | completed | `tmp/orchestrator/sprint_120_plan.md` |
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
