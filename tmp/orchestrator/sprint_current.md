# スプリント状況サマリー

> 最終更新: 2026-03-17

## 現在のフェーズ

**Phase 2 実装中 — Sprint-34 草コマンド実装**

Phase 2 Step 1〜3（コマンド基盤・告発・攻撃）完了。本登録機能完了。Bot v5完了。
Sprint-34で草コマンド（!w）+ mypage草カウント表示を実装中。

## テスト状況

- vitest: 36ファイル / 1005テスト / 全PASS
- cucumber-js: 211シナリオ (202 passed, 9 pending) / 0 failed
  - pending 9件: インフラ制約3件 + bot_system UI/GitHub Actions 6件 — 意図的Pending
  - undefined 0件（Sprint-34で全解消）
  - reactions.feature: 22/22 PASS（Sprint-34新規）
  - ai_accusation.feature: 9/9 PASS
  - command_system.feature: 15/15 PASS
  - bot_system.feature: 18/27 PASS, 9 pending (UI/GHA)
  - user_registration.feature: 24/27 PASS, 2 pending (Discord OAuth), 1 本登録課金ガード済
- playwright E2E smoke: 8テスト / 全PASS（ナビゲーションスモークテスト）
- playwright E2E flow: 1テスト / 全PASS（基本機能確認フロー）
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

## 専ブラ実機テスト状況

| 専ブラ | ホスト | 読み取り | 書き込み | 備考 |
|---|---|---|---|---|
| Siki | Vercel | ✅ | ✅ | 正常動作 |
| Siki | Cloudflare | ✅ | ✅ | 正常動作 |
| ChMate | Vercel | ❌ | ❌ | HTTP:80→308リダイレクトで接続不可（既知。Vercel仕様） |
| ChMate | Cloudflare | ✅ | ✅ | 正常動作（Sprint-20でSecure/SameSite除去により解決） |

## 本登録機能（user_registration）進捗

全体計画:
- **Sprint-30（完了）**: DB基盤 + Repository + AuthService改修
- **Sprint-31（完了）**: 本登録・ログイン・ログアウトAPIルート + PAT管理
- **Sprint-32（完了）**: マイページUI拡張 + bbs.cgi PAT統合 + ドキュメント同期

Sprint-31で完了した内容:
- `RegistrationService` — 新規作成（registerWithEmail, loginWithEmail, logout, verifyPat, regeneratePat等）
- APIルート4本 — register/login/logout/pat（全てテスト付き）
- 新規テスト70件 全PASS

## Bot system v5 設計状況

Sprint-31で設計完了:
- `docs/specs/bot_state_transitions.yaml` — D-05 v5全面改訂（3状態7遷移、撃破報酬計算式、賠償金）
- `docs/architecture/components/bot.md` — D-08 v5全面改訂（11インターフェース、attacksテーブル）
- `docs/architecture/components/attack.md` — D-08新規（AttackHandler独立設計）
- 設計判断メモ: `tmp/workers/bdd-architect_TASK-086/design_notes.md`

Sprint-32で解決済み:
- ✅ D-07 architecture.md への attacks テーブル追記（TASK-090）
- ✅ accusation.md のボーナス関連記述の削除（TASK-090）
- ✅ D-02 ユビキタス言語辞書の更新（TASK-090）
- ✅ !attack エラーケース2件追加 v5.1（TASK-093、人間承認済み）

## 告発ボーナス廃止

Sprint-31で完了:
- ai_accusation.feature v3→v4 に合わせ10ファイル修正
- calculateBonus削除、AccusationBonusConfig簡素化（costのみ）、ICurrencyService依存削除
- BDDステップ定義2件追加（undefined解消）

## Sprint-32 マイページUI + bbs.cgi PAT統合

Sprint-32で完了:
- マイページに本登録セクション・PAT表示・課金ガード追加（mypage-display-rules.ts新規）
- bbs.cgi PAT認証統合（D-08 §6認証判定フロー準拠）
- テスト49件追加（mypage 30 + PAT 19）

## 実装ロードマップ（承認済み）

| Sprint | 内容 | 規模 | 計画書/設計書 |
|---|---|---|---|
| **Sprint-34（進行中）** | 草コマンド !w 本格実装 + mypage草カウント | 中 | `sprint_34_plan.md` |
| Sprint-35 | 固定スレッド + 開発連絡板（dev板） | 小〜中 | `tmp/feature_plan_pinned_thread_and_dev_board.md` |
| Sprint-36 | 管理機能拡充①（DB + BAN + 通貨付与） | 中 | `tmp/feature_plan_admin_expansion.md` |
| Sprint-37 | 管理機能拡充②（ユーザー管理 + ダッシュボード + 管理画面UI） | 大 | 同上 |

### feature更新状況（人間承認済み）

