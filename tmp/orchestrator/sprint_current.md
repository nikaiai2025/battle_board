# スプリント状況サマリー

> 最終更新: 2026-03-23

## 現在のフェーズ

**Sprint-105 完了 — 管理者ログインページUI + 画面テーマ機能段階1**

### Sprint-105の成果
- TASK-283: テーマ機能段階1 設計（bdd-architect）— 設計書出力
- TASK-284: 管理者ログインページ `/admin/login` UI実装 — `(admin-public)` ルートグループ配置（エスカレーション→案A採用）
- TASK-285: テーマ機能段階1 実装 — DB/ドメイン/API/SSR/マイページUI/BDD/単体テスト
  - 新規: theme.ts, theme-rules.ts, theme-service.ts, PUT /api/mypage/theme, 00025_theme_settings.sql
  - SSR: Cookie→CSSクラス付与、マイページ: カード選択UI + 楽観的更新
- BDD 340シナリオ中 324 passed / 16 pending / テーマ12シナリオ全PASS
- vitest 1772 passed（+31テスト）
- コミット: 6a4d818
- 本番スモーク: 30/35 PASS（5件は設計上のスキップ）

### Sprint-104の成果
- TASK-281: !livingbot v2 — スレッド内カウント追加
- 出力: `🤖 生存BOT — 掲示板全体: N体 / このスレッド: M体`
- BotRepository.countLivingBotsInThread() 新設（3クエリ構成）
- BDD 16シナリオ全PASS / vitest 1741 PASS
- コミット: 039aad2
- 本番スモーク: 30/35 PASS（5件は設計上のスキップ）

### Sprint-103の成果
- TASK-280: countLivingBots ネストselect型不整合修正（PostgREST many-to-one が単一オブジェクトを返す問題）
- 修正: 1ネストクエリ→2クエリ分離 + Array.isArray()安全ハンドリング
- dev/page.tsx: marqueeタグをCSS animation化 + jsx-deprecated.d.ts削除
- 固定案内板リンク: CFメイン・Vercelサブで併記（upsert-pinned-thread.ts）
- コミット: 0a0962d, f5ff278
- 本番スモーク: 30/35 PASS（5件は設計上のスキップ）

### Sprint-102の成果
- TASK-279: countLivingBots N+1クエリ最適化（1+3Nクエリ→ネストselect 1クエリ）
- CF Workers サブリクエスト上限エラー（500）の根本原因修正
- コミット: a880754
- ※ ネストselect型不整合で「無反応」発生 → Sprint-103で修正

### Sprint-101の成果
- TASK-277: 設計（bdd-architect, Opus）— 生存BOTカウント2区分SQL + daily_eventsテーブル + AttackHandler統合
- TASK-278: 実装（bdd-coding, Opus）— 14シナリオ全PASS、vitest全PASS
- 新規: livingbot-handler.ts, daily-event-repository.ts, 00024_daily_events.sql, command_livingbot.steps.ts
- コミット: 5f0df18
- 本番スモーク: 18/18 PASS

### Sprint-100の成果
- TASK-275/276: AI API呼び出しをVercel API Route内からGitHub Actions内に移動
- 新設: GET /pending, POST /complete, scripts/newspaper-worker.ts, completeNewspaperCommand
- 旧 /process ルート廃止
- コミット: c705a3c
- 本番スモーク: 30/35 PASS（5件は設計上のスキップ）
- 人間タスク: GEMINI_API_KEY を GH Secrets に設定（Vercel環境変数から移動）

### Sprint-99の成果
- TASK-274: command-parser.ts の `raw` フィールドを `match[0]` に変更（ホワイトスペース正規化による `String.replace()` 不一致を修正）
- 影響範囲: !aori, !iamsystem の全ステルスコマンド
- コミット: 37fe1f3
- 本番スモーク: 30/35 PASS（5件は設計上のスキップ）

### Sprint-98の成果
- TASK-273: Phase 5 HIGH修正3件（processAoriCommands pending未削除修正 + D-08 stealth矛盾修正 + D-08 tellコスト修正）
- Phase 5検証サイクル完了: bdd-gate PASS / code-reviewer WARNING(2H) / doc-reviewer WARNING(2H) / test-auditor APPROVE
- ダブルチェック後: HIGH 3件修正済み、MEDIUM 1件降格
- コミット: fabe02b
- 本番スモーク: 18/18 PASS

