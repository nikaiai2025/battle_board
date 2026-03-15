---
task_id: TASK-068
sprint_id: Sprint-24
status: completed
assigned_to: bdd-coding
depends_on: [TASK-067]
created_at: 2026-03-16T14:00:00+09:00
updated_at: 2026-03-16T14:00:00+09:00
locked_files:
  - "[NEW] src/lib/services/command-service.ts"
  - "[NEW] src/lib/services/handlers/grass-handler.ts"
  - "[NEW] src/__tests__/lib/services/command-service.test.ts"
---

## タスク概要

CommandService（コマンドレジストリ + ディスパッチ）と !w（草）ハンドラを実装する。config/commands.yamlからコマンド設定を読み込み、CommandHandlerRegistryを構築し、executeCommand でコマンドを実行する基盤を完成させる。

## 対象BDDシナリオ
- `features/phase2/command_system.feature`
  - 「無料コマンドは通貨消費なしで実行できる」（!w）
  - 「コマンド実行に通貨コストが必要な場合は通貨が消費される」（コスト引き落とし基盤）
  - 「通貨不足でコマンドが実行できない場合はエラーになる」（残高不足チェック）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/command.md` — §2.1 主要操作、§2.2 2層構造
2. [必須] `features/phase2/command_system.feature` — BDDシナリオ
3. [必須] `src/lib/domain/models/command.ts` — Command, ParsedCommand型
4. [必須] `src/lib/domain/rules/command-parser.ts` — TASK-067で実装済みのパーサー
5. [必須] `config/commands.yaml` — コマンド設定
6. [必須] `src/lib/services/currency-service.ts` — 通貨操作の既存API
7. [参考] `docs/architecture/components/posting.md` — PostServiceとの連携方式

## 出力（生成すべきファイル）
- `src/lib/services/command-service.ts` — CommandService実装
- `src/lib/services/handlers/grass-handler.ts` — !w ハンドラ
- `src/__tests__/lib/services/command-service.test.ts` — 単体テスト

## 完了条件
- [x] CommandServiceが以下を実装:
  - config/commands.yaml の読み込みとRegistry構築
  - executeCommand(input) → CommandExecutionResult
  - コマンド実行前の通貨残高チェック（不足時はエラー結果を返す）
  - コマンド実行時の通貨消費（CurrencyService連携）
- [x] CommandHandlerインターフェースが定義され、RegistryにHandler登録可能
- [x] GrassHandler (!w) が実装され、正常動作
  - !w は対象レスに「草を生やす」コマンド。MVP では systemMessage を返すだけでよい（具体的な草カウント機能は後続で拡張）
- [x] 単体テストで以下をカバー:
  - 正常なコマンド実行（!w）→ 成功結果
  - 通貨不足 → エラー結果（通貨未消費）
  - 無料コマンド（cost=0）→ 残高0でも実行可能
  - 未登録コマンド → null結果（パーサーがnullを返すためServiceには到達しない想定だが防御的に）
- [x] `npx vitest run` 全テストPASS
- [x] `npx tsc --noEmit` エラー0件

## スコープ外
- !tell ハンドラの実装（AccusationService依存があるため次タスク）
- PostServiceとの統合（TASK-069）
- BDDステップ定義の実装（TASK-069）
- DBマイグレーション

## 補足・制約

- CommandServiceはCurrencyServiceをDI（コンストラクタ注入）で受け取る
- CommandHandlerインターフェース:
  ```typescript
  interface CommandHandler {
    commandName: string;
    execute(ctx: CommandContext): Promise<CommandHandlerResult>;
  }
  ```
- !tell 用のハンドラは stub/placeholder として登録し、実行時は「未実装」エラーを返す形でもよい（Registryの整合性を保つため）
- D-08 command.md §5: 「通貨引き落とし → コマンド実行の順」

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [2026-03-16] 必読ドキュメント確認完了（command.md, command_system.feature, commands.yaml, command.ts, command-parser.ts, currency-service.ts）
- [2026-03-16] `src/lib/services/handlers/grass-handler.ts` 作成（GrassHandler実装）
- [2026-03-16] `src/lib/services/command-service.ts` 作成（CommandService + TellHandlerStub実装）
- [2026-03-16] `src/lib/services/__tests__/command-service.test.ts` 作成（20件テスト）
- [2026-03-16] テスト1件失敗（!tell stub success=false の currencyCost 期待値誤り）→ D-08 §5 に基づき実装修正（deduct後の消費額は success に関わらず返す）
- [2026-03-16] `npx vitest run` 全655件PASS（新規20件含む）
- [2026-03-16] `npx tsc --noEmit` エラー0件

### テスト結果サマリー

- 新規テスト: 20件 PASS
- 全体: 655件 PASS / 0件 FAIL
- テストファイル: `src/lib/services/__tests__/command-service.test.ts`
- TypeScript型チェック: エラー0件
