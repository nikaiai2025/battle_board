# スプリント過去情報アーカイブ

> sprint_current.md から移植した、今後のスプリントで参照不要な履歴情報。

## 完了済みスプリント成果（Sprint-111〜137）

### Sprint-137の成果
- TASK-354: `createBotService()` に `createThread` と `collectedTopicRepository` を DI 注入
- vitest: 2084 PASS / cucumber-js: 373 PASS / 本番スモーク: 17/17 PASS
- コミット: a4af902

### Sprint-136の成果
- TASK-349〜353: キュレーションBOT Phase A（SubjectTxtAdapter + ThreadCreatorBehaviorStrategy + 収集ジョブ + BDD13シナリオ）
- vitest: 2084 PASS / cucumber-js: 373 passed(+12) / 本番スモーク: 17/17 PASS
- コミット: 7a395c6

### Sprint-135の成果
- TASK-345〜348: ボット日次リセット インカーネーション + !w同日制限撤廃 + 範囲攻撃BDD + FAB pending
- vitest: 2025テスト PASS / cucumber-js: 361 passed, 18 pending / 本番スモーク: 17/17 PASS
- フェーズ5: 全PASS

### Sprint-134の成果
- TASK-342/343: command_copipe.feature 8シナリオ修正（通貨自動補填 + IncentiveLog事前挿入ブロック）
- vitest: 2003テスト PASS / cucumber-js: 353 passed

### Sprint-133の成果
- TASK-341: コピペボット(HP:100) + 運営BOTコスト免除
- vitest: 2003テスト PASS / cucumber-js: 345 passed

### Sprint-128の成果
- TASK-332: !copipe 曖昧ヒット通知フォーマット変更

### Sprint-127の成果
- TASK-330: !copipe v2 改修 + seed 195件投入

### Sprint-126の成果
- TASK-328/329: !copipe コマンド実装 + インフラ（Seed Script + GHA）

### Sprint-125の成果
- TASK-327: 削除済みレス非表示バグ修正（is_deletedフィルタ除去）

### Sprint-122〜124の成果
- TOCTOU原子採番 + soft deleteフィルタ + completeRegistrationアトミック化

### Sprint-121の成果
- TASK-319〜322: HUMAN-004解消 + リファクタリング2件 + BOT-DIAGクリーンアップ

### Sprint-120の成果
- TASK-317/318: !newspaper GHA 403修正 + welcome bot !w 復旧

### Sprint-119の成果
- TASK-316: GrassHandler BOT草付与パス実装

### Sprint-118の成果
- TASK-315: getUserList N+1修正（サブリクエスト52→3）

### Sprint-117の成果
- TASK-314: 管理者ユーザー管理 機能欠損修正 + BAN設計意図明文化

### Sprint-116の成果
- TASK-313: パスワード再設定フロントエンド + バックエンド

### Sprint-115の成果
- TASK-312: loginWithEmail レイヤー規約違反修正

### Sprint-114後のホットフィックス3件
- メール本登録リダイレクト不備 / チュートリアルBOT cron再投稿エラー / auth-code重複レコード防御

### Sprint-113の成果
- TASK-307〜309: BOT情報漏洩修正 + 専ブラedgeTokenフォールバック

### Sprint-112の成果
- TASK-301〜306: 管理者課金ステータス変更 + 管理画面修正 + 開発環境整備

### Sprint-111の成果
- TASK-298〜300: 管理画面スレッド管理UI + !wバグ修正 + 非同期コマンド即時トリガー

---

## 完了済みスプリント成果（Sprint-75〜104）

### Sprint-104の成果
- TASK-281: !livingbot v2 — スレッド内カウント追加
- BDD 16シナリオ全PASS / vitest 1741 PASS / コミット: 039aad2

### Sprint-103の成果
- TASK-280: countLivingBots ネストselect型不整合修正（2クエリ分離 + Array.isArray()）
- コミット: 0a0962d, f5ff278

### Sprint-102の成果
- TASK-279: countLivingBots N+1クエリ最適化（CF Workers サブリクエスト上限回避）
- コミット: a880754

### Sprint-101の成果
- TASK-277/278: !livingbotコマンド + ラストボットボーナス実装
- 新規: livingbot-handler.ts, daily-event-repository.ts, 00024_daily_events.sql
- コミット: 5f0df18

### Sprint-100の成果
- TASK-275/276: newspaper非同期処理GH Actions移行（AI API呼び出しをVercel→GH Actions）
- コミット: c705a3c