### Sprint-97の成果
- TASK-271/272: !newspaper実装（AI API + Google Search Grounding + 非同期キュー）
- コミット: 9bd187c
- 人間タスク: GEMINI_API_KEY の Vercel環境変数設定が必要

### Sprint-96の成果
- TASK-269/270: !aori実装（煽りBOT召喚 + 非同期キュー基盤）
- コミット: 69c80fb

### Sprint-95の成果
- TASK-267/268: 固定案内板リンクフルURL化 + BOT投稿FK制約違反修正
- コミット: 6225e73

### Sprint-94の成果
- TASK-266: !iamsystemコマンド実装（ステルス除去 + フィールド上書き + BDD 7シナリオ全PASS）
- ステルス基盤: PostFieldOverrides型、CommandExecutionResult拡張、PostService Step 5.5を新設
- テスト: vitest 82ファイル/1675テスト全PASS / BDD 285 passed

### Sprint-93の成果
- TASK-263: cron 500修正（BOT書き込み時のIncentiveServiceスキップ + processPendingTutorials個別try-catch）
- TASK-264: !omikujiコマンド実装（ハンドラ + BDD 4シナリオ + 単体テスト13件 + E2Eテスト追加）
- TASK-265: !iamsystemステルス基盤の設計詳細化（設計書出力 + D-08追記）
- テスト: vitest 81ファイル/1668テスト全PASS / BDD 278 passed

### Sprint-92の成果
- TASK-262: `.claude/rules/Source_Layout.md`, `admin-user-repository.test.ts`, `.claude/settings.json` の旧パス参照を修正
- 人間作業: featureファイルをフラット構成に統一（`features/constraints/` → `features/`）、See参照59ファイル書き換え
- テスト: vitest 80ファイル/1653テスト全PASS

### Sprint-91の成果
- TASK-260: dev_postsテーブル新設、専用Repository/Service/APIルート、CGI掲示板風レトロUI。本番ロジックから完全分離（TDR-014）
- TASK-261: E2Eスモークテストを新UIに合わせて修正
- テスト: vitest 80ファイル/1653テスト全PASS / 本番スモーク 29/34 PASS
- コミット: 406299b, c8c64cc
- マイグレーション: `00022_create_dev_posts.sql` はGitHub Actionsで自動適用

### Sprint-90の成果
- TASK-259: `isSystemMessage=true`の場合にdailyIdを`"SYSTEM"`固定にする修正。モデル定義との乖離を解消
- テスト: vitest 79ファイル/1643テスト全PASS / 本番スモーク 29/34 PASS
- コミット: 259646d

### Sprint-89の成果
- TASK-258: `loadCommandConfigs()`にhiddenフラグチェック追加。!abeshinzo等の隠しコマンドが案内板に表示されないよう修正
- テスト: vitest 78ファイル/1638テスト全PASS / 本番スモーク 29/34 PASS
- コミット: d9ce610
- **注意:** 本番DBの固定スレッド更新には `upsert-pinned-thread.ts` の再実行が必要

### Sprint-88の成果
- TASK-257: formatDateTime()を共有ユーティリティ化し、DATフォーマッタ・マイページ・管理画面の日時表示をJST固定に統一
- テスト: vitest 78ファイル/1635テスト全PASS / 本番スモーク 29/34 PASS
- コミット: 1022e3a

### Sprint-86の成果（Phase 5差し戻し修正）
- TASK-256: D-05 currency initial_balance修正(50→0) + bot tutorial除外条件追加 + D-08 依存関係追記
- Phase 5結果: gate PASS / code-reviewer WARNING(H-001→次スプリント) / doc-reviewer 修正完了 / test-auditor APPROVE
- コミット: 8609acf

### Sprint-85の成果
- TASK-249: processPendingTutorials（pending→BOT生成→executeBotPost→pending削除）+ 単体テスト7件
- TASK-250: InMemory bulkReviveEliminated tutorial除外 + PostHistorySection統合 + D-08 docs更新
- TASK-251: tutorial BOT name修正（"名無しさん"）
- TASK-245/246: BDD step definitions 19シナリオ（mypage 8 + welcome 11）
- TASK-248: BDDリグレッション修正（seedDummyPost + InMemoryPendingTutorialRepo登録）
- テスト: vitest 1635 PASS / cucumber-js 274 passed, 0 failed, 16 pending

