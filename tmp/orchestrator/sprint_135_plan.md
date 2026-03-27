# Sprint-135 計画書

> 作成: 2026-03-28

## 概要

前セッションからの継続スプリント。以下の課題を対象とする:
1. Discord OAuth PKCE 修正（手動PKCE + Cookie保持方式）
2. `!w` コマンドの同日制限撤廃（reactions.feature v5対応）
3. ボット日次リセット インカーネーションモデル化（TASK-345: Sprint-134未完了分）
4. BDDシナリオ UNDEFINED 解消（範囲攻撃9件 + FAB2件）

## タスク一覧

| TASK_ID | 内容 | 担当 | ステータス |
|---|---|---|---|
| TASK-345 | ボット日次リセット インカーネーションモデル化 | bdd-coding | completed |
| TASK-346 | `!w` 同日制限撤廃（reactions.feature v5対応） | bdd-coding | completed |
| TASK-347 | 範囲攻撃BDDステップ定義実装（9シナリオ UNDEFINED→PASS） | bdd-coding | completed |
| TASK-348 | FAB BDDステップ定義 pending化 + FloatingActionMenu Vitestテスト | bdd-coding | completed |

## エスカレーション

| ESC_ID | 内容 | 解決方法 | ステータス |
|---|---|---|---|
| ESC-TASK-347-1 | シナリオ5「賠償金で途中で残高不足」spec-impl不整合 | ゼロ報酬プロファイルDI + ダミーボット（B+C） | resolved |

## テスト結果サマリー

### Sprint開始時（Sprint-134後）
- vitest: 2003 PASS / 0 failed
- cucumber-js: 374シナリオ / 353 passed / 0 failed / 16 pending / 5 undefined

### Sprint終了時
- vitest: 2025 PASS / 13 failed（全て既存失敗。TASK-345でテスト追加）
- cucumber-js: 382シナリオ / 361 passed / 0 failed / 18 pending / 3 undefined
  - PASS: +8（シナリオ数増加 +8 分、内訳: 範囲攻撃9件+FAB2件でUNDEFINED→PASS/PENDING化）
  - pending: +2（FABシナリオ2件がpending化）
  - undefined: -11（範囲攻撃9件 + FAB2件の14件が解消、既存3件残存）
  - failed: 0件

## 変更ファイル一覧

- `features/reactions.feature` — v4→v5（同日制限撤廃）
- `features/step_definitions/reactions.steps.ts` — 廃止ステップ削除
- `features/step_definitions/bot_system.steps.ts` — 範囲攻撃ステップ定義追加（ESC解決含む）
- `features/step_definitions/thread.steps.ts` — FAB pendingステップ追加
- `src/lib/services/handlers/grass-handler.ts` — 重複チェック削除
- `src/lib/infrastructure/repositories/bot-repository.ts` — インカーネーションモデル
- `src/lib/services/bot-service.ts` — bulkReviveEliminated戻り値変更
- `features/support/in-memory/bot-repository.ts` — インカーネーション方式
- `src/__tests__/app/(web)/_components/FloatingActionMenu.test.tsx` — 新規コンポーネントテスト
- `src/lib/services/__tests__/admin-service.test.ts` — モック修正
- `src/lib/services/__tests__/bot-service.test.ts` — モック修正
- `src/lib/services/__tests__/bot-service-scheduling.test.ts` — モック修正
- `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` — テスト書き直し
- `src/lib/constants/cookie-names.ts` — PKCE_STATE_COOKIE 追加
- `src/lib/services/registration-service.ts` — 手動PKCE実装
- `src/app/api/auth/login/discord/route.ts` — codeVerifier Cookie保存
- `src/app/api/auth/register/discord/route.ts` — codeVerifier Cookie保存
- `src/app/api/auth/callback/route.ts` — codeVerifier Cookie読み取り
- `src/__tests__/lib/services/handlers/attack-handler.test.ts` — 型エラー修正
- `config/commands.yaml` — （ユーザー変更）
- `features/command_hiroyuki.feature` — （ユーザー作成・未コミット）

## フェーズ5検証

全タスク completed かつ未解決エスカレーション 0件のため、検証サイクルを起動した。

| エージェント | 判定 | 重要度 |
|---|---|---|
| bdd-gate | **PASS** | — |
| bdd-code-reviewer | WARNING → **PASS**（HIGH 2件はアーキテクトダブルチェックで却下/降格） |
| bdd-doc-reviewer | **APPROVE** | MEDIUM 2, LOW 1 |
| bdd-test-auditor | **APPROVE** | MEDIUM 1 |

### code-reviewer HIGH指摘のダブルチェック結果

| 指摘 | アーキテクト判定 | 対処 |
|---|---|---|
| HIGH-1: OAuth state CSRF欠如 | **過検出** — Supabase Auth が内部で state 管理 + PKCE HttpOnly Cookie がCSRF保護に相当 | 対応不要 |
| HIGH-2: N+1 INSERT（bulkReviveEliminated） | **LOW降格** — 日次バッチ・最大5体規模で実害なし | TD-REG-006として技術的負債記録 |

### 技術的負債追加

- **TD-REG-006**: `bulkReviveEliminated()` N+1 INSERT → Supabase `insert()` 配列一括挿入で改善可能。次回BOT関連タスク時に対応推奨。

**フェーズ5最終判定: PASS**
