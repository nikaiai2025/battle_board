# スプリント状況サマリー

> 最終更新: 2026-03-17

## 現在のフェーズ

**Sprint-45 完了 — Phase 5 検証サイクル + 差し戻し修正**

Sprint-44でPhase 5検証サイクルを実施（Sprint-40〜43の194ファイル/12K行を対象）。
Sprint-45でHIGH指摘6件を修正し、再検証PASSを確認。

### Sprint-44/45の成果
- HIGH-001: Strategy→bot-service逆依存を解消（IThreadRepository移動）
- HIGH-002: BotProfileReward型定義重複を解消
- HIGH-003: ダミーBotオブジェクトを共通ファクトリに集約
- HIGH-004: incrementColumnレースコンディションをRPC関数でアトミック化
- DOC-001/002/005: D-07 botsテーブル定義・依存関係図・ER図をD-08に同期
- インシデント対応成果物コミット（00013マイグレーション + 障害記録）

## テスト状況

- vitest: 44ファイル / 1138テスト / 全PASS（Sprint-43比 +44件 — bot-repository.test.ts新規追加）
- cucumber-js: 228シナリオ (221 passed, 7 pending) / 0 failed
  - 残pending 7件: インフラ制約3件 + bot_system UI 2件 + Discord OAuth 2件 — 意図的Pending
- playwright E2E smoke: 8テスト / 全PASS
- playwright E2E flow: 1テスト / 全PASS
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

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
| HUMAN-001 完了 | TASK-123再計画・実装（Internal API + cron → 荒らし役本番稼働） |
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

- HUMAN-001〜004（上記「人間タスク」参照）
- デザイン・レイアウト改善（機能優先のため後回し）
- BOTマーク専ブラ反映（DAT差分同期問題の解決 — 未着手）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
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
