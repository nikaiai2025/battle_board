# スプリント状況サマリー

> 最終更新: 2026-03-18

## 現在のフェーズ

**Sprint-51 完了 — 専ブラ subject.txt 304判定バグ修正**

専ブラのスレッド一覧（subject.txt）で新規スレッドが反映されないバグを修正。If-Modified-Since比較の秒精度ミスマッチが原因。

### Sprint-51の成果
- subject.txt の If-Modified-Since 比較を秒精度に正規化（DAT routeと統一）
- subject.txt 専用の単体テスト17件を新規追加
- Vercelデプロイ完了・本番反映済み

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

- vitest: 46ファイル / 1174テスト / 全PASS（Sprint-51で+17件: subject.txt 304判定テスト追加）
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

### HUMAN-001: 荒らし役BOT本番稼働のための仕様決定（優先度: 高）

荒らし役のロジックは実装済みだが、本番で動かすトリガー（TASK-123）が未実装。以下を決定すればAIが即実装可能:

| 決定事項 | 選択肢例 | 備考 |
|---|---|---|
| cron実行間隔 | 30分ごと / 1時間ごと 等 | getNextPostDelayが60-120分を返すのでcron自体は短い間隔でOK |
| Internal API認証方式 | GitHub Secrets → Bearerトークン 等 | 標準的なパターンで十分 |
| 日次リセットcronの実行時刻 | 例: 毎日 00:00 UTC | 日次IDリセット・BOT統計集計用 |

**これが決まれば荒らし役BOTが本番稼働する。ネタ師等の詳細定義を待つ必要なし。**

### HUMAN-002: Discord OAuth設定（優先度: 高）

BDDシナリオ2件（本登録・ログイン）がpendingのまま。以下の設定作業が必要:

1. Discord Developer Portal でアプリケーション作成 → Client ID / Client Secret 取得
2. Supabase Dashboard > Authentication > Providers で Discord を有効化
3. コールバックURL設定（Supabaseが提供するURLをDiscord側に登録）
4. 環境変数に Client ID / Secret を設定

### HUMAN-003: ネタ師BOT詳細定義 + BDDシナリオ作成（優先度: 中）

Strategy Step 3・4の着手に必要。`features/` の変更は人間承認必須。

決めるべきこと:
- ネタの収集元（どのWebソース？ RSS / API？）
- AIプロンプトの方向性（要約型？煽り型？）
- スレ立ての頻度・条件
- HP・報酬パラメータ
- BDDシナリオ（`features/bot_system.feature` に追加 or 別ファイル）

### HUMAN-004: 設計判断3件（優先度: 低）

| ID | 判断内容 | 状態 |
|---|---|---|
| MEDIUM-006 | 管理APIの認証エラーを401/403どちらに統一するか（現状はOpenAPI仕様通り） | 人間承認待ち |
| MEDIUM-003 | 日次集計のタイムゾーンをUTC/JSTどちらにするか | 設計判断待ち |
| DOC-003 | D-04 OpenAPIにinlineSystemInfoフィールドを追加するか（コードは既に実装済み、仕様書のみ未記載） | 設計判断待ち |

## AI側の次アクション（人間タスク完了後）

| 人間タスク完了 | AI側で実行するスプリント |
|---|---|
| HUMAN-001 完了 | TASK-123再計画・実装（Internal API + cron → 荒らし役本番稼働）+ 日次集計cron（`.github/workflows/daily-stats.yml`） |
| HUMAN-002 完了 | Discord OAuthステップ定義をpendingから実装に切り替え |
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
- ~~BUG: 専ブラsubject.txtで新規スレッドが反映されない~~ → **Sprint-51で解消**
- HUMAN-001〜004（上記「人間タスク」参照）
- デザイン・レイアウト改善（機能優先のため後回し）
- BOTマーク専ブラ反映（DAT差分同期問題の解決 — 未着手）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
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
