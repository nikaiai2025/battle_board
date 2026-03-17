---
task_id: TASK-067
sprint_id: Sprint-24
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T13:00:00+09:00
updated_at: 2026-03-16T13:00:00+09:00
locked_files:
  - "[NEW] src/lib/domain/rules/command-parser.ts"
  - "[NEW] src/__tests__/lib/domain/rules/command-parser.test.ts"
---

## タスク概要

コマンドパーサー（command-parser）を純粋関数として実装する。書き込み本文からコマンドを検出し、ParsedCommandを返す。D-08 command.md §2.3 の解析仕様に完全準拠する。

## 対象BDDシナリオ
- `features/command_system.feature`
  - 「書き込み本文中のコマンドが解析され実行される」（パース部分）
  - 「存在しないコマンドは無視され通常の書き込みとして扱われる」（パース部分）
  - 「1レスに複数のコマンドが含まれる場合は先頭のみ実行される」

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/command.md` — §2.3 コマンド解析仕様
2. [必須] `features/command_system.feature` — BDDシナリオ
3. [必須] `src/lib/domain/models/command.ts` — ParsedCommand型定義
4. [参考] `config/commands.yaml` — 登録済みコマンド名

## 出力（生成すべきファイル）
- `src/lib/domain/rules/command-parser.ts` — パーサー実装
- `src/__tests__/lib/domain/rules/command-parser.test.ts` — 単体テスト

## 完了条件
- [ ] 解析ルール5項目が全て実装されている
  1. `!`で始まる単語をコマンド候補として検出
  2. コマンド名の後にスペース区切りで引数を取得
  3. 本文中の任意の位置に出現可能
  4. 複数コマンドがある場合は先頭のみ返す
  5. 登録済みコマンド名リストを受け取り、未登録ならnullを返す
- [ ] 単体テストが以下ケースをカバー:
  - 通常のコマンド検出（`!tell >>5`）
  - コマンド+前後テキスト（`これAIだろ !tell >>5`）
  - 未登録コマンド → null
  - 複数コマンド → 先頭のみ
  - コマンドなし → null
  - 空文字列 → null
  - `!`単独（コマンド名なし） → null
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx tsc --noEmit` エラー0件

## 補足・制約

- パーサーは純粋関数。外部依存なし（DBアクセス不可）
- 登録コマンド名のリスト（`string[]`）を引数として受け取る設計とする。config/commands.yamlの読み込みはCommandService側の責務
- `src/lib/domain/rules/` 配下に配置（依存方向ルール準拠）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [完了] 必読ドキュメント読み込み（command.md §2.3, command_system.feature, command.ts）
- [完了] テストファイル先行作成（RED確認済み）
  - `src/lib/domain/rules/__tests__/command-parser.test.ts`
- [完了] 実装ファイル作成
  - `src/lib/domain/rules/command-parser.ts`
- [完了] 全完了条件チェック

### テスト結果サマリー

- 対象テスト: `src/lib/domain/rules/__tests__/command-parser.test.ts`
- 結果: 34件 / 34件 PASS
- 全テストスイート: 635件 / 635件 PASS（19ファイル）
- TypeScript チェック (`npx tsc --noEmit`): エラー 0 件

### 完了条件チェックリスト

- [x] 解析ルール5項目が全て実装されている
  1. [x] `!`で始まる単語をコマンド候補として検出（正規表現 `(?:^|(?<=\s))!([a-zA-Z][a-zA-Z0-9_]*)` 使用）
  2. [x] コマンド名の後にスペース区切りで引数を取得
  3. [x] 本文中の任意の位置に出現可能
  4. [x] 複数コマンドがある場合は先頭のみ返す
  5. [x] 登録済みコマンド名リストを受け取り、未登録なら null を返す
- [x] 単体テストが以下ケースをカバー:
  - [x] 通常のコマンド検出（`!tell >>5`）
  - [x] コマンド+前後テキスト（`これAIだろ !tell >>5`）
  - [x] 未登録コマンド → null
  - [x] 複数コマンド → 先頭のみ
  - [x] コマンドなし → null
  - [x] 空文字列 → null
  - [x] `!`単独（コマンド名なし） → null
- [x] `npx vitest run` 全テストPASS（635件）
- [x] `npx tsc --noEmit` エラー0件
