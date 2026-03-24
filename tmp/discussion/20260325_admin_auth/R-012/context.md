# R-012: 管理者ログイン（正常/エラー）

## 対象シナリオ

```gherkin
Scenario: 管理者が正しいメールアドレスとパスワードでログインする
  Given 管理者アカウントが存在する
  When 管理者が正しいメールアドレスとパスワードを入力してログインする
  Then 管理者セッションが作成される
  And 管理画面にアクセスできる

Scenario: 管理者が誤ったパスワードでログインすると失敗する
  Given 管理者アカウントが存在する
  When 管理者が誤ったパスワードでログインを試みる
  Then ログインエラーメッセージが表示される
  And 管理者セッションは作成されない
```

## 実装ファイル
- `src/lib/infrastructure/repositories/admin-user-repository.ts` — 管理者リポジトリ
- `src/app/api/admin/login/route.ts` — 管理者ログイン API
- `src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts` — 単体テスト
- `features/step_definitions/authentication.steps.ts` — BDDステップ定義
