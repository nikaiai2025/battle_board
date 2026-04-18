# ESC-TASK-394-1

## 問題の内容

`TASK-394` の実装後、完了条件に従って `npx tsc --noEmit` を実行したところ、`locked_files` 外の既存ファイルで TypeScript エラーが発生した。

該当箇所:

- `src/lib/infrastructure/adapters/audio-storage-adapter.ts`
- `src/__tests__/lib/infrastructure/adapters/audio-storage-adapter.test.ts`
- `src/__tests__/lib/infrastructure/adapters/gemini-tts-adapter.test.ts`

代表エラー:

- `Uint8Array<ArrayBufferLike>` が `BlobPart` に代入できない
- `mockResolvedValue` が `never` 型扱いになっている

`TASK-394` の `locked_files` には上記ファイルが含まれていないため、このままでは完了条件の `npx tsc --noEmit` を満たせない。

## 選択肢と各選択肢の影響

### 選択肢1: `locked_files` を拡張して該当3ファイルの修正を許可する

- 影響:
  - `TASK-394` の完了条件を満たせる可能性が高い
  - ただし本タスクの変更範囲が `worker/workflow/runbook` から型エラー修正へ広がる

### 選択肢2: `TASK-394` は実装完了扱いにし、型エラー修正を別タスクへ分離する

- 影響:
  - 今回のスコープは維持できる
  - ただし `npx tsc --noEmit` を満たさないため、完了条件の解釈変更が必要

### 選択肢3: 既存型エラーを既知不具合として許容し、`vitest` と YAML 検証のみで進める

- 影響:
  - 直近の進行は最も速い
  - ただし型安全性の基準を下げることになり、今後の CI 品質基準と矛盾する

## 関連するfeatureファイル・シナリオタグ

- `features/command_yomiage.feature`
  - `@コマンド実行後、非同期処理で★システムレスに音声URLが表示される`
  - `@対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない`
  - `@Gemini API呼び出しが失敗した場合は通貨返却・システム通知`
  - `@軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される`
