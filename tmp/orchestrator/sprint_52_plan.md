# Sprint-52 計画書

> 作成日: 2026-03-18
> ステータス: completed

## 目的

本番環境でコマンドシステム（!tell, !w, !attack）が動作しないバグの修正。
CommandService の DI 初期化が本番ルートに存在せず、コマンド解析・実行が完全にスキップされている。

## インシデント概要

- **症状**: 本番で `!w`, `!tell` 等を含む書き込みを行ってもシステムメッセージが表示されない
- **直接原因**: `post-service.ts` の `commandServiceInstance` が `null` のまま（setCommandService未呼出）
- **根本原因**: setter DI パターンでテスト側のみ初期化。本番ルートに初期化コードが欠落
- **発見契機**: 人間の手動確認（偶然の発見）

## タスク一覧

| TASK_ID | 内容 | 担当 | depends_on | locked_files |
|---|---|---|---|---|
| TASK-147 | fs互換性調査 + CommandService初期化方針設計 | bdd-architect | - | なし（調査のみ） |
| TASK-148 | CommandService lazy初期化実装 + 単体テスト | bdd-coding | TASK-147 | post-service.ts, command-service.ts, 関連テスト |
| TASK-149 | コマンド実行 APIテスト追加（DI配線検証） | bdd-coding | TASK-148 | テストファイル（新規） |
| (orchestrator) | インシデント報告書 + lessons_learned追記 | orchestrator | 全タスク完了後 | docs/operations/incidents/, docs/architecture/lessons_learned.md |

## 調査ポイント（TASK-147で解決）

- Cloudflare Workers（nodejs_compat有効）で `fs.readFileSync` が動作するか
- @opennextjs/cloudflare のバンドルプロセスが `fs.readFileSync` をどう処理するか
- lazy初期化の具体的な実装パターン（fs非対応の場合の代替案含む）

## 結果

### TASK-147 (completed)
- fs.readFileSync は Cloudflare Workers (workerd) で**動作しない**（@opennextjs/cloudflare自身が明言）
- 推奨方針: 方針A+B ハイブリッド（YAML→TS定数化 + lazy初期化）
- 同パターンが bot-service.ts, fixed-message.ts にも存在（横展開要）
- 成果物: `tmp/workers/bdd-architect_TASK-147/analysis.md`

### TASK-148 (completed)
- config/commands.ts 新規作成（YAML の TS 定数化）
- command-service.ts から fs/path/yaml 依存を排除、コンストラクタ引数変更
- post-service.ts に getCommandService() lazy 初期化導入
- command-service.test.ts の fs モック廃止、commandsYamlOverride 使用に移行
- テスト: vitest 47ファイル/1191テスト全PASS、cucumber-js 234シナリオ(227 passed, 7 pending)

### TASK-149 (延期 → 次スプリント)
- APIテスト追加（コマンド実行DI配線検証）は再発防止策として次スプリントで実施予定
- バグ修正のデプロイを優先

### インシデント報告書 (completed)
- `docs/operations/incidents/2026-03-18_command_service_not_initialized.md`
- `docs/architecture/lessons_learned.md` LL-004 追記
