---
task_id: TASK-265
sprint_id: Sprint-93
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_265
depends_on: []
created_at: 2026-03-22T21:00:00+09:00
updated_at: 2026-03-22T21:00:00+09:00
locked_files:
  - docs/architecture/components/command.md
---

## タスク概要

!iamsystem（ステルスコマンド）の実装に必要な内部設計の詳細化を行う。ステルス除去メカニズムとPostServiceへのフィールド上書きパスを設計し、実装タスク用の設計書を出力する。

## 対象BDDシナリオ

- `features/command_iamsystem.feature` — 全7シナリオ（設計の入力として参照）

## 必読ドキュメント（優先度順）

1. [必須] `features/command_iamsystem.feature` — 振る舞い仕様（7シナリオ）
2. [必須] `docs/architecture/components/command.md` — 現行のコマンド設計（§5にステルス3原則あり）
3. [必須] `src/lib/services/post-service.ts` — PostServiceの処理フロー（Step 1〜Step 9）
4. [必須] `src/lib/services/command-service.ts` — CommandExecutionResult / CommandHandlerResult 現行の型定義
5. [参考] `tmp/orchestrator/practice_commands_implementation_guide.md` — §3「① !iamsystem」セクション
6. [参考] `src/lib/services/handlers/` — 既存ハンドラの実装パターン

## 設計すべき項目

### 1. CommandExecutionResult の拡張

現行の `CommandExecutionResult` にポストフィールド上書き指示を追加する方法を設計する:
- `display_name` を「★システム」に上書き
- `daily_id` を「SYSTEM」に上書き
- 型定義の拡張案を具体的なTypeScriptコードで示す

### 2. PostService ステルス除去パス

PostService の処理フロー（Step 5: コマンド実行 → Step 9: INSERT）の間で、ステルスコマンド成功時に本文からコマンド文字列を除去するコードパスを設計する:
- 除去のタイミング（Step何と何の間か）
- ステルス3原則の実装方法:
  - 成功時: コマンド文字列除去
  - 失敗時: コマンド文字列残留
  - 空本文: そのまま投稿
- フィールド上書き（display_name, daily_id）の適用タイミング

### 3. 既存コードへの影響分析

- command-service.ts の変更要否
- command-parser.ts の変更要否
- 他の既存ハンドラへの影響がないことの確認
- commands.yaml の !iamsystem エントリ定義案

## 出力（生成すべきファイル）

- `tmp/workers/bdd-architect_265/iamsystem_design.md` — 設計書（上記3項目の詳細）
- `docs/architecture/components/command.md` — §5への追記（必要な場合のみ）

## 完了条件

- [ ] CommandExecutionResult 拡張の型定義案が具体的コードで示されている
- [ ] PostService ステルス除去パスの処理フロー・タイミングが明確に定義されている
- [ ] 既存コードへの影響分析が完了している
- [ ] 設計書がコーディングAIへの入力として十分な詳細度を持つ

## スコープ外

- 実装コードの作成（設計のみ）
- !aori の非同期キュー設計（BOT関連は保留）
- !newspaper のAI API設計（BOT関連は保留）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全項目
- 次にすべきこと: なし（設計完了。実装タスクへ移行可能）
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-22 設計完了

**読み込んだドキュメント:**
- `features/command_iamsystem.feature` -- 全7シナリオ
- `docs/architecture/components/command.md` -- 5 ステルス設計原則
- `src/lib/services/post-service.ts` -- Step 0 - Step 11.5 の処理フロー
- `src/lib/services/command-service.ts` -- CommandExecutionResult / CommandHandlerResult / CommandConfig 型定義、executeCommand フロー
- `src/lib/domain/rules/command-parser.ts` -- ParsedCommand.raw フィールドの確認
- `src/lib/domain/models/post.ts` -- Post 型（displayName, dailyId フィールド）
- `src/lib/infrastructure/repositories/post-repository.ts` -- create 関数のシグネチャ
- `config/commands.yaml` / `config/commands.ts` -- 既存エントリ確認
- `src/lib/services/handlers/abeshinzo-handler.ts` -- 最も単純なハンドラの参照パターン
- `tmp/orchestrator/practice_commands_implementation_guide.md` -- 3 iamsystem セクション

**出力ファイル:**
- `tmp/workers/bdd-architect_265/iamsystem_design.md` -- 詳細設計書（6セクション）
- `docs/architecture/components/command.md` -- 5「ステルスの実装メカニズム」追記

**完了条件の充足:**
- [x] CommandExecutionResult 拡張: PostFieldOverrides 型 + isStealth + rawCommand の3フィールド追加。TypeScript コードで提示
- [x] PostService ステルス除去パス: Step 5.5 として定義。除去タイミング・3原則の実装方法・フィールド上書きの適用タイミングを明記
- [x] 既存コードへの影響分析: 変更必要ファイル5件 / 変更不要ファイル6件を根拠付きで列挙
- [x] 設計書がコーディングAIへの入力として十分な詳細度を持つ（型定義・擬似コード・BDDシナリオ対応表を含む）
