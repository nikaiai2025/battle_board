# スプリント状況サマリー

> 最終更新: 2026-03-20

## 現在のフェーズ

**Sprint-76 完了 — 調査コマンド(!hissi, !kinou)実装 + Discord認証修正**

investigation.featureの11シナリオ全PASSを達成。HissiHandler/KinouHandlerの新規作成、PostRepository.findByAuthorIdAndDate新設、CommandService型拡張(responseType/independentMessage)、PostService Step 9b独立レス投稿汎用化を実装。

### Sprint-76の成果
- TASK-208: 実装計画策定（bdd-architect）— 2タスク分解、設計判断4件
- TASK-209: 基盤拡張 + ハンドラ実装（bdd-coding）— CommandService型拡張、PostService Step 9b汎用化、PostRepository.findByAuthorIdAndDate新設、HissiHandler/KinouHandler新規作成、config/commands追加、単体テスト35件追加
- TASK-210: BDDステップ定義 + インメモリ実装（bdd-coding）— investigation.steps.ts新規作成、in-memory findByAuthorIdAndDate追加、cucumber.js登録（エスカレーション経由）
- supabase/config.toml: Discord email_optional=true
- テスト: vitest 1481件全PASS / cucumber-js 267シナリオ(251 passed, 16 pending) / tsc 0エラー
- エスカレーション1件（ESC-TASK-210-1: cucumber.js locked_files追加）→ 自律解決
- コミット: 9efe8fd

### Sprint-75の成果
- TASK-202: TSC型エラー74件→0件解消（テストフィクスチャ13ファイル修正）+ pre-commitフック導入
- TASK-203: スレッド休眠(is_dormant)実装（thread-repository 3関数追加、post-service Step 10b、getThreadList onlyActive）
- TASK-204: BDDステップ定義（thread_dormancy 2シナリオ新規PASS）
- 本番障害修正: React hydration #418 JST固定化（TASK-206）、スモークテストuserID修正（TASK-207）
- migration: 00018_add_thread_dormancy.sql, 00019_seed_arashi_bot_remaining9.sql
- テスト: vitest 1481件全PASS / cucumber-js 267シナリオ(251 passed, 16 pending)
- コミット: b04feb1, 02b7655

### Sprint-74の成果
- TASK-198: 8ページ分のE2Eスモークテスト追加（/dev, /register/email, /register/discord, /admin×4, /threads/[threadId]）+ カバレッジスクリプト更新
- TASK-199: admin-user-repository.ts loginWithPassword RLSバグ修正（signInWithPassword後のセッション汚染）+ 単体テスト17件
- TASK-200: cleanupLocal から edge_tokens 削除を除外（フィクスチャ作成データの消失防止）
- TASK-201: mypage API 4ルートの認証方式統一（findByAuthToken → verifyEdgeToken）+ auth.fixture is_verified修正
- テスト: vitest 1412件全PASS / cucumber-js 240 passed, 16 pending / playwright navigation 19件全PASS

### Sprint-73の成果
- TASK-196: マイページにログアウトボタン追加（本登録ユーザーのみ表示、確認ダイアログ付き）+ 単体テスト5件
- TASK-197: IBotRepository に incrementAccusedCount 追加 + AccusationService.accuse() 内呼び出し追加 + InMemory版実装 + 単体テスト2件 + LL-010追記
- テスト: vitest 1395件全PASS / cucumber-js 240 passed, 16 pending, 0 failed
- 残: ai_accusation.steps.ts の botRepository 注入が旧引数順序のまま（次スプリントで対応推奨）

### Sprint-72の成果
- TASK-195: IBotRepository に incrementTotalPosts 追加 + executeBotPost 内呼び出し追加 + InMemory版実装 + 単体テスト2件
- テスト: vitest 1388件全PASS / cucumber-js 240 passed, 16 pending, 0 failed
- 残: 本番データ補正SQL（DB復旧後に `npx supabase db query --linked` で手動実行）