### Sprint-84の成果（実装 Wave 1-2）
- TASK-238〜241: CF Cron + ウェルカムシーケンス同期部分 + Tutorial Strategy + Mypage API
- テスト: vitest 1628 PASS / 78ファイル

### Sprint-83の成果（設計）
- TASK-236: ウェルカムシーケンス + CF Cron コンポーネント設計
- TASK-237: マイページ ページネーション・検索 コンポーネント設計
- HUMAN-006: CF Workers BOT_API_KEY設定完了

### Sprint-82の成果（E2E cleanup）
- TASK-233/234/235: E2E cleanup修正 + bdd_test_strategy.md規約追記
- コミット: 5ce3ce2

### Sprint-81の成果（再検証修正）
- TASK-232: cleanupDatabase FK制約修正 + D-06 !w説明文修正
- コミット: a54a86c

### Sprint-80の成果（差し戻し修正）
- TASK-226: コード修正6件（auth-cookie Max-Age, senbra-compat cleanup, hissi冗長クエリ, CreditReason compensation）
- TASK-227: D-06 thread-view.yaml 3件修正（route/format/command-help）
- コミット: 288da80

### Sprint-79の成果
- TASK-219/220: 撃破済みBOT表示機能（botMark enrichment + opacity + トグルUI）
- テスト: vitest 72ファイル/1535テスト全PASS / playwright E2E 16 passed
- コミット: 2f69639

### Sprint-78の成果
- E2Eテスト11件実装（thread-ui 7 + polling 2 + bot-display 2 fixme）+ 既存E2E修正
- コミット: 35889ab

### Sprint-77の成果
- @image_preview 4シナリオ実装 + kinou-handler TZ修正
- コミット: 78138b0

### Sprint-75〜76の成果
- Sprint-76: 調査コマンド(!hissi, !kinou)実装 + Discord認証修正（コミット: 9efe8fd）
- Sprint-75: TSC型エラー解消 + スレッド休眠実装 + 本番障害修正（コミット: b04feb1, 02b7655）

※ Sprint-44〜74の詳細は `tmp/orchestrator/archive/sprint_past.md` を参照

## テスト状況

- vitest: 1772 PASS（schema-consistency 1件はマイグレーション未適用による既存問題）
- cucumber-js: 340シナリオ / 324 passed / 0 failed / 16 pending
  - theme.feature 12シナリオ全PASS（Sprint-105で実装）
  - command_livingbot.feature 16シナリオ全PASS（Sprint-101でv1実装、Sprint-104でv2拡張）
  - command_newspaper.feature 5シナリオ全PASS（Sprint-97で実装）
  - command_aori.feature 7シナリオ全PASS（Sprint-96で実装）
  - command_iamsystem.feature 7シナリオ全PASS（Sprint-94で実装）
  - command_omikuji.feature 4シナリオ全PASS（Sprint-93で実装）
  - welcome.feature 11シナリオ全PASS（Sprint-85で実装）
  - mypage.feature 19シナリオ全PASS（既存11 + 新規8 Sprint-85で実装）
  - pending 16件のうち11件はE2E層で検証済み（thread-ui 7 + polling 2 + bot-display 2）
  - 残りpending 5件: 専ブラインフラ3 + Discord OAuth 2
- playwright E2E (ローカル): 16 passed, 0 fixme
  - navigation: 19テスト / thread-ui: 7テスト / basic-flow: 4テスト / polling: 2テスト / auth-flow: 1テスト / bot-display: 2テスト
- playwright API: 29テスト / 全PASS（専ブラ互換18 + 認証Cookie11）
- cucumber-js integration: 7シナリオ / 全PASS
- schema consistency: 3テスト / 全PASS
- **本番スモークテスト (Sprint-105後):** 30/35 PASS（5件は設計上のスキップ）

## 人間タスク（次回セッション開始時に確認）

以下はAI側の開発がブロックされている人間側の準備事項。回答・完了したものからAI開発を再開できる。

