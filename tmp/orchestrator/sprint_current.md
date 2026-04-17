# スプリント状況サマリー

> 最終更新: 2026-04-17

## 現在のフェーズ

**Sprint-154 完了 — 荒らし役BOT増殖バグ修正（ロジック + データ訂正の2段階）**（コミット: フェーズ1 `6a24df2` / フェーズ2 未プッシュ）

### Sprint-154 フェーズ1 成果（ロジック修正）

- **TASK-386 (bdd-architect)**: 設計検証完了。オーケストレーター Q3 案を否定し **`revived_at TIMESTAMPTZ`** 方式を推奨。Q2 は aori も含めて拡張
- **TASK-387 (bdd-coding)**: 実装完了
  - migration 00047: `bots.revived_at TIMESTAMPTZ NULL` + 部分 INDEX
  - `BotRepository.bulkReviveEliminated()` 冪等化（SELECT に `revived_at IS NULL`、INSERT 後に UPDATE）
  - `deleteEliminatedSingleUseBots()` 新設（tutorial/aori/hiroyuki 撃破済み + 7日経過未撃破）
  - `BotService.performDailyReset()` Step 6 更新
  - docs 更新（bot.md §2.10 / §5.1 / §6.11, state_transitions.yaml #daily_reset）
  - 新規単体テスト 10件

### Sprint-154 フェーズ2 成果（データ訂正）

- **TASK-388 (bdd-coding)**: migration 00048 作成完了
  - Step 1: 荒らし役 active 107→10（最新 created_at 10 体残し、他 97 体を `is_active=false` + `revived_at=NOW()` でソフト削除）
  - Step 2: tutorial/aori/hiroyuki の 7 日経過レコードを物理削除
  - Step 3: tutorial/aori/hiroyuki の撃破済みを物理削除
  - `BEGIN;...COMMIT;` でアトミック実行。ローカル適用は 0 rows affected で安全

### 品質ゲート
vitest 2306 PASS / cucumber 411 PASS（変更スコープ内）。統合3件・E2E1件 FAIL は Sprint-153 切り戻しで再現確認済みの既存障害のためスプリント外

### 自律判断実績（権限移譲ルール適用）
- **ESC-TASK-387-1**: インターフェース名変更に伴うモック同期 → locked_files 機械的拡張
- **ESC-TASK-387-2**: aori cleanup 拡張に伴う step assertion 緩和 → step 実装のみ修正（feature ファイル不変）
- **ESC-TASK-387-3**: `Bot` 型必須プロパティ追加に伴うフィクスチャ網羅漏れ（pre-commit TS エラー）→ `revivedAt: null` 機械的追加

---

**Sprint-153 完了 — キュレーションBOT Phase C Step 1（subject_txt 流用 × 4体）**（コミット: `368f129`）

### Sprint-153 の成果
- TASK-385: config/bot-profiles.ts に 4 プロファイル追加（`curation_poverty` / `curation_mnewsplus` / `curation_news4vip` / `curation_liveedge`）
- migration 00046: 4 BOT 冪等 seed
- 既存 `SubjectTxtAdapter` 流用（Adapter 変更なし）、adapter-resolver 変更なし
- **vitest: 2296/2296 PASS / cucumber: 411/411 PASS**（既存件数維持）
- 本番スモーク: 省略（人間判断）

### Sprint-153 で発覚した次スプリント送り事項
- 荒らし役BOT 107体増殖バグ → Sprint-154 へ分離

---

**Sprint-152 完了 — Daily Maintenance 500 障害修正（2層バグ: RPC型キャスト + FK CASCADE）**（コミット: `8e1706f` / `423e246` / `b362a0a`）

### Sprint-152の成果
- **TASK-382:** migration 00043 — RPC `bulk_update_daily_ids` の `p_daily_id_date::date` 明示キャスト
- **TASK-383:** migration 00044 — `bot_posts.bot_id` FK を `ON DELETE CASCADE` 化
- **TASK-384:** migration 00045 — `attacks.bot_id` / `grass_reactions.receiver_bot_id` / `collected_topics.source_bot_id` の3 FK を `ON DELETE CASCADE` 化
- **17日障害解消:** 2026-03-27 〜 2026-04-14 の連続 HTTP 500 を修正
  - 原因1: PostgreSQL text→date 暗黙キャスト禁止で RPC 失敗（2026-03-29 混入）
  - 原因2: `bots` 参照FK 4テーブルが `NO ACTION` で `deleteEliminatedTutorialBots` が FK違反（Sprint-84 以来の潜在バグ）