### Sprint-71の成果
- TASK-194: package.json `"next": "~16.1.6"`（実インストール 16.1.7）+ TD-ARCH-001 更新
- インシデント記録: `tmp/reports/INCIDENT-CF1101.md`
- 影響分析: `tmp/workers/bdd-architect_ANALYSIS-CF1101/analysis.md`
- 備忘: issue [#1157](https://github.com/opennextjs/opennextjs-cloudflare/issues/1157) の対応状況を 2026-03-24 頃にチェック（ウォッチリスト登録済み）

### Sprint-70の成果
- TASK-191: CommandHandlerResult に eliminationNotice フィールド追加 + PostService で★システム名義の独立レス投稿ロジック実装 + BDDステップ実検証化
- TASK-192: bot_system.steps.ts の assert(true) 空検証を InMemory リポジトリ実検証に格上げ
- TASK-193: /register/email（メール本登録フォーム）と /register/discord（Discord連携開始ページ）を新規作成
- インシデント記録: `docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md`
- 教訓記録: LL-007（BDDステップスタブの空洞化防止）

### Sprint-69の成果
- TASK-190: 重複テスト `src/lib/domain/rules/__tests__/mypage-display-rules.test.ts` 削除（-26テスト）
- 背景: test-auditorが `rules/__tests__/` のみ検索し `src/__tests__/app/(web)/mypage/` の既存テストを見落とした誤検出
- HIGH-01/02（thread.steps.ts §7.3形式不備）も§7.3.1の過剰解釈でLOW相当。コメント変更自体は正確なため維持

### Sprint-68の成果
- TASK-187: Thread型分散の調査・統合方針設計（bdd-architect）
- TASK-188: Thread型統合実装 — thread-types.ts新設、4ファイル重複解消、PollingResponseリネーム、デッドコード削除
- TASK-189: thread.steps.ts §7.3コメント整備 ~~+ mypage-display-rules.test.ts新規作成（26テスト）~~ → Sprint-69で重複削除
- TASK-186: test-auditor全件監査（再構成版）— HIGH 3件中3件が誤判定/過剰判定と判明

### Sprint-67の成果
- TASK-185: コマンドパーサー ルール9 検証・バグ修正（COMMAND_PATTERN後読みアサーション追加）
- BDDシナリオ2件追加、単体テスト6件追加
- bdd-test-auditor エージェント定義を原則ベースに再構成

### Sprint-66の成果（Phase 5再検証）
- BDDゲート: APPROVE（252 passed / 16 pending / 0 failed）
- コードレビュー: APPROVE（新規HIGH 0件）
- ドキュメントレビュー: APPROVE（新規HIGH 0件、MEDIUM 1件は非ブロッキング）
- テスト監査: APPROVE（新規HIGH 0件）

### Sprint-65の成果
- TASK-177: AnchorPopupProvider/AnchorPopup をpage.tsxに配置 + registerPosts追加 + id重複修正
- TASK-178: web-ui.md 修正（ポーリングURL、ThreadCreateForm、307、PostItem依存記述）
- TASK-179: E2Eスモークテスト更新（新ページ4件追加 + 旧URL→新URL更新）

### Sprint-64の成果（Phase 5検証サイクル）
- BDDゲート: APPROVE（252 passed / 16 pending / 0 failed）
- コードレビュー: WARNING — HIGH 2件（AnchorPopup未配置、registerPosts未呼出）→ Sprint-65で修正済
- ドキュメントレビュー: WARNING — HIGH 2件（AnchorPopup未配置、ポーリングURL乖離）→ Sprint-65で修正済
- テスト監査: WARNING — HIGH 2件（E2Eスモーク未追従）→ Sprint-65で修正済

### Sprint-63の成果
- TASK-171 (T8): web-ui.md §2/§3.1/§3.2 更新（URL構造変更、新コンポーネント追加、Client Component化反映）
- TASK-172 (T9): 19シナリオのBDDステップ定義追加 + 専ブラ互換ステップ修正
  - cucumber-js 252シナリオ (236 passed, 16 pending, 0 failed)
  - @url_structure 5件PASS, @pagination 5件PASS+2件pending, @anchor_popup 4件pending, @post_number_display 3件pending
  - pending 9件は意図的（D-10 §7.3 UI操作テスト境界、単体テストで担保）

### Sprint-62の成果
- TASK-167 (T3): `/` → `/battleboard/` リダイレクト、`/threads/{UUID}` → `/{boardId}/{threadKey}/` リダイレクト、read.cgi先変更
- TASK-168 (T4): ThreadCard/ThreadList boardId/threadKey伝播、リンク先 `/{boardId}/{threadKey}/` 統一
- TASK-169 (T5): PaginationNav新設（100件レンジ+最新50+全件）、スレッドページ上下配置
- TASK-170: ルート衝突修正（senbra [boardId]/route.ts 削除）
- ビルド確認: `npx next build` 成功

### Sprint-61の成果
- TASK-165 (T2): 板トップ `[boardId]/page.tsx` + スレッド閲覧 `[boardId]/[threadKey]/[[...range]]/page.tsx` + PostListLiveWrapper pollingEnabled追加
- TASK-166 (T7): AnchorPopupContext/AnchorPopup/AnchorLink 新設 + PostItem AnchorLink置換。新規テスト32件

### Sprint-60の成果
- TASK-163 (T1): pagination-parser(32テスト) + PostService getThreadByThreadKey/getPostList改修
- TASK-164 (T6): PostFormContext新設 + PostItem Client化・レス番号>>除去・クリック挿入。新規テスト14件

### Sprint-59の成果
- TASK-162: bdd-architect設計 — URL構造・ページネーション・アンカーポップアップ・レス番号表示の全体設計 + T1〜T9タスク分解

### Sprint-58の成果
- TASK-161: 00016_seed_arashi_bot.sql（冪等INSERT）+ createBotService() threadRepository/createPostFn注入修正
- BOT稼働ブロッカー: 全解消

### Sprint-57の成果（Phase 5差し戻し修正）
- TASK-159: timingSafeEqual置換 + daily-stats Service層抽出 + Discord OAuth try-catch追加 + ymlコメント修正
- TASK-160: bot_system.steps.ts のリンク切れコメント修正
- テスト: 56ファイル / 1,271テスト / 全PASS（+daily-stats-service.test.ts 7件追加）

### Sprint-56の成果（Phase 5検証サイクル）
- BDDゲート: APPROVE（227 passed / 7 pending / 0 failed）
- コードレビュー: HIGH 4件（修正済み@Sprint-57）、MEDIUM 5件
- ドキュメントレビュー: HIGH 2件（OpenAPI未定義 → HUMAN-004に追記）、MEDIUM 5件
- テスト監査: HIGH 2件（修正済み@Sprint-57）、MEDIUM 8件

### Sprint-55の成果
- TASK-154: OAuth/メール確認共通コールバック + Discord本登録/ログイン開始ルート + 単体テスト22件 + config.toml Discord設定
- テスト: 55ファイル / 1,284テスト / 全PASS（Sprint-54比 +22件、3ファイル追加）
- BDD pending: Discord OAuth 2件は意図的pending維持（D-10 §7.3.1: 外部OAuth依存のためCucumber層では検証不可）

### Sprint-54の成果
- TASK-151: D-08 bot.md TDR-010反映（アーキテクト）
- TASK-152: DB(next_post_at) + BotService拡張 + Internal APIルート3本 + Bearer認証 + 単体テスト40件
- TASK-153: GitHub Actionsワークフロー2本（bot-scheduler / daily-maintenance）
- HUMAN-001: クローズ（TDR-010として確定・記録済み）
- テスト: 52ファイル / 1,240テスト / 全PASS（Sprint-53比 +39件、4ファイル追加）
- ~~人間作業残: GitHub Secrets登録（BOT_API_KEY, DEPLOY_URL）~~ → **登録済み（2026-03-19）**
- ~~人間作業残: Supabaseマイグレーション適用（00015_bot_next_post_at）~~ → **CI自動適用済み（migrate.yml: mainプッシュ時に自動実行）**
- ~~人間作業残: 本番DBにボットseedデータINSERT~~ → **CI自動適用（00016_seed_arashi_bot.sql, Sprint-58）**

### Sprint-53の成果
- TASK-149: PostListLiveWrapper useEffect同期修正 + 単体テスト10件追加
- テスト: 48ファイル / 1,201テスト / 全PASS（Sprint-52比 +10件）

### Sprint-52の成果
- TASK-147: Cloudflare Workers fs互換性調査 → fs.readFileSync は workerd で動作しない（確定）
- TASK-148: YAML→TS定数化 + PostService lazy初期化導入 → コマンドシステム本番稼働可能に
- インシデント報告書: `docs/operations/incidents/2026-03-18_command_service_not_initialized.md`
- 教訓記録: LL-004（setter DI の構造的欠陥）
- テスト: 47ファイル / 1,191テスト / 全PASS（変更なし）
- ~~横展開未了: bot-service.ts / fixed-message.ts の同パターン修正~~ → **確認済み: TS定数化適用済み（コメントのみ残存、fs実呼び出しなし）**

### Sprint-51の成果
- TASK-144: 304判定の秒精度ミスマッチ修正（isNotModifiedSince共通化）
- TASK-145: Cache-Control: no-cache 追加（subject.txt + DAT route全レスポンス）
- TASK-146: **固定スレッドlastPostAt=2099年による永久304問題修正（真因）** — resolveLatestPostAt()で未来日時を除外
- テスト: 47ファイル / 1,191テスト / 全PASS（Sprint-50比 +34件）
- 本番確認済み: Last-Modified が2099年→正常日時に修正、専ブラで動作確認OK

### Sprint-50の成果
- InMemoryリポジトリ全14個にUUIDバリデーション追加（60箇所、人間実施）
- ステップ定義の非UUID文字列修正（10件解消）
- `>>N → UUID` リゾルバ実装（CommandService層、12件解消）
- PostRepository.findByThreadIdAndPostNumber 新規追加（本番/InMemory）
- BDDテスト戦略書改善（§7.1 ツールチェーンマッピング、§14 圧縮）
- lessons_learned.md 新規作成（LL-001: ブランド型UUID、LL-002: InMemory制約模倣）

### Sprint-49の成果
- command-parser前方引数・全角スペース対応（BDDシナリオ7件全PASS）
- inlineSystemInfo UI表示実装（PostItem.tsx — 実装漏れ修正）
- E2Eテスト追加: コマンド書き込み+inlineSystemInfo表示フロー検証

### Sprint-48の成果
- 固定スレッド自動upsert: GitHub Actionsで `config/commands.yaml` 変更時に自動実行 + `workflow_dispatch` で初回投入可能

### Sprint-46/47の成果（本番障害再発防止策3件）
- スキーマ整合性テスト: Row型フィールドとDBスキーマを自動突合（`npm run test:schema`）
- 統合テストCRUD拡大: 4→7シナリオ（投稿作成・レス書き込み・一覧取得を追加）
- CI自動マイグレーション: GitHub Actionsでmain push時にDBマイグレーション自動適用

### Sprint-44/45の成果（Phase 5検証+修正）
- HIGH指摘6件修正（逆依存解消、型重複解消、アトミック化、D-07同期）
- インシデント対応成果物コミット（00013マイグレーション + 障害記録）

## テスト状況

- vitest: 70ファイル / 1481テスト / 全PASS（Sprint-76で+35件: HissiHandler 15 + KinouHandler 12 + PostRepository.findByAuthorIdAndDate 8）
- cucumber-js: 267シナリオ (251 passed, 16 pending) / 0 failed
  - Sprint-76で+11件: investigation.feature全11シナリオPASS
  - pending 16件: 旧7件 + 新9件（@anchor_popup 4 + @post_number_display 3 + @pagination ポーリング2）— 全て意図的Pending
- playwright E2E smoke (navigation): 19テスト / 全PASS（Sprint-74で8→19に拡大。全13ページカバー）
- playwright E2E flow: 2テスト / 全PASS（Sprint-49でコマンド書き込みフロー追加）
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 7シナリオ / 全PASS（Supabase Local実DB、Sprint-47で4→7に拡大）
- schema consistency: 3テスト / 全PASS（Row型 vs 実DBスキーマ自動突合）
- **本番スモークテスト (Sprint-76後):** 10 PASS / 13 FAIL — 全FAILは `PROD_SMOKE_USER_ID` 未設定が原因（アプリバグではない）

## 人間タスク（次回セッション開始時に確認）

以下はAI側の開発がブロックされている人間側の準備事項。回答・完了したものからAI開発を再開できる。

### HUMAN-005: .env.prod.smoke に PROD_SMOKE_USER_ID 追加（優先度: 高）

`.env.prod.smoke` に `PROD_SMOKE_EDGE_TOKEN`, `PROD_ADMIN_EMAIL`, `PROD_ADMIN_PASSWORD` は設定済み。
**追加で `PROD_SMOKE_USER_ID` の設定が必要**（Sprint-75 TASK-207で追加された環境変数）。

手順:
1. 本番DBで `SELECT id FROM users WHERE author_id_seed = 'SMOKE_TEST';` を実行
2. 取得したUUIDを `.env.prod.smoke` の `PROD_SMOKE_USER_ID=` に設定

未設定の場合、スモークテスト24件中13件がFAILする（アプリバグではなく環境設定不備）。

### ~~HUMAN-001: 荒らし役BOT本番稼働のための仕様決定~~ → **確定済み（2026-03-18）**

| 決定事項 | 決定内容 |
|---|---|
| cron実行間隔 | 30分（`0,30 * * * *`）+ DB予定時刻方式（`next_post_at`） |
| Internal API認証方式 | Bearerトークン（BOT_API_KEY）※設定済み |
| 日次リセットcronの実行時刻 | 15:00 UTC（= 00:00 JST） |
| GitHub Secrets | `BOT_API_KEY`, `DEPLOY_URL` — **登録済み（2026-03-19 人間確認）** |

TDR-010 として D-07 に記録済み。議論経緯: `tmp/archive/discussion_bot_cron_design.md`

### ~~HUMAN-002: Discord OAuth設定~~ → **完了（2026-03-19）**

Discord Developer Portal + Supabase Dashboard設定完了。Sprint-55で `/api/auth/callback` + Discord登録/ログインルート実装完了。BDD pending 2件は意図的維持（D-10 §7.3.1）。

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

## AI側の次アクション（人間タスク完了後）

| 人間タスク完了 | AI側で実行するスプリント |
|---|---|
| ~~HUMAN-001 完了~~ | ~~→ Sprint-54で実装完了（Internal API + cron + DB）~~ |
| ~~HUMAN-002 完了~~ | ~~→ Sprint-55で /api/auth/callback + Discord登録/ログインルート実装完了~~ |
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

| 専ブラ | ホスト | 読み取り | 書き込み | 備考 |
|---|---|---|---|---|
| Siki | Vercel | ✅ | ✅ | 正常動作 |
| Siki | Cloudflare | ✅ | ✅ | 正常動作 |
| ChMate | Vercel | ❌ | ❌ | HTTP:80→308リダイレクト（既知。Vercel仕様） |
| ChMate | Cloudflare | ✅ | ✅ | 正常動作 |

## 設計書陳腐化レビュー（2026-03-19 人間実施）

設計当時WebSearch未使用だったため、最新情報との突合レビューを実施。

### 即時修正（完了・未コミット）
- D-10 §2: Cucumber.js ESM記述の事実訂正（「限定的」→ v12.5.0でネイティブESM対応済みに訂正。CJS方式は維持）
- TDR-006: Next.js 16でのキャッシュデフォルト変更を注記追記（`force-dynamic`はコード上維持）
- 対象ファイル: `bdd_test_strategy.md`, `architecture.md`（コミット 2f3d146）

### 技術負債リスト（`tmp/arch_review_tech_debt.md`）

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

- ~~BUG: `>>N → UUID`変換未実装~~ → **Sprint-50で解消**
- ~~BUG: 専ブラsubject.txtで新規スレッドが反映されない~~ → **Sprint-51で解消（本番確認済み）**
- ~~BUG: CF Workers Error 1101~~ → **Sprint-71で解消（Next.js ダウングレード。issue #1157 修正後に再アップグレード予定）**
- HUMAN-001〜004（上記「人間タスク」参照）
- デザイン・レイアウト改善（機能優先のため後回し）
- BOTマーク専ブラ反映（DAT差分同期問題の解決 — 未着手）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-76 | 調査コマンド(!hissi, !kinou)実装 + Discord認証修正 | completed | `tmp/orchestrator/sprint_76_plan.md` |
| Sprint-75 | TSC型エラー解消 + スレッド休眠実装 + 本番障害修正 | completed | `tmp/orchestrator/sprint_75_plan.md` |
| Sprint-74 | E2Eスモークテスト全ページカバー + バグ3件修正 | completed | `tmp/orchestrator/sprint_74_plan.md` |
| Sprint-73 | ログアウトボタン追加 + accused_count修正 | completed | `tmp/orchestrator/sprint_73_plan.md` |
| Sprint-72 | BOT total_posts インクリメント漏れ修正 | completed | `tmp/orchestrator/sprint_72_plan.md` |
| Sprint-71 | CF Workers Error 1101 緊急復旧（Next.js ダウングレード） | completed | `tmp/orchestrator/sprint_71_plan.md` |
| Sprint-70 | BDDステップスタブ残存バグ修正 + 本登録ページ実装 | completed | `tmp/orchestrator/sprint_70_plan.md` |
| Sprint-69 | test-auditor誤検出による重複テスト削除 | completed | `tmp/orchestrator/sprint_69_plan.md` |
| Sprint-68 | Thread型統合 + test-auditor HIGH指摘解消 | completed | `tmp/orchestrator/sprint_68_plan.md` |
| Sprint-67 | コマンドパーサー ルール9（スペース省略対応） | completed | `tmp/orchestrator/sprint_67_plan.md` |
| Sprint-66 | Phase 5 再検証サイクル — **全APPROVE** | completed | `tmp/orchestrator/sprint_66_plan.md` |
| Sprint-65 | Phase 5 差し戻し修正（HIGH指摘対応） | completed | `tmp/orchestrator/sprint_65_plan.md` |
| Sprint-64 | Phase 5 検証サイクル（Sprint-59〜63対象） | completed | `tmp/orchestrator/sprint_64_plan.md` |
| Sprint-63 | UI構造改善 完了フェーズ（ドキュメント更新+BDDステップ定義） | completed | `tmp/orchestrator/sprint_63_plan.md` |
| Sprint-62 | UI構造改善 実装フェーズ3（リダイレクト+リンク生成+PaginationNav） | completed | `tmp/orchestrator/sprint_62_plan.md` |
| Sprint-61 | UI構造改善 実装フェーズ2（URL構造変更+アンカーポップアップ） | completed | `tmp/orchestrator/sprint_61_plan.md` |
| Sprint-60 | UI構造改善 実装フェーズ1（pagination-parser+レス番号表示） | completed | `tmp/orchestrator/sprint_60_plan.md` |
| Sprint-59 | UI構造改善 設計（bdd-architect） | completed | `tmp/orchestrator/sprint_59_plan.md` |
| Sprint-58 | BOT本番稼働ブロッカー解消（seed + createBotService修正） | completed | `tmp/orchestrator/sprint_58_plan.md` |
| Sprint-57 | Phase 5 差し戻し修正（HIGH 5件） | completed | `tmp/orchestrator/sprint_57_plan.md` |
| Sprint-56 | Phase 5 検証サイクル（Sprint-46〜55対象） | completed | `tmp/orchestrator/sprint_56_plan.md` |
| Sprint-55 | Discord OAuth ルートハンドラー実装 | completed | `tmp/orchestrator/sprint_55_plan.md` |
| Sprint-54 | 荒らし役BOT本番稼働基盤（Internal API + cron） | completed | `tmp/orchestrator/sprint_54_plan.md` |
| Sprint-53 | PostListLiveWrapper二重表示バグ修正 | completed | `tmp/orchestrator/sprint_53_plan.md` |
| Sprint-52 | CommandService本番未初期化バグ修正 | completed | `tmp/orchestrator/sprint_52_plan.md` |
| Sprint-51 | 専ブラ subject.txt 304判定バグ修正 | completed | `tmp/orchestrator/sprint_51_plan.md` |
| Sprint-50 | InMemory UUIDバリデーション + >>N→UUIDリゾルバ | completed | `tmp/orchestrator/sprint_50_plan.md` |
| Sprint-49 | command-parser前方引数・全角スペース対応 | completed | `tmp/orchestrator/sprint_49_plan.md` |
| Sprint-48 | 固定スレッド自動デプロイ（GitHub Actions） | completed | `tmp/orchestrator/sprint_48_plan.md` |
| Sprint-47 | 統合テストCRUD追加 + CI自動マイグレーション | completed | `tmp/orchestrator/sprint_47_plan.md` |
| Sprint-46 | スキーマ整合性テスト導入（POST 500障害再発防止） | completed | `tmp/orchestrator/sprint_46_plan.md` |
| Sprint-45 | Phase 5 差し戻し修正（HIGH-001〜004 + DOC-001/002/005） | completed | `tmp/orchestrator/sprint_45_plan.md` |
| Sprint-44 | Phase 5 検証サイクル（Sprint-40〜43対象） | completed | `tmp/orchestrator/sprint_44_plan.md` |
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
