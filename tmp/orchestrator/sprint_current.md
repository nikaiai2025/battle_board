# スプリント状況サマリー

> 最終更新: 2026-03-20

## 現在のフェーズ

**Sprint-76 完了 + 手動修正コミット済 — 次スプリント: @image_preview実装**

### 手動修正コミット (1b66d0f) — 2026-03-21
人間が手動で実施した本番障害修正 + ドキュメント整備:
- **attacks.post_id nullable化**: コマンド実行(Step5)がレスINSERT(Step9)より先のため、空文字がUUID列に到達しサイレント失敗していた問題を修正。マイグレーション00020
- **CommandContext.dailyId追加**: 攻撃・告発の表示文字列で内部UUIDではなく日次IDを表示するよう修正
- **features/thread.feature**: @image_preview 4シナリオ追加（次スプリントで実装）
- **ドキュメント**: LL-011追加、bdd_test_strategy用語統一、cron移行調査レポート
- **テスト修正**: dailyId追加に伴うTSCエラー修正（abeshinzo/hissi/kinou/command-service各テスト）
- features/image_upload.feature → features/ドラフト_実装禁止/ に移動

### Sprint-76の成果
- TASK-208〜210: 調査コマンド(!hissi, !kinou)実装 + Discord認証修正
- テスト: vitest 1481件全PASS / cucumber-js 267シナリオ(251 passed, 16 pending)
- コミット: 9efe8fd

### Sprint-75の成果
- TASK-202: TSC型エラー74件→0件解消（テストフィクスチャ13ファイル修正）+ pre-commitフック導入
- TASK-203: スレッド休眠(is_dormant)実装（thread-repository 3関数追加、post-service Step 10b、getThreadList onlyActive）
- TASK-204: BDDステップ定義（thread_dormancy 2シナリオ新規PASS）
- 本番障害修正: React hydration #418 JST固定化（TASK-206）、スモークテストuserID修正（TASK-207）
- migration: 00018_add_thread_dormancy.sql, 00019_seed_arashi_bot_remaining9.sql
- テスト: vitest 1481件全PASS / cucumber-js 267シナリオ(251 passed, 16 pending)
- コミット: b04feb1, 02b7655

※ Sprint-44〜74の詳細は `tmp/orchestrator/archive/sprint_past.md` を参照

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
- **本番スモークテスト (Sprint-76後):** 23/23 全PASS（1件skip: ローカル限定テスト）

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

## AI側の次アクション（人間タスク完了後）

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
- **cron移行**: GitHub Actions cron → Cloudflare Cron Triggers（またはリポ公開化）。調査レポート: `docs/research/feasibility_cron_migration.md`。現時点では保留（人間判断待ち）
- ※ 解決済みバグ（UUID変換、subject.txt 304、CF 1101）は `tmp/orchestrator/archive/sprint_past.md` に記録

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
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