- **主検証:** daily-maintenance run #24427737023: daily-reset 5s PASS / daily-stats 4s PASS
- **品質ゲート:** vitest 2296 PASS / cucumber-js 411 PASS / 統合 3 PASS / E2E 63/64（1件 pre-existing Sprint-108 由来タイトル検証漏れ）
- **本番スモーク:** 31/36 PASS 維持（Sprint-151 基準）
- **GitHub Issue #2:** closed（修正内容 + インシデント報告書リンクをコメント添付）
- **Cloudflare Version:** `bae61917`

### Sprint-152 で追加された知見
- インシデント報告書: `docs/operations/incidents/2026-04-15_daily_maintenance_500_17day_outage.md`（9項目フレームワーク）
- 教訓 LL-017: FK の `ON DELETE` 指定は必須（`NO ACTION` デフォルトは設計意図を見落とすトラップ）

### 対応見送りとした項目（人間判断 2026-04-15）
- **AIセッション開始時の CI失敗 Issue チェック**: 本件は認知が即日成立しており（別件優先で対応保留）、構造的問題ではないため対応不要
- **integration test 拡充**: 類似事象が再発しても Issue 起票経路で即座に検知可能なため、費用対効果が見合わず見送り
- **schema 規約明文化**: 同上

※ LL-018（初稿で書いた「通知の認知フロー断絶」教訓）は事実誤認に基づくため取り下げ。lessons_learned.md に取り下げ記録のみ残置

---

**Sprint-151 完了 — キュレーションBOT Phase B: Wikipedia日次急上昇 API統合**（コミット: `ec11f98`）

### Sprint-151の成果
- TASK-379: Wikipedia API統合設計書（4成果物、9論点決着、ESC-TASK-379-1 自律解決）
  - 投稿間隔変更の適用範囲判断: **curation系（topic_driven 方式）のみ** 12-24時間化。荒らし役BOT(60-120分) やコピペBOT は対象外（feature 別シナリオで既定のため）
- TASK-380: BOT投稿間隔（curation系） 240-360分 → 720-1440分
- TASK-381: WikipediaAdapter 実装 + curation_wikipedia プロファイル + formatBody 拡張（Phase A 波及あり、feature v4 準拠）
- BDD変更: `features/curation_bot.feature` v3→v4（月次・定番記事除去 + 12-24時間投稿間隔）
- vitest: 2296 PASS（+45）/ cucumber-js: 411 PASS
- 本番スモーク: 31/36 PASS（Sprint-150 基準維持）
- Cloudflare Version: `92faa009`

### Sprint-151 テスト設計判断（確認済み）

D-10 §7.2・§8・§9・§10 と照合し、以下の判断を採用:

| レイヤ | 実装有無 | 根拠 |
|---|---|---|
| 単体テスト (Vitest) | ✅ 43件実装 | WikipediaAdapter の主力検証層。純粋関数6個 + `collect()` 11ケース（正常系・404フォールバック・429/503・空レス・6件未満・メタページ除外等）。`fetchJson` DI でモック化 |
| BDDサービス層 (Cucumber) | ✅ 既存9シナリオ流用 | feature v4 は抽象記述のため Wikipedia 固有ステップは追加せず、adapter 差し替えで共通カバー |
| 統合テスト (Supabase Local) | ❌ 対象外 | D-10 §8「統合テストは SQL/RLS/マイグレーション/リポジトリ層向け」。Adapter は対象外 |
| API テスト | ❌ 対象外 | D-10 §9.2「専ブラ互換/認証/エラーレスポンス」に限定。バッチ経路は対象外 |
| E2E テスト | ❌ 対象外 | バッチ経路（GitHub Actions cron）のため UI 非依存 |
| 実API契約テスト | ❌ 不採用 | ESC-TASK-379-1 論点A「CI 不安定化リスク回避」で明示的に却下。`collection-job.ts` のソース単位隔離でリスク受容 |

