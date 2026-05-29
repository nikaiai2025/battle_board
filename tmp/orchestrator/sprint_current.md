# スプリント状況サマリー

> 最終更新: 2026-05-30

## 現在のフェーズ

**Sprint-157 完了 — BOT投稿間隔×10 + スレッド保持数50→20**（コミット `6136709`）

### Sprint-157 進捗

- **フェーズ**: 全タスク完了・コミット済み
- **タスク状況**:

| TASK_ID | 状態 | 担当 | 内容 |
|---|---|---|---|
| TASK-400 | ✅ 完了 | bdd-coding | post-service.test.ts モック修正（findByThreadKey 追加） |
| TASK-401 | ✅ 完了 | bdd-coding | BOT投稿間隔×10 + スレッド保持数50→20 |

- **計画書**: `tmp/orchestrator/sprint_157_plan.md`

---

**Sprint-155〜156 完了（人間主導コミット含む）**

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

## テスト状況

- vitest: **2383 PASS / 0 failed**（133 files）— Sprint-157 品質ゲート確認済み
- cucumber-js: 461シナリオ / **454 passed / 0 failed** / 7 pending
  - pending 7件: bot_system.feature UIトグル関連（ブラウザ操作未実装）
- playwright E2E (ローカル): 未確認（前回 63 passed / 1 failed 既知）
- playwright API: 未確認（前回 27テスト 全PASS）

## 人間タスク

全完了。詳細は `tmp/orchestrator/archive/sprint_past.md` を参照。

## AI側の次アクション

| # | 次アクション | 内容 | 前提 |
|---|---|---|---|
| 1 | AA（アスキーアート）共有機能 | ユーザーが登録したAAを他ユーザーも参照できる仕様を検討・実装 | 仕様確定待ち（人間主導） |
| 2 | TD-GHA-001 対応 | GH Actions Node.js 20→24 対応（期限: 2026-06-02） | 即実施可 |
| 3 | BOT Strategy Step 4 Phase C | 残り11ソース実装 | 人間判断待ち |

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
| TD-GHA-001 | `actions/checkout@v4` / `actions/setup-node@v4` を v5 に更新（Node.js 20→24対応）。2026-06-02 に GitHub Actions が Node.js 24 を強制適用予定。GH Actions のみの変更でアプリへの影響なし。全 `.github/workflows/*.yml` が対象 | 中 | 2026-06-02 前に実施 |
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
| Sprint-157 | BOT投稿間隔×10 + スレッド保持数50→20 | completed | `sprint_157_plan.md` |
| Sprint-156 | 人間模倣ボット実装・スレッドプレビュー等（人間主導コミット） | completed | — |
| Sprint-155 | !yomiage コマンド実装（全9シナリオ + CF Workers 修正） | completed | `sprint_155_plan.md` |
| Sprint-154 | 荒らし役BOT増殖バグ修正（bulkReviveEliminated 冪等化 + データ訂正） | completed | `sprint_154_plan.md` |
| Sprint-151〜153 | Wikipedia API統合 / Daily Maintenance 500 障害修正 / curation source 4体追加 | completed | `archive/sprint_151_160.md` |
| Sprint-141〜150 | 開発連絡板BDD〜edge-tokenチャネル分離 | completed | `archive/sprint_141_150.md` |
| Sprint-111〜140 | 管理画面〜サブリクエスト最適化 | completed | `archive/sprint_111_120.md` `sprint_121_130.md` `sprint_131_140.md` |
| Sprint-105〜110 | テーマ機能 + サイトリネーム + 認証簡素化 | completed | `archive/sprint_105_110.md` |
| Sprint-1〜104 | Phase 1〜Phase 2 | completed | `archive/sprint_001_009.md` 〜 `sprint_095_104.md` |

## 未解決エスカレーション

なし（全エスカレーション archive 済み）

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `archive/sprint_past.md` | Sprint 44〜153成果、完了HUMAN詳細、解決済みバグ、専ブラ実機テスト等の履歴情報 |
| `archive/sprint_151_160.md` | Sprint 151〜160 計画書統合（現時点では 151〜153 を収録） |
| `archive/sprint_141_150.md` | Sprint 141〜150 計画書統合 |
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
