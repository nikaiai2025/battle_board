# Sprint-76 計画書

> 作成日: 2026-03-20
> ステータス: in_progress

## 目的

調査系コマンド（!hissi / !kinou）を実装する。features/investigation.featureの11シナリオを全てPASSにする。

## 背景

- features/investigation.feature が人間により作成済み（11シナリオ）
- 設計ドキュメント（command.md responseType、posting.md 方式A/B修正）更新済み
- TASK-208でアーキテクト設計完了。実装計画書 `tmp/workers/bdd-architect_TASK-208/implementation_plan.md`

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | depends_on | locked_files |
|---|---|---|---|---|---|
| TASK-208 | 実装計画策定 | bdd-architect | completed | - | - |
| TASK-209 | 基盤拡張 + ハンドラ実装 | bdd-coding | completed | TASK-208 | command-service.ts, post-service.ts, post-repository.ts, handlers/*.ts, config/* |
| TASK-210 | BDDステップ定義 + インメモリ実装 | bdd-coding | completed | TASK-209 | investigation.steps.ts, in-memory/post-repository.ts, cucumber.js |

## 依存関係

TASK-209 → TASK-210（直列）
- TASK-209がハンドラ・リポジトリ関数を作成
- TASK-210がBDDステップ定義で11シナリオをPASSにする

## 結果

### TASK-208: 実装計画策定（bdd-architect）— completed
- 実装計画書 `tmp/workers/bdd-architect_TASK-208/implementation_plan.md` を作成
- 2タスク分解（基盤+ハンドラ / BDD+インメモリ）、設計判断4件

### TASK-209: 基盤拡張 + ハンドラ実装（bdd-coding）— completed
- CommandConfig.responseType、CommandHandlerResult.independentMessage 型追加
- PostService Step 9b 独立レス投稿汎用化
- PostRepository.findByAuthorIdAndDate 新設
- HissiHandler / KinouHandler 新規作成
- config/commands.yaml,ts に hissi, kinou エントリ追加
- 単体テスト35件追加（計1481件PASS）、BDD既存256シナリオ回帰なし

### TASK-210: BDDステップ定義 + インメモリ実装（bdd-coding）— completed
- investigation.steps.ts 新規作成（全11シナリオカバー）
- in-memory/post-repository.ts に findByAuthorIdAndDate 追加
- cucumber.js に investigation.feature / investigation.steps.ts 登録（ESC-TASK-210-1 経由）
- BDD: 267シナリオ（251 passed, 16 pending）— investigation.feature 11シナリオ全PASS
- 単体テスト: 1481件全PASS、tsc: エラー0件

### スプリント総括
- investigation.feature 11シナリオ全PASS（!hissi 5件 + !kinou 4件 + エラー系 2件）
- 新規テスト: 単体35件 + BDD 11件 = 46件追加
- エスカレーション1件（ESC-TASK-210-1: cucumber.js locked_files追加）→ 自律解決