**フィクスチャ:** `src/__tests__/lib/collection/adapters/fixtures/wikipedia_top_ja_2026_04_12.json`（Wikimedia API 実レスポンスの Top50 スナップショット）

### Sprint-151 人間作業（完了状況）
| # | 作業 | 状況 |
|---|---|---|
| 1 | GitHub Secret `WIKIMEDIA_CONTACT` 設定 | ✅ 完了（2026-04-15、人間作業） |
| 2 | 本番 Supabase への migration 00042 適用 | ✅ **自動適用完了**（`migrate.yml` by push trigger、2026-04-14T10:50:59Z、21秒で success） |
| 3 | 実働確認（GitHub Actions cron 起動後の `collected_topics` INSERT 確認） | ⏳ 翌日以降（cron トリガ待ち） |
| 4 | ローカル Supabase への migration 00042 適用 | ⏭️ 不要（BOT seed INSERT のみ、テストは DB 非依存で完結） |

**人間直接修正 (2026-04-13) — hiroyuki除外 + 管理画面BOTメタデータ表示**（コミット: `e479099`）
- BOT reviveから `hiroyuki` を除外（`src/lib/infrastructure/repositories/bot-repository.ts`）
- 管理画面BOT詳細ページでメタデータ表示追加（`src/app/(admin)/admin/bots/[botId]/page.tsx`）
- 関連単体テスト更新（`bot-repository.test.ts` / `admin/bots/[botId]/route.test.ts`）
- D-08 `docs/architecture/components/bot.md` 同期更新
- ※ Sprint番号なし（人間による直接修正）

**Sprint-150 完了 — edge-token チャネル分離**

### Sprint-150の成果
- TASK-378: edge-tokenチャネル分離 全実装
  - edge_tokens に channel カラム追加（マイグレーション 00041）
  - トークン発行: Web UI → web、専ブラ/PAT認証 → senbra で書き分け
  - mypage系 + auth/pat APIルートに channel=web ガード追加（senbra → 403）
  - 課金機能のセキュリティ前提条件を充足
- vitest: 2249 PASS / cucumber-js: 412 passed
- コミット: 8eead6f
- 本番スモーク: 31/36 PASS（5件はローカル限定スキップ）

**Sprint-149 完了 — BOT createThread UUID制約違反 + 固定スレッド除外**（コミット: af7a08a）

**Sprint-148 完了 — BOTスケジューラ障害修正**（コミット: 9c3b507, c82af6b）

**Sprint-147 完了 — 管理画面BOT一覧にnextPostAt表示**（コミット: 6fae52b）

**Sprint-146 完了 — キュレーションBOT仕様変更v3（本文収集廃止 + upsert化）**（コミット: 42cb501）

**Sprint-145 完了 — BOTインフラ修正 + コピペ管理UI更新**

### Sprint-145の成果
- TASK-371: BOTスケジューラ復活（bot-scheduler.yml cron uncomment）+ hiroyukiプロファイルbot-profiles.ts同期
- TASK-372: ウェルカムBOT重複スポーン修正（pending_tutorials削除順序変更 + UNIQUE制約追加）
- login/page.tsx 微修正（人間変更）、コピペ管理UI更新（人間変更）
- コミット: 07cc7d6, f53cdfa

**Sprint-144 完了 — 陳腐化テスト修正 + auth/verify edge-token新規発行対応**（コミット: 9a2b98b）

**Sprint-141〜143 完了**
- Sprint-143: マイページ コピペ管理UI + UI改善
- Sprint-142: 管理画面BOT管理 + ユーザー語録登録（05be61c, 71352b9）
- Sprint-141: 開発連絡板 BDD ステップ定義（857effd）

**Sprint-138〜140 完了**
- Sprint-140: PostService/AttackHandler サブリクエスト最適化（97dc7e5）
- Sprint-139: ユーザーコピペ管理機能 + !copipe マージ検索（3227525）
- Sprint-138: Ops基盤障害修正（bfae891）

### CF Observability 既知エラー（解消済み・再調査不要）

2026-03-29 に CF Observability の実エラーを調査し、以下は解消済みと判定。ログに残存するが対応不要。

