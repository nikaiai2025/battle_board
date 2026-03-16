# スプリント状況サマリー

> 最終更新: 2026-03-16

## 現在のフェーズ

**Phase 2 実装中 + 本登録機能 Step 2完了 + Bot v5設計完了**

Phase 2 Step 1（コマンド基盤）・Step 2（!tell告発）実装完了。BOTマーク関連2シナリオはPhase 3依存のため除外中。
Sprint-31で3ストリーム並行実施: Bot v5設計 / 告発ボーナス廃止 / 本登録APIルート。

## テスト状況

- vitest: 28ファイル / 825テスト / 全PASS
- cucumber-js: 130シナリオ (127 passed, 3 pending) / 0 failed / 0 undefined
  - pending 3件: インフラ制約（HTTP:80直接応答2件 + WAF非ブロック1件）— 意図的Pending
  - ai_accusation.feature: 9/9 PASS（v4: ボーナス廃止反映済み。BOTマーク2シナリオはPhase 3依存で除外）
  - command_system.feature: 15/15 PASS
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
- Sprint-32（次）: マイページUI拡張 + bbs.cgi PAT統合 + BDDステップ定義

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

未決事項（次スプリント以降）:
- !attack の自己攻撃・システムメッセージ攻撃の拒否シナリオがBDDに未記載
- D-07 architecture.md への attacks テーブル追記
- accusation.md のボーナス関連記述の削除
- D-02 ユビキタス言語辞書の更新

## 告発ボーナス廃止

Sprint-31で完了:
- ai_accusation.feature v3→v4 に合わせ10ファイル修正
- calculateBonus削除、AccusationBonusConfig簡素化（costのみ）、ICurrencyService依存削除
- BDDステップ定義2件追加（undefined解消）

## 残課題

- 本登録機能 Sprint-32（マイページUI・bbs.cgi PAT統合・BDDステップ定義）
- Phase 2 後続: bot_system v5 実装（設計完了済み。DBマイグレーション→サービス→ハンドラ→BDDの順）
- デザイン・レイアウト改善（機能優先のため後回し）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
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
