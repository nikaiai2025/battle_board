# スプリント状況サマリー

> 最終更新: 2026-03-29

## 現在のフェーズ

**Sprint-146 完了 — キュレーションBOT仕様変更v3（本文収集廃止 + upsert化）**

### Sprint-146の成果
- TASK-373: curation_bot.feature v3に合わせ全面更新
  - CollectedTopic/CollectedItem 型から content 削除
  - SubjectTxtAdapter: DAT fetch廃止、subject.txtパースのみに簡素化
  - collection-job: INSERT → upsert（ON CONFLICT対応）
  - formatBody: 「勢い: {buzzScore}\n{sourceUrl}」形式に変更
  - BDDステップ定義: 削除2シナリオ分除去 + 残シナリオ更新
- vitest: 2215 PASS / cucumber-js: 412 passed / 18 pending / 3 undefined
- E2E: 62 PASS + 1既知失敗 / API: 27 PASS
- コミット: 42cb501
- 本番スモーク: 30/35 PASS（5件はローカル限定テストのスキップ）

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

- vitest: **2215 PASS / 0 failed**（116 files）
- cucumber-js: 433シナリオ / **412 passed / 0 failed** / 18 pending / 3 undefined
  - pending 18件: 内訳 — thread-ui 7 + polling 2 + bot-display 2 + FAB 2 + 専ブラインフラ3 + Discord OAuth 2
  - undefined 3件: thread.feature FAB 関連（UI実装待ち）
- playwright E2E (ローカル): 62 passed / 1 failed（既知: auth-flow サイトタイトル不一致）
- playwright API: 27テスト / 全PASS
- **本番スモークテスト (Sprint-146後):** 30/35 PASS（5件はローカル限定テストのスキップ）

## 人間タスク

全完了。詳細は `tmp/orchestrator/archive/sprint_past.md` を参照。

## AI側の次アクション

| # | 次アクション | 内容 | 前提 |
|---|---|---|---|
| 1 | ~~キュレーション仕様変更~~ | ~~Sprint-146で完了~~ | ~~完了~~ |
| 2 | edge-token チャネル分離 | 専ブラ(HTTP)経由トークンの権限を投稿のみに限定。課金機能のブロッカー。計画書: `tmp/edge_token_channel_separation_plan.md` | **次スプリント** |
| 3 | BOT Strategy Step 4 Phase B | API統合テスト（キュレーション仕様変更後に再計画） | #2完了後 |

## BOT Strategy移行 進捗

| Step | 内容 | 状態 |
|---|---|---|
| Step 1〜2.5 | Strategy定義 + BotService委譲リファクタ + Phase 5検証 | **完了（Sprint-43〜45）** |
| Step 3 | bot_profiles.yaml スキーマ拡張 + collected_topics マイグレーション | **完了（Sprint-136）** |
| Step 4 Phase A | 速報+速報ボット: SubjectTxtAdapter + ThreadCreatorBehaviorStrategy + 収集ジョブ | **完了（Sprint-136）** |
| Step 4 Phase B | API統合テスト | Phase A 完了後 |
| Step 4 Phase C | 残り11ソースの一括実装 | Phase B 完了後 |

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
