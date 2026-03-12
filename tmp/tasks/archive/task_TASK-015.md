---
task_id: TASK-015
sprint_id: Sprint-8
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-015
depends_on: []
created_at: 2026-03-09T22:00:00+09:00
updated_at: 2026-03-09T22:00:00+09:00
locked_files: []
---

## タスク概要

Step 1〜7に対応するBDDステップ定義を実装するにあたり、テスト戦略・インフラ構成を設計する。
テストレベル（APIレベル vs サービスレベル）、外部依存（Supabase）のモック/スタブ戦略、
Cucumber World・Hooks・共通ステップ定義の構成を決定し、設計書を出力する。

## 対象BDDシナリオ

- `features/phase1/authentication.feature` — Step 4対応分（管理者シナリオ除く8件）
- `features/phase1/posting.feature` — 全4件
- `features/phase1/thread.feature` — 全11件
- `features/phase1/currency.feature` — Step 5対応分（マイページシナリオ除く3件）
- `features/phase1/incentive.feature` — 全30件

## 必読ドキュメント（優先度順）

1. [必須] `features/phase1/*.feature` — 対象シナリオ全文（ステップの文言を正確に把握）
2. [必須] `cucumber.js` — 既存のCucumber設定
3. [必須] `src/lib/services/` — 既存サービス層の実装（テスト対象の理解）
4. [必須] `src/app/api/` — 既存APIルートの実装
5. [必須] `src/lib/infrastructure/repositories/` — リポジトリ層（DB依存部分）
6. [必須] `docs/architecture/architecture.md` — アーキテクチャ設計（テスト方針との整合）
7. [参考] `src/lib/services/__tests__/` — 既存vitest単体テスト（モック手法の参考）
8. [参考] `vitest.config.ts` — 既存テスト設定

## 入力（前工程の成果物）

- 既存の実装コード（Step 1〜7完了済み）
- 既存のvitestテスト（330件PASS）

## 出力（生成すべきファイル）

- `tmp/workers/bdd-architect_TASK-015/bdd_test_strategy.md` — BDDテスト戦略書

以下の項目を含むこと:

### 1. テストレベルの決定
- APIレベル（HTTPリクエスト）vs サービスレベル（関数直接呼び出し）vs ハイブリッド
- 各featureに最適なテストレベルの推奨

### 2. 外部依存のモック戦略
- Supabase: 実DB接続 vs モック/スタブ
- Turnstile: モック方法
- その他外部サービス

### 3. Cucumber World設計
- Worldクラスの構成
- テスト間の状態管理
- セットアップ/ティアダウン

### 4. ディレクトリ構成
- `features/support/` の配置
- `features/step_definitions/` のファイル分割方針
- 共通ステップ vs feature固有ステップの分離基準

### 5. 共通ステップ一覧
- 複数featureで共有されるステップの洗い出し
- 各ステップの実装方針（API呼び出し / サービス呼び出し / DB直接操作）

### 6. feature別実装ガイドライン
- 各featureのステップ定義で注意すべき点
- スコープ外シナリオ（admin, mypage）の @skip タグ戦略

### 7. 実装サンプル
- World クラスの実装例
- Before/After Hooks の実装例
- 代表的なステップ定義の実装例（1〜2シナリオ分）

## 完了条件

- [ ] 上記7項目を網羅した設計書が出力されている
- [ ] 既存の実装コードとの整合性が確認されている
- [ ] 後続タスク（TASK-016〜018）が設計書に基づいて自律的に作業可能な詳細度

## スコープ外

- ステップ定義の実装自体（TASK-016〜018で実施）
- admin.feature / mypage.feature のステップ定義設計
- PlaywrightなどのブラウザE2Eテスト

## 補足・制約

- cucumber.jsの設定: `requireModule: ['ts-node/register']` を使用中。ESM対応の要否を検討すること
- 既存テスト（vitest）との共存を前提とする。vitestの設定やモック方式に干渉しないこと
- BDDテストはCI環境での実行を前提とする（ローカルSupabase不要が望ましい）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: BDDテスト戦略書の作成
- 次にすべきこと: TASK-016〜018 が本設計書に基づいて実装を開始
- 未解決の問題: なし

### 進捗ログ
- 2026-03-09T23:00+09:00: タスク開始。必読ドキュメントの読み込み完了
- 2026-03-09T23:10+09:00: 全5つのfeatureファイル（56シナリオ）を精査。スコープ内シナリオを特定（管理者2件+マイページ1件=3件を除外し、53件が対象）
- 2026-03-09T23:20+09:00: 実装コード精査完了（サービス層4ファイル、APIルート4ファイル、リポジトリ9ファイル、ドメインモデル5ファイル、ドメインルール1ファイル）
- 2026-03-09T23:30+09:00: 既存vitestテスト4ファイルのモック手法を分析。vi.mock()によるモジュールモックパターンを把握
- 2026-03-09T23:40+09:00: テストレベル決定（サービスレベル）、モック戦略決定（インメモリストア+モジュール差し替え）
- 2026-03-09T23:50+09:00: BDDテスト戦略書を `tmp/workers/bdd-architect_TASK-015/bdd_test_strategy.md` に出力完了
- 設計書の7項目すべてを網羅:
  1. テストレベルの決定（サービスレベル採用）
  2. 外部依存のモック戦略（全リポジトリ+Turnstileのインメモリモック）
  3. Cucumber World設計（BattleBoardWorldクラス、ストアブリッジパターン）
  4. ディレクトリ構成（support/, step_definitions/, mocks/）
  5. 共通ステップ一覧（7ステップ）
  6. feature別実装ガイドライン（5feature分の注意点）
  7. 実装サンプル（World, Hooks, モックインストーラー, ステップ定義2シナリオ分）

### テスト結果サマリー
<!-- 設計タスクのためN/A -->
