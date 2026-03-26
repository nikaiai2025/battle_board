# R-001: 基本的な書き込み（無料/有料ユーザー）

## 対象シナリオ

```gherkin
Scenario: 無料ユーザーが書き込みを行う
  Given 無料ユーザーがスレッド "今日の雑談" を閲覧している
  When 本文 "こんにちは" を入力して書き込みボタンを押す
  Then レスがスレッドに追加される
  And 表示名は "名無しさん" である
  And 日次リセットIDが表示される

Scenario: 有料ユーザーがユーザーネーム付きで書き込みを行う
  Given 有料ユーザーがユーザーネーム "バトラー太郎" を設定済みである
  And スレッド "今日の雑談" を閲覧している
  When 本文 "こんにちは" を入力して書き込みボタンを押す
  Then レスがスレッドに追加される
  And 表示名は "バトラー太郎" である
```

## 実装ファイル
- `src/lib/services/post-service.ts` — createPost()（書き込みのメインロジック）
- `src/lib/infrastructure/repositories/post-repository.ts` — DB操作
- `src/lib/infrastructure/repositories/user-repository.ts` — ユーザー情報取得
- `src/lib/services/auth-service.ts` — edge-token認証
- `src/lib/domain/rules/daily-id.ts` — 日次リセットID生成
- `src/__tests__/lib/services/post-service.test.ts` — 単体テスト

## ステップ定義
- `features/step_definitions/posting.steps.ts` L62-L95（無料）, L106-L149（有料）
- `features/step_definitions/common.steps.ts` — 共通When/Then（書き込みボタンを押す）
