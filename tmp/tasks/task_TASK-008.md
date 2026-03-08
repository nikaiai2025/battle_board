---
task_id: TASK-008
sprint_id: Sprint-5
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-09T10:00:00+09:00
updated_at: 2026-03-09T10:00:00+09:00
locked_files:
  - "[NEW] src/lib/services/currency-service.ts"
  - "[NEW] src/lib/services/__tests__/currency-service.test.ts"
  - "src/lib/services/auth-service.ts"
  - "src/lib/services/__tests__/auth-service.test.ts"
---

## タスク概要
CurrencyServiceを実装する。CurrencyRepositoryをラップし、通貨の加算(credit)・減算(deduct)・残高取得(getBalance)・初期化(initializeBalance)の4操作を提供する薄いサービス層。
また、AuthService.issueEdgeTokenに初期通貨付与（50コイン）を統合する（currency.feature「新規ユーザー登録時に初期通貨 50 が付与される」の実現）。

## 対象BDDシナリオ
- `features/phase1/currency.feature` — 全5シナリオ（特に「新規ユーザー登録時に初期通貨 50 が付与される」「通貨残高がマイナスになる操作は実行されない」「同時操作による通貨の二重消費が発生しない」）
- NOTE: BDDステップ定義は本タスクのスコープ外。サービス層の実装に集中する

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/currency.md` — CurrencyServiceの公開インターフェース・設計判断
2. [必須] `src/lib/infrastructure/repositories/currency-repository.ts` — 既存リポジトリ（credit/deduct/getBalance/create/findByUserId）
3. [必須] `src/lib/domain/models/currency.ts` — Currency型, DeductResult型, DeductReason/CreditReason型
4. [必須] `src/lib/services/auth-service.ts` — issueEdgeTokenに初期通貨付与を追加
5. [参考] `features/phase1/currency.feature` — 通貨BDDシナリオ

## 入力（前工程の成果物）
- `src/lib/infrastructure/repositories/currency-repository.ts` — CurrencyRepository（Sprint-3）
- `src/lib/domain/models/currency.ts` — Currency型定義（Sprint-2）
- `src/lib/services/auth-service.ts` — AuthService（Sprint-4）

## 出力（生成すべきファイル）

### `src/lib/services/currency-service.ts`
通貨操作の統括サービス。currency.md §2 の公開インターフェースに準拠。

- `credit(userId: string, amount: number, reason: CreditReason): Promise<void>` — 残高加算。CurrencyRepository.creditに委譲
- `deduct(userId: string, amount: number, reason: DeductReason): Promise<DeductResult>` — 残高減算。CurrencyRepository.deductに委譲。残高不足時はDeductResult.success=falseを返す
- `getBalance(userId: string): Promise<number>` — 残高取得。CurrencyRepository.getBalanceに委譲
- `initializeBalance(userId: string): Promise<void>` — 新規ユーザーの通貨レコード作成+初期通貨50付与。CurrencyRepository.create(userId, 50)

### `src/lib/services/__tests__/currency-service.test.ts`
CurrencyServiceの単体テスト（モック使用）。

### `src/lib/services/auth-service.ts`（既存ファイル修正）
issueEdgeToken関数にCurrencyService.initializeBalance呼び出しを追加。

## 完了条件
- [ ] CurrencyServiceが4操作（credit/deduct/getBalance/initializeBalance）を提供している
- [ ] 初期通貨付与額が50に設定されている（定数として定義）
- [ ] AuthService.issueEdgeToken内でCurrencyService.initializeBalanceが呼ばれている
- [ ] DeductResultを使い、残高不足時に例外ではなく失敗型を返している
- [ ] CurrencyServiceの単体テストが作成されている
- [ ] テストコマンド: `npx vitest run` で全テストPASS

## スコープ外
- BDDステップ定義の実装
- IncentiveServiceとの統合（Step 6で実装）
- マイページUIでの残高表示（Step 7で実装）
- incentive_logテーブルへの記録（IncentiveService担当）

## 補足・制約
- 初期通貨付与額50は定数`INITIAL_BALANCE = 50`として定義すること
- CurrencyServiceは薄いラッパー。ビジネスロジックの大部分はCurrencyRepository（楽観的ロック）が担当済み
- auth-service.tsへの変更は最小限（issueEdgeToken内に1行追加程度）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed（完了）
- 完了済み:
  - 必読ドキュメント読み込み完了
  - `src/lib/services/currency-service.ts` 実装完了（4操作: credit/deduct/getBalance/initializeBalance）
  - `src/lib/services/__tests__/currency-service.test.ts` 作成完了（39テスト全PASS）
  - `src/lib/services/auth-service.ts` 修正完了（issueEdgeToken内にinitializeBalance呼び出し追加）
  - `src/lib/services/__tests__/auth-service.test.ts` 修正完了（currency-serviceモック追加、45テスト全PASS）
  - 全テスト248件 PASS（6テストファイル）

### 進捗ログ
- [開始] 必読ドキュメント（currency.md, currency-repository.ts, currency.ts, auth-service.ts, currency.feature）を読み込み完了
- [実装] currency-service.test.ts 作成（RED確認済み）
- [実装] currency-service.ts 実装完了（GREEN: 39テスト全PASS）
- [実装] auth-service.ts 修正（issueEdgeToken に initializeBalance 呼び出し追加）
- [問題発覚] auth-service.test.ts の issueEdgeToken テスト4件失敗（currency-serviceモックが存在しないため）
- [エスカレーション] ESC-TASK-008-1 を起票し、locked_files外ファイルの変更許可を要請

### テスト結果サマリー（最終）
- currency-service.test.ts: 39/39 PASS
- auth-service.test.ts: 45/45 PASS（エスカレーション解決後: currency-serviceモック追加 + initializeBalance呼び出し検証テスト追加）
- 全テストファイル合計: 248/248 PASS（6ファイル）
  - validation.test.ts: 55件 PASS
  - anchor-parser.test.ts: 33件 PASS
  - daily-id.test.ts: 14件 PASS
  - incentive-rules.test.ts: 62件 PASS
  - currency-service.test.ts: 39件 PASS
  - auth-service.test.ts: 45件 PASS

### escalation_resolution (ESC-TASK-008-1)
- **解決方針**: 選択肢A採用 — `auth-service.test.ts` にcurrency-serviceのモックを追加する
- **判断根拠**: テストファイルのみの変更であり、BDDシナリオ変更なし・公開API変更なし・横断的制約への影響なし。オーケストレーターAIが自律判断で承認
- **具体的な対応**: `auth-service.test.ts` に `vi.mock` でcurrency-serviceをモック追加。issueEdgeTokenテストに `initializeBalance` 呼び出しの検証アサーションも追加
- **locked_files更新**: `src/lib/services/__tests__/auth-service.test.ts` を追加済み
