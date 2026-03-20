---
task_id: TASK-148
sprint_id: Sprint-52
status: completed
assigned_to: bdd-coding
depends_on: [TASK-147]
created_at: 2026-03-18T13:00:00+09:00
updated_at: 2026-03-18T13:00:00+09:00
locked_files:
  - "[NEW] config/commands.ts"
  - src/lib/services/command-service.ts
  - src/lib/services/post-service.ts
  - src/lib/services/__tests__/command-service.test.ts
---

## タスク概要

本番環境で CommandService が初期化されずコマンドシステム（!tell, !w, !attack）が動作しないバグを修正する。
`fs.readFileSync` はCloudflare Workers上で動作しないため、YAML→TS定数化 + PostService lazy初期化の2段階で修正する。

## 設計方針（TASK-147 アーキテクト成果物に基づく）

`tmp/workers/bdd-architect_TASK-147/analysis.md` §4 の推奨方針に従う。以下の3ステップで実装する:

### Step 1: config/commands.ts 新規作成

`config/commands.yaml` の内容を TypeScript 定数としてエクスポートするファイルを作成する。
- `config/commands.yaml` は正本として残す（削除しない）
- 型定義は `command-service.ts` から export する `CommandsYaml` を使用する
- ファイル先頭コメントで YAML との同期を保つべき旨を記載する

### Step 2: CommandService コンストラクタの fs 依存排除

- `fs.readFileSync` / `path.resolve` / `yaml` パッケージの import を削除する
- コンストラクタの第3引数を `commandsYamlPath?: string` → `commandsYamlOverride?: CommandsYaml` に変更する
- デフォルト値として `config/commands.ts` からインポートした定数を使用する
- `CommandsYaml` 型と `CommandConfig` 型を export する（config/commands.ts から参照するため）

### Step 3: PostService lazy初期化導入

- `getCommandService()` 関数を導入し、初回呼び出し時に CommandService を自動生成する
- `setCommandService()` は既存のまま維持（テスト用DI）。呼ばれた場合は lazy初期化をバイパスする
- `createPost()` 内の `commandServiceInstance` 参照を `getCommandService()` 経由に変更する
- lazy初期化時の依存解決:
  - `CurrencyService`: `import * as CurrencyService from "./currency-service"` を使用
  - `PostRepository`: `import * as PostRepository from "../infrastructure/repositories/post-repository"` を使用（postNumberResolver用）
  - `accusationService`, `attackHandler`, `grassHandler`: デフォルト値（undefined → CommandService内部で生成）

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_TASK-147/analysis.md` — 設計方針の詳細（§4.2の擬似コードを参照）
2. [必須] `src/lib/services/command-service.ts` — 変更対象（コンストラクタ）
3. [必須] `src/lib/services/post-service.ts` — 変更対象（lazy初期化）
4. [必須] `config/commands.yaml` — TS定数化の元データ
5. [参考] `src/lib/services/__tests__/command-service.test.ts` — テスト修正（fsモック廃止）

## 入力（前工程の成果物）

- `tmp/workers/bdd-architect_TASK-147/analysis.md` — アーキテクト設計方針

## 出力（生成すべきファイル）

- `config/commands.ts` — YAML の TS 定数化（新規作成）
- `src/lib/services/command-service.ts` — fs依存排除
- `src/lib/services/post-service.ts` — lazy初期化導入
- `src/lib/services/__tests__/command-service.test.ts` — fsモック廃止 → commandsYamlOverride使用

## 完了条件

- [ ] `config/commands.ts` が `config/commands.yaml` と同一内容の定数をエクスポートする
- [ ] `command-service.ts` から `fs`, `path`, `yaml` の import が削除されている
- [ ] `post-service.ts` に `getCommandService()` lazy初期化が導入されている
- [ ] `setCommandService()` の既存動作（テスト用DI）が維持されている
- [ ] 単体テスト全件PASS: `npx vitest run`
- [ ] BDDテスト全件PASS: `npx cucumber-js`（既存の227 passed, 7 pending を維持）

## スコープ外

- `config/commands.yaml` の削除（正本として残す）
- `bot-service.ts` / `fixed-message.ts` の同様の修正（別スプリントで横展開）
- APIテスト / E2Eテストの追加（TASK-149で対応）
- BDDシナリオの追加・変更

## 補足・制約

- `CommandService` コンストラクタの引数順は既存テストとの互換性を考慮し、第3引数をパス→オブジェクトに変更する形にする。テスト側で `commandsYamlPath` を文字列で渡していた箇所がある場合はオブジェクト渡しに移行する
- lazy初期化の `getCommandService()` は `commandServiceAutoInitDone` フラグで二重初期化を防止する。初期化失敗時も再試行しない（エラーログ出力のみ）
- `setCommandService(null)` が呼ばれた場合も `commandServiceAutoInitDone = true` とし、明示的な null 設定を尊重する

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全4ファイル変更完了、単体テスト全PASS、BDDテスト全PASS

### 進捗ログ
- 2026-03-18: タスク開始、全必読ファイル読み込み完了
- 2026-03-18: Step 1 完了: config/commands.ts 新規作成（commands.yaml の TS 定数化）
- 2026-03-18: Step 2 完了: command-service.ts から fs/path/yaml import 削除、CommandsYaml/CommandConfig を export 化、コンストラクタ第3引数を commandsYamlOverride に変更
- 2026-03-18: Step 3 完了: post-service.ts に getCommandService() lazy 初期化導入（動的 require 使用）、setCommandService の commandServiceAutoInitDone フラグ設定追加
- 2026-03-18: Step 4 完了: command-service.test.ts の fs モック廃止、CommandsYaml オブジェクトを commandsYamlOverride に直接渡す形に移行

### テスト結果サマリー
- 単体テスト (npx vitest run): 47ファイル、1191テスト全PASS
- BDDテスト (npx cucumber-js): 234 scenarios (7 pending, 227 passed) — 既存結果を完全維持
- command-service.test.ts: 25テスト全PASS（fs モック廃止後）