- **reactions.feature（v3）**: 22シナリオ — Sprint-34で実装
- **mypage.feature（草カウント追加）**: 2シナリオ — Sprint-34で実装
- **thread.feature**: 固定スレッドシナリオ追加予定 — Sprint-35で feature更新+実装
- **admin.feature**: BAN/通貨/ユーザー管理/ダッシュボード 12シナリオ追加予定 — Sprint-36〜37で feature更新+実装

## 残課題

- **Sprint-34**: reactions.feature 草コマンド + mypage草カウント
- 固定スレッド + dev板（Sprint-35予定）
- 管理機能拡充: BAN/通貨付与/ユーザー管理/ダッシュボード（Sprint-36〜37予定）
- デザイン・レイアウト改善（機能優先のため後回し）

## Phase 3 未実装事項（BDDスコープ外・インフラ層）

BDDテスト（D-10方針: サービス層テスト）ではカバーできないインフラ層の実装項目。
BDDシナリオのうち対応するものは pending 扱いで、Phase 3 のインフラ実装時に検証する。

| 項目 | 対応するBDDシナリオ | BDDでの検証状態 | 必要な実装 |
|---|---|---|---|
| BOT定期書き込みcronジョブ | `荒らし役ボットは1〜2時間間隔で書き込む` | pending（インフラ依存） | `.github/workflows/` にcronジョブ定義。`BotService.executeBotPost()` をHTTP経由で呼び出す |
| BOT書き込みAPIエンドポイント | 上記と連動 | — | GitHub Actionsから呼び出すための内部APIルート（認証付き） |
| 日次リセットcronジョブ | `翌日になるとBOTマークが解除され〜` 等 | BDDではサービス関数を直接呼び出してPASS | `.github/workflows/daily-maintenance` にcronジョブ定義。`BotService.performDailyReset()` をHTTP経由で呼び出す |
| BOTマーク付与の専ブラ反映 | bot_system.feature ヘッダコメント「設計懸念」参照 | — | 専ブラDAT差分同期（Rangeヘッダ）で既読レスのBOTマーク変更が反映されない問題。実装時に検証必要 |

**補足**: サービス層のロジック（`executeBotPost`, `selectTargetThread`, `performDailyReset` 等）はSprint-33で実装済み。Phase 3で必要なのは「トリガー（cron）」と「エンドポイント（APIルート）」のみ。

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-34 | 草コマンド !w 本格実装 + mypage草カウント | completed | `tmp/orchestrator/sprint_34_plan.md` |
| Sprint-33 | Bot v5実装(DB+Service+BDD) + user_registration BDD + mypage課金ガード | completed | `tmp/orchestrator/sprint_33_plan.md` |
| Sprint-32 | Doc sync + マイページUI本登録 + bbs.cgi PAT + bot_system v5.1 | completed | `tmp/orchestrator/sprint_32_plan.md` |
| Sprint-31 | Bot v5設計 + 告発ボーナス廃止 + 本登録APIルート | completed | `tmp/orchestrator/sprint_31_plan.md` |
| Sprint-30 | 本登録DB基盤 + EdgeTokenRepository + AuthService移行 | completed | `tmp/orchestrator/sprint_30_plan.md` |
| Sprint-29 | E2Eナビゲーションスモークテスト作成 + basic-flow統合 | completed | `tmp/orchestrator/sprint_29_plan.md` |
| Sprint-28 | ai_accusation.feature改訂 + 告発経済パラメータ集約 | completed | `tmp/orchestrator/sprint_28_plan.md` |
| Sprint-27 | Phase 2 Step 2: !tell ハンドラ + AccusationService実装 | completed | `tmp/orchestrator/sprint_27_plan.md` |
| Sprint-26 | 専ブラ絵文字バグ修正（HTML数値参照→UTF-8逆変換） | completed | `tmp/orchestrator/sprint_26_plan.md` |
| Sprint-25 | BDD失敗10件修正（incentive二段階評価 + mypage★置換 + admin削除コメント） | completed | `tmp/orchestrator/sprint_25_plan.md` |
| Sprint-24 | Phase 2 Step 1: コマンド基盤実装（parser+Service+PostService統合） | completed | `tmp/orchestrator/sprint_24_plan.md` |
| Sprint-23 | Phase 2準備: GAP-1〜7解消（仕様確定・ドキュメント更新） | completed | `tmp/orchestrator/sprint_23_plan.md` |
| Sprint-22以前 | Phase 1完了 + 専ブラ互換 + 各種修正 | completed | アーカイブ参照 |

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `tmp/orchestrator/archive/sprint_001_009.md` | Sprint 1〜9 計画書統合 |
| `tmp/orchestrator/archive/sprint_010_019.md` | Sprint 10〜19 計画書統合 |
| `tmp/orchestrator/archive/sprint_020_022.md` | Sprint 20〜22 計画書統合 |
| `tmp/tasks/archive/` | 全タスク指示書 (TASK-002〜062) |
| `tmp/escalations/archive/` | 全エスカレーション (13件、全resolved) |
| `tmp/workers/archive/` | ワーカー作業空間 |
| `tmp/reports/` | Phase 1検証レポート（code_review, doc_review） |