※ HUMAN-005（完了）, HUMAN-001（完了）, HUMAN-002（完了）の詳細は `tmp/orchestrator/archive/sprint_past.md` を参照

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
| DOC-004 | **D-04 OpenAPIにInternal API 3本追加** (`/api/internal/bot/execute`, `/daily-reset`, `/daily-stats`)。Phase 5 DOC-HIGH-001 | **人間承認待ち（Sprint-56で検出）** |
| DOC-005 | **D-04 OpenAPIに認証ルート7本追加** (register, register/discord, login, login/discord, callback, logout, mypage/pat/regenerate)。Phase 5 DOC-HIGH-002 | **人間承認待ち（Sprint-56で検出）** |
| DOC-003 | D-04 OpenAPIにinlineSystemInfoフィールドを追加するか（コードは既に実装済み、仕様書のみ未記載） | 設計判断待ち |
| MEDIUM-006 | 管理APIの認証エラーを401/403どちらに統一するか（現状はOpenAPI仕様通り） | 人間承認待ち |
| MEDIUM-003 | 日次集計のタイムゾーンをUTC/JSTどちらにするか | 設計判断待ち |

## AI側の次アクション

### 練習コマンド実装ロードマップ（詳細: `tmp/orchestrator/practice_commands_implementation_guide.md`）

| 順序 | コマンド | feature | 概要 | 状態 |
|---|---|---|---|---|
| ② | !omikuji | `command_omikuji.feature` | 最軽量。既存の仕組みで実装可 | **完了**（Sprint-93） |
| ① | !iamsystem | `command_iamsystem.feature` | ステルス基盤の構築が必要 | **完了**（Sprint-94） |
| ③ | !aori | `command_aori.feature` | BOT召喚 + 非同期キュー | **完了**（Sprint-96） |
| ④ | !newspaper | `command_newspaper.feature` | AI API (Gemini) + 非同期 | **完了**（Sprint-97） |

**練習コマンド①〜④全完了。Phase 5検証サイクル完了（Sprint-98で HIGH 3件修正済み）。**
次のマイルストーン: Strategy Step 3・4（HUMAN-003待ち）。
GEMINI_API_KEY の **GH Secrets** 設定が必要（人間タスク。Sprint-100でVercelからGH Actionsに移行済み）。設定後、newspaper-scheduler.yml のCronで非同期処理が本番稼働する。

### その他

| 人間タスク完了 | AI側で実行するスプリント |
|---|---|
| HUMAN-003 完了 | Strategy Step 3・4（スキーマ拡張 + ネタ師実装） |
| HUMAN-004 完了 | 該当コード修正（小規模） |

## BOT Strategy移行 進捗

| Step | 内容 | 状態 |
|---|---|---|
| ~~Step 1~~ | ~~Strategy インターフェース定義 + 荒らし役3 Strategy切り出し~~ | **完了（Sprint-43）** |
| ~~Step 2~~ | ~~BotService を Strategy 委譲にリファクタ~~ | **完了（Sprint-43）** |
| ~~Step 2.5~~ | ~~Phase 5検証 + HIGH指摘修正~~ | **完了（Sprint-44/45）** |
| Step 3 | bot_profiles.yaml スキーマ拡張 | HUMAN-003 待ち |
| Step 4 | ネタ師 Strategy 実装 + collected_topics + 収集ジョブ | HUMAN-003 待ち |

## 残存指摘（人間判断待ち）

| ID | 内容 | リスク | 状態 |
|---|---|---|---|
| MEDIUM-006 | 管理API認証ステータス不統一（401 vs 403）— 実装はOpenAPI仕様に一致。仕様変更にはAPI契約変更が必要 | 低 | HUMAN-004 |
| MEDIUM-003 | aggregate-daily-stats タイムゾーン（UTC vs JST設計判断） | 中 | HUMAN-004 |
| DOC-003 | D-04 OpenAPIにinlineSystemInfo未定義（コードは実装済み） | 低 | HUMAN-004 |

## 専ブラ実機テスト状況

※ 詳細は `tmp/orchestrator/archive/sprint_past.md` を参照。Siki: 正常動作、ChMate: CF正常/Vercel非対応（既知）