| 検出日 | エンドポイント | エラー概要 | 修正Sprint/コミット |
|---|---|---|---|
| 03-24 | `GET /api/admin/users` | Too many subrequests (`getBalance` N+1) | Sprint-118 / 237ef50 |
| 03-22 ×2 | `POST /api/internal/bot/execute` | UUID パースエラー（"新参おるやん🤣"をUUID解析） | cebd451（チュートリアルBOT本文を改行区切りに変更） |
| 03-21 | `POST /api/internal/bot/execute` | FK制約違反 (`incentive_logs.user_id` BOT未登録) + exceededCpu | Sprint-95 / 6225e73（BOT書き込み時インセンティブスキップ） |

**未解消（Sprint-140で緩和、要監視）:**
- 03-27: `POST /api/threads/.../posts` — Too many subrequests (`countActiveThreads`)。独立システムレス再帰呼び出しでサブリクエスト上限到達。Sprint-140 でワーストケース約47クエリ削減済み（推定92〜114）。再発しなければ解消扱い

### 敵対的コードレビュー進捗（一時中断中）

| # | Feature | ステータス | 指摘/採用 | セッション |
|---|---------|-----------|----------|-----------|
| 1 | admin.feature | 完了 | 36/19 | `20260325_admin_auth` |
| 2 | authentication.feature | 完了 | (上と合算) | `20260325_admin_auth` |
| 3 | posting.feature | **完了** | 9/3 (CRITICAL:1, HIGH:2) | `20260326_posting` |
| 4 | thread.feature | **完了** | 18/11 (CRITICAL:1, HIGH:10) | `20260326_thread` |
| 5 | user_registration.feature | **完了** | 12/8 (CRITICAL:4, HIGH:2) | `20260326_user_registration` |
| 6〜22 | （残17件）| 未着手 | | |

**Sprint-134〜137 完了**

- Sprint-137: createBotService DI欠落ホットフィックス（a4af902）
- Sprint-136: キュレーションBOT Phase A（7a395c6）
- Sprint-135: 範囲攻撃BDD + インカーネーション + !w制限撤廃（cee9882）
- Sprint-134: command_copipe.feature修正（1d86004）

※ Sprint-137以前の詳細は `tmp/orchestrator/archive/sprint_past.md` を参照
※ Sprint計画書原本: `tmp/orchestrator/archive/sprint_111_120.md`, `sprint_121_130.md`, `sprint_131_140.md`

## テスト状況

- vitest: **2296 PASS / 0 failed**（120 files）
- cucumber-js: 433シナリオ / **411 passed / 0 failed** / 18 pending / 4 undefined
  - pending 18件: 内訳 — thread-ui 7 + polling 2 + bot-display 2 + FAB 2 + 専ブラインフラ3 + Discord OAuth 2
  - undefined 4件: thread.feature FAB 関連（UI実装待ち）
- playwright E2E (ローカル): 63 passed / 1 failed（既知: auth-flow サイトタイトル不一致 — Sprint-108 由来の pre-existing）
- playwright API: 27テスト / 全PASS
- **本番スモークテスト (Sprint-152後):** 31/36 PASS（5件はローカル限定テストのスキップ）

## 人間タスク

全完了。詳細は `tmp/orchestrator/archive/sprint_past.md` を参照。

## AI側の次アクション

| # | 次アクション | 内容 | 前提 |
|---|---|---|---|
| 1 | ~~キュレーション仕様変更~~ | ~~Sprint-146で完了~~ | ~~完了~~ |
| 2 | ~~edge-token チャネル分離~~ | ~~Sprint-150で完了~~ | ~~完了~~ |
| 3 | ~~BOT Strategy Step 4 Phase B~~ | ~~Wikipedia日次急上昇で完了（Sprint-151）~~ | ~~完了~~ |
| 4 | BOT Strategy Step 4 Phase C | 残り11ソース一括実装（Phase B 実績活用） | Wikipedia BOT 実働確認後 |
| 5 | 定番記事BOT | 固定リスト型（別featureで管理） | 人間判断待ち |

## BOT Strategy移行 進捗

