---
task_id: TASK-264
sprint_id: Sprint-93
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T21:00:00+09:00
updated_at: 2026-03-22T21:00:00+09:00
locked_files:
  - config/commands.yaml
  - "[NEW] src/lib/services/handlers/omikuji-handler.ts"
  - "[NEW] features/step_definitions/command_omikuji.steps.ts"
  - "[NEW] src/__tests__/lib/services/handlers/omikuji-handler.test.ts"
---

## タスク概要

!omikuji コマンドを実装する。ターゲット任意パターン（>>N の有無でメッセージが変わる）の初実装。結果は「★システム」名義の独立レスで即座に表示される。新規インフラ不要で、既存の仕組み（`independentMessage` + `CommandHandlerResult`）だけで完結する。

## 対象BDDシナリオ

- `features/command_omikuji.feature` — 全4シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `features/command_omikuji.feature` — 対象シナリオ（4シナリオ）
2. [必須] `docs/architecture/components/command.md` — コマンド設計（§5 ターゲット任意パターン）
3. [参考] `src/lib/services/handlers/tell-handler.ts` — 既存ハンドラの実装パターン参考
4. [参考] `src/lib/services/handlers/kinou-handler.ts` — independentMessage使用の参考
5. [参考] `config/commands.yaml` — 既存コマンド定義のフォーマット確認
6. [参考] `features/step_definitions/command_system.steps.ts` — 既存のコマンドBDDステップ
7. [参考] `tmp/orchestrator/practice_commands_implementation_guide.md` — §3「② !omikuji」セクション

## 出力（生成すべきファイル）

- `src/lib/services/handlers/omikuji-handler.ts` — ハンドラ実装
- `config/commands.yaml` への !omikuji エントリ追加
- `features/step_definitions/command_omikuji.steps.ts` — BDDステップ定義
- `src/__tests__/lib/services/handlers/omikuji-handler.test.ts` — 単体テスト
- おみくじ結果セット（100件）— 配置場所はハンドラ内定数 or config で判断

## 完了条件

- [ ] `features/command_omikuji.feature` 全4シナリオPASS
- [ ] 単体テスト全件PASS
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx cucumber-js --tags @omikuji` or 該当シナリオがPASS

## スコープ外

- ステルス機能（!iamsystemで別途実装）
- 非同期キュー（!aoriで別途実装）
- post-service.ts の修正（TASK-263の領域）

## 補足・制約

- コスト0、同期処理、非同期キュー不使用
- `targetFormat: null`（ターゲット任意）。パーサー変更不要
- ハンドラ内で `ctx.args` の有無を見て分岐するだけ
- おみくじ結果100件は feature のヘッダコメントにある方向性（2ch的ユーモア）で作成

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全実装・全テストPASS
- 未解決の問題: なし

### 進捗ログ
- [開始] featureファイル・設計書・既存コード読み込み完了
- [方針確定] OmikujiHandler: 引数(ctx.args)の有無で分岐する独立メッセージパターン。依存サービスなし（ランダム選択のみ）
- [方針確定] おみくじ結果100件はハンドラ内定数として定義する
- [実装完了] src/lib/services/handlers/omikuji-handler.ts: OMIKUJI_RESULTS 100件 + OmikujiHandler
- [実装完了] config/commands.yaml + config/commands.ts: omikuji エントリ追加
- [実装完了] src/lib/services/command-service.ts: OmikujiHandler 登録
- [実装完了] cucumber.js: command_omikuji.feature + steps を paths/require に追加
- [実装完了] features/step_definitions/command_omikuji.steps.ts: 固有ステップ5件
- [バグ修正] features/step_definitions/command_system.steps.ts: 「書き込み本文は {string} がそのまま表示される」が独立レス生成後に誤検証する問題を修正（非システムメッセージの最後のレスを対象に変更）
- [実装完了] src/__tests__/lib/services/handlers/omikuji-handler.test.ts: 単体テスト13件
- [実装完了] e2e/flows/basic-flow.spec.ts: !omikuji E2Eテストケース追加

### テスト結果サマリー
- 単体テスト: 1668 passed (81 files) - 全PASS
- BDDシナリオ: 278 passed (16 pending / 既存未実装のpending) - command_omikuji.feature 全4シナリオPASS
- E2Eテスト: basic-flow.spec.ts に !omikuji テスト追加（未実行 - Playwright環境が必要）
