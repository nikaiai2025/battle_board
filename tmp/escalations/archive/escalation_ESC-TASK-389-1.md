# エスカレーション: TASK-389 locked_files のテストパス不整合

- **エスカレーションID**: ESC-TASK-389-1
- **タスクID**: TASK-389
- **起票日**: 2026-04-18
- **起票者**: bdd-coding
- **ステータス**: open

## 問題の内容

TASK-389 の `locked_files` に記載されている `src/__tests__/lib/services/command-service.test.ts` は実在しません。

- タスク記載のパス: `src/__tests__/lib/services/command-service.test.ts`
- 実在するテストファイル: `src/lib/services/__tests__/command-service.test.ts`

本タスクでは `CommandService` の `preValidate` 呼び出し順と通貨消費抑止を検証する単体テストの追加が必須です。しかし、実在ファイルは `locked_files` 外のため、現行ルールでは変更できません。

これは bdd-coding エージェントのエスカレーション条件

- `locked_files` 外のファイル変更が必要だと判明した
- 情報不足しており、自己判断で行動を決定できない

に該当します。

## 選択肢と各選択肢の影響

1. `locked_files` を修正し、`src/lib/services/__tests__/command-service.test.ts` を許可対象に追加する
影響: タスク要件どおりに `CommandService` の単体テストを更新できる。最小変更でタスクを継続可能。

2. テスト追加を見送り、既存テスト更新なしで実装のみ進める
影響: タスク指示の `4.1 preValidate 呼び出し順の検証テスト追加` を満たせない。BDD/TDD 方針にも反するため不適切。

3. 新規に `src/__tests__/lib/services/command-service.test.ts` を作成して対応する
影響: 実際のテスト配置規約から逸脱する。既存テストと重複し、DRY 原則にも反するため不適切。

## 推奨

選択肢 1 を推奨します。`locked_files` の誤記を修正し、実在ファイル `src/lib/services/__tests__/command-service.test.ts` を編集許可対象に含めてください。

## 関連する feature ファイル・シナリオタグ

- `features/command_hiroyuki.feature`
- 関連シナリオ:
  - `削除済みレスを対象に指定するとエラーになる`
  - `システムメッセージを対象に指定するとエラーになる`
- 明示的なシナリオタグ: なし