### Sprint-99の成果
- TASK-274: command-parser.ts raw→match[0]修正（ステルスコマンド本文除去バグ）
- コミット: 37fe1f3

### Sprint-98の成果
- TASK-273: Phase 5 HIGH修正3件 + 検証サイクル完了
- コミット: fabe02b

### Sprint-97の成果
- TASK-271/272: !newspaper実装（AI API + Google Search Grounding + 非同期キュー）
- コミット: 9bd187c

### Sprint-96の成果
- TASK-269/270: !aori実装（煽りBOT召喚 + 非同期キュー基盤）
- コミット: 69c80fb

### Sprint-95の成果
- TASK-267/268: 固定案内板リンクフルURL化 + BOT投稿FK制約違反修正
- コミット: 6225e73

### Sprint-94の成果
- TASK-266: !iamsystemコマンド実装（ステルス基盤構築）
- BDD 285 passed / vitest 1675 PASS

### Sprint-93の成果
- TASK-263/264/265: cron 500修正 + !omikuji実装 + !iamsystem設計
- BDD 278 passed / vitest 1668 PASS

### Sprint-92の成果
- featureファイルフラット構成化 + 旧パス残存修正
- vitest 1653 PASS

### Sprint-91の成果
- TASK-260/261: dev_postsテーブル + レトロUI + E2Eスモーク修正
- コミット: 406299b, c8c64cc

### Sprint-90の成果
- TASK-259: isSystemMessage dailyId="SYSTEM"修正
- コミット: 259646d

### Sprint-89の成果
- TASK-258: 隠しコマンド案内板非表示修正
- コミット: d9ce610

### Sprint-88の成果
- TASK-257: formatDateTime()共有ユーティリティ化、JST統一
- コミット: 1022e3a

### Sprint-86の成果（Phase 5差し戻し修正）
- TASK-256: D-05 currency修正 + bot tutorial除外
- コミット: 8609acf

### Sprint-85の成果
- TASK-249/250/251/245/246/248: ウェルカムシーケンス実装 + BDD 19シナリオ
- vitest 1635 PASS / cucumber-js 274 passed

### Sprint-84の成果
- TASK-238〜241: CF Cron + ウェルカムシーケンス同期 + Tutorial Strategy + Mypage API
- vitest 1628 PASS

### Sprint-83の成果
- TASK-236/237: ウェルカムシーケンス設計 + マイページ設計

### Sprint-82の成果
- TASK-233/234/235: E2E cleanup + bdd_test_strategy.md規約追記
- コミット: 5ce3ce2

### Sprint-81の成果
- TASK-232: cleanupDatabase FK制約修正
- コミット: a54a86c

### Sprint-80の成果
- TASK-226/227: Phase 5差し戻しコード修正6件 + D-06修正
- コミット: 288da80

### Sprint-79の成果
- TASK-219/220: 撃破済みBOT表示機能
- コミット: 2f69639

### Sprint-78の成果
- E2Eテスト11件実装
- コミット: 35889ab

### Sprint-77の成果
- @image_preview 4シナリオ + kinou-handler TZ修正
- コミット: 78138b0

### Sprint-75〜76の成果
- Sprint-76: 調査コマンド(!hissi, !kinou)実装（コミット: 9efe8fd）
- Sprint-75: TSC型エラー解消 + スレッド休眠実装 + 障害修正（コミット: b04feb1, 02b7655）

---

## 完了済みスプリント成果（Sprint-44〜74）

### Sprint-74の成果
- TASK-198: 8ページ分のE2Eスモークテスト追加（/dev, /register/email, /register/discord, /admin×4, /threads/[threadId]）+ カバレッジスクリプト更新
- TASK-199: admin-user-repository.ts loginWithPassword RLSバグ修正（signInWithPassword後のセッション汚染）+ 単体テスト17件
- TASK-200: cleanupLocal から edge_tokens 削除を除外（フィクスチャ作成データの消失防止）
- TASK-201: mypage API 4ルートの認証方式統一（findByAuthToken → verifyEdgeToken）+ auth.fixture is_verified修正
- テスト: vitest 1412件全PASS / cucumber-js 240 passed, 16 pending / playwright navigation 19件全PASS

### Sprint-73の成果
- TASK-196: マイページにログアウトボタン追加（本登録ユーザーのみ表示、確認ダイアログ付き）+ 単体テスト5件
- TASK-197: IBotRepository に incrementAccusedCount 追加 + AccusationService.accuse() 内呼び出し追加 + InMemory版実装 + 単体テスト2件 + LL-010追記

