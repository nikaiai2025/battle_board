# スプリント状況サマリー

> 最終更新: 2026-03-19

## 現在のフェーズ

**Sprint-57 完了 — Phase 5 差し戻し修正（Sprint-56検証で検出されたHIGH指摘5件）**

Sprint-56 Phase 5検証でHIGH 8件を検出。コード品質4件+テスト監査1件を自律修正。OpenAPI関連2件は人間承認待ち（HUMAN-004）。

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
- 人間作業残: GitHub Secrets登録（BOT_API_KEY, DEPLOY_URL）、Supabaseマイグレーション適用

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

- vitest: 56ファイル / 1271テスト / 全PASS（Sprint-57で+daily-stats-service.test.ts。テスト数減はdaily-stats route重複テスト整理のため）
- cucumber-js: 234シナリオ (227 passed, 7 pending) / 0 failed
  - Sprint-50でUUIDバリデーション起因の22 FAIL → 0 FAILに修正
  - 残pending 7件: インフラ制約3件 + bot_system UI 2件 + Discord OAuth 2件 — 意図的Pending
- playwright E2E smoke: 8テスト / 全PASS
- playwright E2E flow: 2テスト / 全PASS（Sprint-49でコマンド書き込みフロー追加）
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 7シナリオ / 全PASS（Supabase Local実DB、Sprint-47で4→7に拡大）
- schema consistency: 3テスト / 全PASS（Row型 vs 実DBスキーマ自動突合）

## 人間タスク（次回セッション開始時に確認）

以下はAI側の開発がブロックされている人間側の準備事項。回答・完了したものからAI開発を再開できる。

### ~~HUMAN-001: 荒らし役BOT本番稼働のための仕様決定~~ → **確定済み（2026-03-18）**

| 決定事項 | 決定内容 |
|---|---|
| cron実行間隔 | 30分（`0,30 * * * *`）+ DB予定時刻方式（`next_post_at`） |
| Internal API認証方式 | Bearerトークン（BOT_API_KEY）※設定済み |
| 日次リセットcronの実行時刻 | 15:00 UTC（= 00:00 JST） |

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

## 残課題

- ~~BUG: `>>N → UUID`変換未実装~~ → **Sprint-50で解消**
- ~~BUG: 専ブラsubject.txtで新規スレッドが反映されない~~ → **Sprint-51で解消（本番確認済み）**
- HUMAN-001〜004（上記「人間タスク」参照）
- デザイン・レイアウト改善（機能優先のため後回し）
- BOTマーク専ブラ反映（DAT差分同期問題の解決 — 未着手）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
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
