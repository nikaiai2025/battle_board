# Sprint-24 計画書

> 作成日: 2026-03-16

## 目的

Phase 2 実装 Step 1: コマンド基盤の実装。command-parser（純粋関数）、CommandService（レジストリ+ディスパッチ）、PostService統合（inlineSystemInfo生成）を実装し、コマンド実行の骨格を完成させる。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-067 | bdd-coding | command-parser実装 + 単体テスト | なし | completed |
| TASK-068 | bdd-coding | CommandService + Registry + !w handler実装 | TASK-067 | completed |
| TASK-069 | bdd-coding | PostService統合 + 管理者削除コメント + DAT対応 + BDDステップ | TASK-068 | completed |

## 設計メモ

### TASK-067: command-parser
- D-08 command.md §2.3 の解析仕様に準拠
- `src/lib/domain/rules/command-parser.ts` に純粋関数として実装
- 単体テスト: `src/__tests__/lib/domain/rules/command-parser.test.ts`
- 対象BDD: command_system.feature「コマンドが解析され実行される」「存在しないコマンド」「複数コマンド先頭のみ」

### TASK-068: CommandService + Registry
- D-08 command.md §2.1, §2.2 に準拠
- `src/lib/services/command-service.ts` — Registry構築 + executeCommand
- `src/lib/services/handlers/grass-handler.ts` — !w の実装（最もシンプルなので最初に）
- config/commands.yaml の読み込み
- 単体テスト必須
- !tell は AccusationService依存があるため次スプリントで実装

### TASK-069: PostService統合 + 管理者削除コメント
- D-08 posting.md §5 に準拠
- PostService.createPost 内でcommand-parser → CommandService → inlineSystemInfo設定
- 書き込み報酬のinlineSystemInfo表示
- 管理者削除APIにcommentパラメータ追加 + 独立システムレス挿入
- DATフォーマッタでinlineSystemInfoの連結出力
- BDDステップ定義の実装

## 結果

全タスク completed。

### テスト結果
- vitest: 20ファイル / 672テスト / 全PASS（Sprint-23時点601 → +71）
- tsc: エラー0件
- command_system.feature BDD: 15シナリオ / 15 PASS
- 既存BDD失敗: incentive.feature 7件 + mypage.feature 1件（既存問題、本スプリントに起因しない）

### 残課題
- cucumber.js設定にphase2パスを追加する必要あり（次スプリントで対応）
- 既存BDD失敗8件の調査・修正
- !tell ハンドラ本実装（AccusationService連携）