### Sprint-72の成果
- TASK-195: IBotRepository に incrementTotalPosts 追加 + executeBotPost 内呼び出し追加 + InMemory版実装 + 単体テスト2件

### Sprint-71の成果
- TASK-194: package.json `"next": "~16.1.6"`（実インストール 16.1.7）+ TD-ARCH-001 更新
- インシデント記録: `tmp/reports/INCIDENT-CF1101.md`
- 備忘: issue #1157 の対応状況を 2026-03-24 頃にチェック（ウォッチリスト登録済み）

### Sprint-70の成果
- TASK-191: CommandHandlerResult に eliminationNotice フィールド追加 + PostService で★システム名義の独立レス投稿ロジック実装 + BDDステップ実検証化
- TASK-192: bot_system.steps.ts の assert(true) 空検証を InMemory リポジトリ実検証に格上げ
- TASK-193: /register/email（メール本登録フォーム）と /register/discord（Discord連携開始ページ）を新規作成

### Sprint-69の成果
- TASK-190: 重複テスト削除（-26テスト）

### Sprint-68の成果
- TASK-187/188: Thread型統合実装
- TASK-186: test-auditor全件監査（再構成版）

### Sprint-67の成果
- TASK-185: コマンドパーサー ルール9 検証・バグ修正

### Sprint-66の成果（Phase 5再検証）
- 全APPROVE

### Sprint-65の成果
- TASK-177/178/179: AnchorPopup配置 + web-ui.md修正 + E2Eスモークテスト更新

### Sprint-64の成果（Phase 5検証サイクル）
- WARNING → Sprint-65で修正済

### Sprint-63〜59の成果
- UI構造改善（設計〜BDDステップ定義）

### Sprint-58の成果
- BOT稼働ブロッカー全解消

### Sprint-57〜56の成果
- Phase 5差し戻し修正 + 検証サイクル

### Sprint-55の成果
- Discord OAuth ルートハンドラー実装

### Sprint-54の成果
- 荒らし役BOT本番稼働基盤（Internal API + cron）

### Sprint-53〜44の成果
- PostListLiveWrapper修正、CommandService本番修正、subject.txt 304修正、UUID修正、command-parser改善、固定スレッド自動デプロイ、統合テスト拡充、Phase 5検証+修正

## 完了済み人間タスク

### HUMAN-005: 本番管理者登録 + .env.prod.smoke 設定 → 完了（2026-03-20）
`.env.prod.smoke` の全必要変数設定済み。本番スモークテスト 23/23 全PASS。

### HUMAN-001: 荒らし役BOT本番稼働のための仕様決定 → 確定済み（2026-03-18）
TDR-010 として D-07 に記録済み。議論経緯: `tmp/archive/discussion_bot_cron_design.md`

### HUMAN-002: Discord OAuth設定 → 完了（2026-03-19）
Sprint-55で実装完了。

## 完了済みAI側アクション

| 人間タスク完了 | AI側で実行するスプリント |
|---|---|
| HUMAN-001 完了 | → Sprint-54で実装完了（Internal API + cron + DB） |
| HUMAN-002 完了 | → Sprint-55で /api/auth/callback + Discord登録/ログインルート実装完了 |

## 解決済みバグ

- `>>N → UUID`変換未実装 → Sprint-50で解消
- 専ブラsubject.txtで新規スレッドが反映されない → Sprint-51で解消（本番確認済み）
- CF Workers Error 1101 → Sprint-71で解消（Next.js ダウングレード。issue #1157 修正後に再アップグレード予定）

## 設計書陳腐化レビュー（2026-03-19 人間実施）

### 即時修正（完了）
- D-10 §2: Cucumber.js ESM記述の事実訂正（コミット 2f3d146）
- TDR-006: Next.js 16でのキャッシュデフォルト変更を注記追記（コミット 2f3d146）

## 専ブラ実機テスト状況

| 専ブラ | ホスト | 読み取り | 書き込み | 備考 |
|---|---|---|---|---|
| Siki | Vercel | OK | OK | 正常動作 |
| Siki | Cloudflare | OK | OK | 正常動作 |
| ChMate | Vercel | NG | NG | HTTP:80→308リダイレクト（既知。Vercel仕様） |
| ChMate | Cloudflare | OK | OK | 正常動作 |
