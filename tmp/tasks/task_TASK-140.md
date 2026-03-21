---
task_id: TASK-140
sprint_id: Sprint-49
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-18T00:00:00+09:00
updated_at: 2026-03-18T00:00:00+09:00
locked_files:
  - src/lib/domain/rules/command-parser.ts
  - src/lib/domain/rules/__tests__/command-parser.test.ts
  - features/step_definitions/command_system.steps.ts
---

## タスク概要

command-parserの解析ロジックを拡張し、前方引数（`>>N !cmd`）と全角スペース区切りに対応する。
BDDシナリオ7件（引数の語順と空白文字セクション）を全PASSにする。

## 対象BDDシナリオ

- `features/command_system.feature` — 「引数の語順と空白文字」セクション（7シナリオ）
  - アンカーを先に書いてからコマンドを書いても実行される
  - 前方引数と後方引数が両方ある場合は後方引数が優先される
  - 全角スペースで区切られた前方引数が認識される
  - 全角スペースで区切られた後方引数が認識される
  - アンカーとコマンドの間にテキストがある場合は前方引数として認識されない
  - アンカーとコマンドが改行で区切られている場合は前方引数として認識されない

## 必読ドキュメント（優先度順）

1. [必須] `features/command_system.feature` — 対象シナリオ（特に76〜116行目）
2. [必須] `docs/architecture/components/command.md` — § 2.3 解析ルール6,7,8
3. [必須] `src/lib/domain/rules/command-parser.ts` — 現在の実装
4. [必須] `src/lib/domain/rules/__tests__/command-parser.test.ts` — 現在のテスト
5. [必須] `features/step_definitions/command_system.steps.ts` — 現在のステップ定義

## 入力（前工程の成果物）

- 既存のcommand-parser実装と単体テスト
- 既存のBDDステップ定義

## 出力（生成すべきファイル）

- `src/lib/domain/rules/command-parser.ts` — 前方引数・全角スペース対応を追加
- `src/lib/domain/rules/__tests__/command-parser.test.ts` — 新ルールの単体テスト追加
- `features/step_definitions/command_system.steps.ts` — 新シナリオに必要なステップ定義追加

## 完了条件

- [ ] `features/command_system.feature` の全シナリオがPASS（既存含む）
- [ ] 新ルール（前方引数・全角スペース・後方優先・非認識条件）の単体テスト全件PASS
- [ ] 既存テスト全件PASS（リグレッションなし）
- [ ] テストコマンド: `npx vitest run src/lib/domain/rules/__tests__/command-parser.test.ts`
- [ ] テストコマンド: `npx cucumber-js --tags @command`（タグがない場合は `npx cucumber-js features/command_system.feature`）

## スコープ外

- CommandService本体の変更（command-parserの純粋関数の拡張のみ）
- 他のfeatureファイルの変更
- config/commands.yamlの変更

## 補足・制約

- command-parserは純粋関数。外部依存を追加しないこと
- 現在の正規表現 `/(?:^|(?<=\s))!([a-zA-Z][a-zA-Z0-9_]*)((?:\s+\S+)*)/g` を拡張する必要がある
- 全角スペース（U+3000）を半角スペースと同等に扱う
- 前方引数の認識は `targetFormat: ">>postNumber"` を持つコマンドのみが対象だが、command-parser層ではtargetFormatを知らない。parserは`>>N`パターンの引数を前方から検出し返す設計とする。targetFormatに基づくバリデーションは上位層（CommandService）の責務
- 新しいステップ定義で未定義のステップがある場合は追加すること。特に以下:
  - `コマンド "!tell" のターゲットが未指定のためエラーがレス末尾にマージ表示される`
  - `以下の本文を投稿する:` （DocString対応）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [調査] 既存テスト: 単体テスト34件PASS、BDDテスト225 passed / 2 undefined
- [調査] 未定義ステップ: `以下の本文を投稿する:` と `コマンド "!tell" のターゲットが未指定のためエラーがレス末尾にマージ表示される`
- [分析] command-parser.ts に追加が必要なルール: 全角スペース対応（ルール8）、前方引数検出（ルール6,7）、後方優先（ルール6）
- [実装] command-parser.ts: WHITESPACE定数・FORWARD_ARG_PATTERN追加、buildForwardArgMap関数追加、後方優先ロジック追加
- [テスト] command-parser.test.ts: 新ルール11件追加（全角スペース後方3件、前方引数6件、非認識条件2件）
- [ステップ] command_system.steps.ts: `以下の本文を投稿する:` (DocString When) と `コマンド {string} のターゲットが未指定のためエラーがレス末尾にマージ表示される` (Then) を追加

### テスト結果サマリー
- 単体テスト: 45 PASS / 0 FAIL（新規11件追加、既存34件リグレッションなし）
- BDDテスト: 234 scenarios（227 passed / 7 pending / 0 failed / 0 undefined）
  - 以前: 225 passed / 2 undefined → 今回: 227 passed / 0 undefined（+2解決）
  - 7 pending は既存の bot_system.feature UIシナリオ（本タスクのスコープ外）
- テストコマンド確認:
  - `npx vitest run src/lib/domain/rules/__tests__/command-parser.test.ts`: 45 passed
  - `npx cucumber-js features/command_system.feature`: 234 scenarios (227 passed, 7 pending)