## 技術負債リスト（`tmp/arch_review_tech_debt.md`）

| ID | 内容 | 優先度 | 推奨時期 |
|---|---|---|---|
| ~~TD-ARCH-001~~ | ~~Next.js 16.1.6 → 16.2 アップデート（dev 400%高速化）~~ | ~~中~~ | **完了（2026-03-20 コミット 4cffffb）** |
| TD-ARCH-002 | `use cache` ディレクティブのキャッシュ戦略反映 | 中 | TD-ARCH-001と同時 |
| TD-ARCH-003 | React Compiler 有効化検討 | 中 | Phase 3 |
| TD-ARCH-004 | Vitest Visual Regression でpendingシナリオ解消 | 低 | UI安定後 |
| TD-ARCH-005 | BDDテストのESM移行検討 | 低 | 問題発生時 |

### ウォッチリスト（対応不要・監視のみ）
- Cloudflare Vinext（実験的）、supabase-js v3、Playwright Agent CLI

## 残課題

- HUMAN-003/004（上記「人間タスク」参照）
- デザイン・レイアウト改善（機能優先のため後回し）
- BOTマーク専ブラ反映（DAT差分同期問題の解決 — 未着手）
- **cron移行**: CF Cron Triggers 導入済み（Sprint-84 TASK-238）。荒らし役BOT移行完了。チュートリアルBOTスポーン処理も実装完了（Sprint-85 TASK-249）
- **[解決済み] cron 500エラー**: 原因2つ修正済み＋本番動作確認済み — (1) Sprint-93: IncentiveServiceスキップ (2) Sprint-95: FK制約違反修正。BOT正常動作を確認（2026-03-22）
- ※ 解決済みバグ（UUID変換、subject.txt 304、CF 1101）は `tmp/orchestrator/archive/sprint_past.md` に記録

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-105 | 管理者ログインページUI + 画面テーマ機能段階1 | completed | `tmp/orchestrator/sprint_105_plan.md` |
| Sprint-104 | !livingbot v2 スレッド内カウント追加 | completed | `tmp/orchestrator/sprint_104_plan.md` |
| Sprint-103 | countLivingBots型不整合修正 + 固定案内板リンクCF/Vercel併記 | completed | `tmp/orchestrator/sprint_103_plan.md` |
| Sprint-102 | countLivingBots N+1クエリ最適化（CF Workers サブリクエスト上限回避） | completed | `tmp/orchestrator/sprint_102_plan.md` |
| Sprint-101 | !livingbotコマンド + ラストボットボーナス実装 | completed | `tmp/orchestrator/sprint_101_plan.md` |
| Sprint-100 | newspaper非同期処理GH Actions移行 | completed | `tmp/orchestrator/sprint_100_plan.md` |
| Sprint-99 | ステルスコマンド本文除去バグ修正 | completed | `tmp/orchestrator/sprint_99_plan.md` |
| Sprint-98 | Phase 5検証HIGH修正（Sprint-96/97差し戻し） | completed | `tmp/orchestrator/sprint_98_plan.md` |
| Sprint-97 | !newspaperコマンド実装（AI API + Google Search Grounding + 非同期キュー） | completed | `tmp/orchestrator/sprint_97_plan.md` |
| Sprint-96 | !aoriコマンド実装（煽りBOT召喚 + 非同期キュー基盤） | completed | `tmp/orchestrator/sprint_96_plan.md` |
| Sprint-95 | BOT投稿FK制約違反修正 + 固定案内板リンクフルURL化 + レトロUI更新 | completed | `tmp/orchestrator/sprint_95_plan.md` |
| Sprint-94 | !iamsystem実装（ステルスコマンド基盤） | completed | `tmp/orchestrator/sprint_94_plan.md` |
| Sprint-93 | cron 500修正 + !omikuji実装 + !iamsystem設計 | completed | `tmp/orchestrator/sprint_93_plan.md` |
| Sprint-92 | featureファイルフラット化 + 旧パス残存修正 | completed | — |
| Sprint-91 | 開発連絡板リニューアル（本番分離 + レトロUI） | completed | `tmp/orchestrator/sprint_91_plan.md` |
| Sprint-90 | システムレスdailyId "SYSTEM"固定修正 | completed | `tmp/orchestrator/sprint_90_plan.md` |
| Sprint-89 | 固定スレッド隠しコマンド除外修正 | completed | `tmp/orchestrator/sprint_89_plan.md` |
| Sprint-88 | タイムゾーンバグ修正（全日時表示をJST固定に統一） | completed | `tmp/orchestrator/sprint_88_plan.md` |
| Sprint-87 | env整理(.env.prod.smoke→.env.prod, .env.example→.env.local.example) + auto-debugger CF Logs手順追加 | completed | — |
| Sprint-86 | Phase 5検証指摘修正（D-05/D-08整合性） | completed | (コミット: 8609acf) |
| Sprint-85 | Welcome Sequence Wave 3 + Mypage UI + BDD Steps | completed | `tmp/orchestrator/sprint_85_plan.md` |
| Sprint-84 | ウェルカムシーケンス + CF Cron + マイページ 実装 Wave 1-2 | completed | `tmp/orchestrator/sprint_84_plan.md` |
| Sprint-83 | ウェルカム + CF Cron + マイページ 設計 | completed | `tmp/orchestrator/sprint_83_plan.md` |
| Sprint-82 | E2E cleanup修正 + 再発防止 | completed | (コミット: 5ce3ce2) |
| Sprint-81 | Phase 5再検証修正（cleanupDB FK + !w説明文） | completed | `tmp/orchestrator/sprint_81_plan.md` |
| Sprint-80 | フェーズ5検証指摘修正（差し戻し） | completed | `tmp/orchestrator/sprint_80_plan.md` |
| Sprint-79 | 撃破済みBOT表示機能（botMark + opacity + トグル） | completed | `tmp/orchestrator/sprint_79_plan.md` |
| Sprint-78 | pending 11件E2Eテスト実装 + 既存E2E修正 | completed | `tmp/orchestrator/sprint_78_plan.md` |
| Sprint-77 | 画像URLサムネイル表示(@image_preview) + kinou-handler TZ修正 | completed | `tmp/orchestrator/sprint_77_plan.md` |
| Sprint-76 | 調査コマンド(!hissi, !kinou)実装 + Discord認証修正 | completed | `tmp/orchestrator/sprint_76_plan.md` |
| Sprint-75 | TSC型エラー解消 + スレッド休眠実装 + 本番障害修正 | completed | `tmp/orchestrator/sprint_75_plan.md` |
| Sprint-70〜74 | BDDステップスタブ修正〜E2Eスモーク全ページカバー | completed | `archive/sprint_070_074.md` |
| Sprint-60〜69 | UI構造改善（設計〜Phase 5再検証APPROVE） | completed | `archive/sprint_060_069.md` |
| Sprint-50〜59 | UUID修正〜Discord OAuth + Phase 5検証 | completed | `archive/sprint_050_059.md` |
| Sprint-42〜49 | BOT基盤〜固定スレッド自動デプロイ | completed | `archive/sprint_042_049.md` |
| Sprint-38〜41 | Phase 5検証 + 技術的負債解消 | completed | `archive/sprint_038_041.md` |
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
| `tmp/orchestrator/archive/sprint_042_049.md` | Sprint 42〜49 計画書統合 |
| `tmp/orchestrator/archive/sprint_050_059.md` | Sprint 50〜59 計画書統合 |
| `tmp/orchestrator/archive/sprint_060_069.md` | Sprint 60〜69 計画書統合 |
| `tmp/orchestrator/archive/sprint_070_074.md` | Sprint 70〜74 計画書統合 |
| `tmp/orchestrator/archive/sprint_past.md` | Sprint 44〜74成果、完了HUMAN詳細、解決済みバグ、専ブラ実機テスト等の履歴情報 |
| `tmp/tasks/archive/` | 全タスク指示書 (TASK-002〜210, SMOKE全件) |
| `tmp/escalations/archive/` | 全エスカレーション (14件、全resolved) |
| `tmp/workers/archive/` | 全ワーカー作業空間 |
| `tmp/reports/` | Phase 5検証レポート（code_review, doc_review, test_audit） |
| `tmp/reports/archive/` | Phase 1検証レポート |
| `tmp/archive/` | 一時ファイル（feature計画書、監査レポート等） |