| Step | 内容 | 状態 |
|---|---|---|
| Step 1〜2.5 | Strategy定義 + BotService委譲リファクタ + Phase 5検証 | **完了（Sprint-43〜45）** |
| Step 3 | bot_profiles.yaml スキーマ拡張 + collected_topics マイグレーション | **完了（Sprint-136）** |
| Step 4 Phase A | 速報+速報ボット: SubjectTxtAdapter + ThreadCreatorBehaviorStrategy + 収集ジョブ | **完了（Sprint-136）** |
| Step 4 Phase B | Wikipedia日次急上昇 API統合 | **完了（Sprint-151）** |
| Step 4 Phase C | 残り11ソースの一括実装 | Phase B 実働確認後 |

## 技術負債リスト

| ID | 内容 | 優先度 | 推奨時期 |
|---|---|---|---|
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

- サイトリネーム Phase 3: ドメイン変更（新ドメイン確定待ち。詳細: `tmp/archive/site_rename_migration_plan.md` Section 4）
- デザイン・レイアウト改善（機能優先のため後回し）
- BOTマーク専ブラ反映（DAT差分同期問題の解決 — 未着手）
- 専ブラ実機テスト: Siki正常動作 / ChMate CF正常・Vercel非対応（既知）
- Supabase Custom SMTP: 稼働増加時にサードパーティSMTPインフラ（SendGrid等）の導入を検討

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-152 | Daily Maintenance 500 障害修正（bulk_update_daily_ids 型キャスト） | completed | `sprint_152_plan.md` |
| Sprint-151 | キュレーションBOT Phase B: Wikipedia日次急上昇 API統合 | completed | `sprint_151_plan.md` |
| Sprint-150 | edge-token チャネル分離 | completed | `sprint_150_plan.md` |
| Sprint-149 | BOT createThread UUID制約違反 + 固定スレッド除外 | completed | `sprint_149_plan.md` |
| Sprint-148 | BOTスケジューラ障害修正（チュートリアルBOT除外 + キュレーションBOT認証修正） | completed | `sprint_148_plan.md` |
| Sprint-147 | 管理画面BOT一覧にnextPostAt表示 | completed | `sprint_147_plan.md` |
| Sprint-146 | キュレーションBOT仕様変更v3（本文収集廃止 + upsert化） | completed | `sprint_146_plan.md` |
| Sprint-145 | BOTインフラ修正（スケジューラ復活・hiroyuki同期・ウェルカム重複修正） | completed | `sprint_145_plan.md` |
| Sprint-144 | 陳腐化テスト修正 + auth/verify edge-token新規発行 | completed | `sprint_144_plan.md` |
| Sprint-143 | マイページ コピペ管理UI + UI改善 | completed | `sprint_143_plan.md` |
| Sprint-142 | 管理画面BOT管理 + ユーザー語録登録 | completed | `sprint_142_plan.md` |
| Sprint-141 | 開発連絡板 BDD ステップ定義 | completed | `sprint_141_plan.md` |
| Sprint-111〜140 | 管理画面〜サブリクエスト最適化 | completed | `archive/sprint_111_120.md` `sprint_121_130.md` `sprint_131_140.md` |
| Sprint-105〜110 | テーマ機能 + サイトリネーム + 認証簡素化 | completed | `archive/sprint_105_110.md` |
| Sprint-1〜104 | Phase 1〜Phase 2 | completed | `archive/sprint_001_009.md` 〜 `sprint_095_104.md` |

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `archive/sprint_past.md` | Sprint 44〜137成果、完了HUMAN詳細、解決済みバグ、専ブラ実機テスト等の履歴情報 |
| `archive/sprint_131_140.md` | Sprint 131〜140 計画書統合 |
| `archive/sprint_121_130.md` | Sprint 121〜130 計画書統合 |
| `archive/sprint_111_120.md` | Sprint 111〜120 計画書統合 |
| `archive/sprint_105_110.md` | Sprint 105〜110 計画書統合 |
| `archive/sprint_095_104.md` 〜 `sprint_001_009.md` | Sprint 1〜104 計画書統合 |
| `tmp/tasks/archive/` | 全タスク指示書 |
| `tmp/escalations/archive/` | 全エスカレーション（全resolved） |
| `tmp/workers/archive/` | 全ワーカー作業空間 |
| `tmp/reports/` | 最新Phase 5検証レポート（code_review, doc_review, test_audit） |
| `tmp/reports/archive/` | 過去の検証レポート・障害記録 |
| `tmp/archive/` | 完了済み一時ファイル |
