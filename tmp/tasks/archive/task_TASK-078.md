---
task_id: TASK-078
sprint_id: Sprint-27
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T12:00:00+09:00
updated_at: 2026-03-16T12:00:00+09:00
locked_files:
  - "[NEW] src/lib/domain/rules/accusation-rules.ts"
  - "[NEW] src/lib/services/accusation-service.ts"
  - "[NEW] src/lib/services/handlers/tell-handler.ts"
  - "[NEW] src/__tests__/lib/services/accusation-service.test.ts"
  - "[NEW] src/__tests__/lib/domain/rules/accusation-rules.test.ts"
  - "src/lib/services/command-service.ts"
  - "src/lib/services/__tests__/command-service.test.ts"
---

## タスク概要

AccusationService（AI告発サービス）、accusation-rules（告発判定純粋関数）、tell-handler（!tell コマンドハンドラ）を実装する。現在 command-service.ts にある TellHandlerStub を本実装の TellHandler に置き換える。単体テストを作成し全PASS。

## 対象BDDシナリオ
- `features/ai_accusation.feature` — 全10シナリオ（本タスクではBDDステップ定義は作成しない。サービス層の実装と単体テストのみ）
- `features/command_system.feature` — !tell 関連シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/accusation.md` — AccusationService 設計
2. [必須] `docs/architecture/components/command.md` — CommandService + Handler設計
3. [必須] `features/ai_accusation.feature` — 告発シナリオ（振る舞い仕様）
4. [必須] `src/lib/services/command-service.ts` — 現在のTellHandlerStub
5. [参考] `src/lib/domain/models/accusation.ts` — Accusation 型定義（実装済み）
6. [参考] `src/lib/infrastructure/repositories/accusation-repository.ts` — AccusationRepository（実装済み）
7. [参考] `src/lib/infrastructure/repositories/bot-post-repository.ts` — BotPostRepository（isBot判定用、実装済み）
8. [参考] `src/lib/services/currency-service.ts` — CurrencyService（ボーナス付与に使用）

## 出力（生成すべきファイル）

### 1. `src/lib/domain/rules/accusation-rules.ts` — 告発判定純粋関数
以下の判定ロジックを純粋関数として実装する（外部依存なし）:
- 自分自身の書き込みへの告発を拒否する判定
- システムメッセージへの告発を拒否する判定
- ボーナス額の計算（hit時の告発成功ボーナス、miss時の冤罪ボーナス）
- ボーナス額は config/commands.yaml の cost や固定値で定義する。BDDシナリオでは具体的な金額を指定していないため、合理的なデフォルト値を設定すること

### 2. `src/lib/services/accusation-service.ts` — AccusationService
D-08 accusation.md §2 準拠の公開インターフェース:
```typescript
accuse(input: AccusationInput): Promise<AccusationResult>
```
依存先（DI可能にすること）:
- PostRepository（対象レスの取得、userId確認、存在チェック）
- BotPostRepository.findByPostId（isBot判定）
- CurrencyService.credit（ボーナス付与）
- AccusationRepository（重複チェック + 記録INSERT）

判定フロー:
1. 重複チェック → alreadyAccused
2. 対象レス存在チェック → エラー
3. 自分の書き込みチェック → エラー（accusation-rules を使用）
4. システムメッセージチェック → エラー（accusation-rules を使用）
5. isBot判定 → hit or miss
6. ボーナス計算 → accusation-rules を使用
7. ボーナス付与 → CurrencyService.credit
8. DB記録 → AccusationRepository.create
9. システムメッセージ文字列生成 → 返却

**重要**: AccusationResult型はD-08 accusation.md §2に合わせること:
```typescript
AccusationResult {
  result: "hit" | "miss"
  bonusAmount: number
  systemMessage: string
  alreadyAccused: boolean
}
```
※ src/lib/domain/models/accusation.ts にある AccusationResult 型とD-08設計が異なる場合、D-08設計を正とすること。型定義の修正が必要なら修正してよい。

### 3. `src/lib/services/handlers/tell-handler.ts` — TellHandler
CommandHandler インターフェースを実装する。AccusationService.accuse() に委譲する。
- 引数から targetPostId を抽出（args[0] が ">>5" 形式）
- AccusationService に依存（DIで注入）

### 4. `src/lib/services/command-service.ts` — TellHandlerStub置き換え
- TellHandlerStub を削除し、TellHandler を import して使用する
- TellHandler は AccusationService インスタンスを必要とする。CommandService のコンストラクタに AccusationService 依存を追加する

### 5. 単体テスト
- `src/__tests__/lib/domain/rules/accusation-rules.test.ts`
- `src/__tests__/lib/services/accusation-service.test.ts`
  - 各判定パスをテスト（hit/miss/重複/自分自身/システムメッセージ/存在しないレス）

## 完了条件
- [ ] AccusationService の accuse() が全判定パスをカバー
- [ ] TellHandler が CommandHandler インターフェースを実装し、AccusationService に委譲
- [ ] command-service.ts の TellHandlerStub が TellHandler に置き換え済み
- [ ] 単体テスト全件PASS
- [ ] 既存テスト全件PASS（回帰なし）
- [ ] テストコマンド: `npx vitest run`
- [ ] TypeScriptビルド: `npx tsc --noEmit`

## スコープ外
- BDDステップ定義の作成（TASK-079 で実施）
- InMemoryリポジトリの作成（TASK-079 で実施）
- cucumber.js の設定変更（TASK-079 で実施）
- features/ 配下のファイル変更
- BOTマーク表示・攻撃フロー（bot_system.feature は Phase 2 後続）

## 補足・制約
- PostRepository の既存インターフェースを確認し、対象レスの取得に必要な関数がない場合は追加してよい（findByIdなど）
- BotPostRepository は既存の findByPostId を使用する。BotService は未実装のため、直接 BotPostRepository を使ってよい（D-08 では BotService 経由を推奨しているが、BotService 自体が未実装のため、Phase 2 Step 2 では直接アクセスを許容する。Phase 3 で BotService 実装時にリファクタリングする）
- 通貨のcredit関数がCurrencyServiceに存在するか確認すること。存在しない場合は実装する（currency-repository.ts の RPC 関数を使用）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了

### 進捗ログ
- [開始] 必読ドキュメント（accusation.md, command.md, ai_accusation.feature, command-service.ts等）読み込み完了
- AccusationResult型: accusation.ts の既存型はD-08設計と一致。修正不要
- PostRepository: findById が既存実装済み。対象レス取得に使用可能
- [実装完了] accusation-rules.ts, accusation-service.ts, tell-handler.ts, command-service.ts
- [エスカレーション] ESC-TASK-078-1: command-service.test.ts がlocked_files外のため修正不可 → 解決済み
- [テスト修正] command-service.test.ts: CommandServiceコンストラクタ2引数化に対応、createMockAccusationService()追加、stubテストをAccusationService委譲テストに変更
- [テスト作成] accusation-rules.test.ts: 29テスト（checkAccusationAllowed, calculateBonus, buildHitSystemMessage, buildMissSystemMessage, 定数値検証）
- [テスト作成] accusation-service.test.ts: 22テスト（hit/miss/重複/存在しないレス/自分自身/システムメッセージ/処理順序/エッジケース）

### escalation_resolution

ESC-TASK-078-1 解決: 選択肢Aを採用。`src/lib/services/__tests__/command-service.test.ts` を locked_files に追加し、修正を許可する。

### テスト結果サマリー
- `npx vitest run`: 全22ファイル、746テストPASS (0 FAIL)
- `npx tsc --noEmit`: エラーなし
- 新規テスト内訳:
  - accusation-rules.test.ts: 29テストPASS
  - accusation-service.test.ts: 22テストPASS
  - command-service.test.ts: 20テストPASS（既存テスト修正、回帰なし）
