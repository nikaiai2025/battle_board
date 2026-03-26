# R-005: 通貨付与（正常/権限エラー）

## 対象シナリオ

```gherkin
Scenario: 管理者が指定ユーザーに通貨を付与する
  Given 管理者がログイン済みである
  And ユーザー "UserA" の通貨残高が 50 である
  When ユーザー "UserA" に通貨 100 を付与する
  Then ユーザー "UserA" の通貨残高が 150 になる

Scenario: 管理者でないユーザーが通貨付与を試みると権限エラーになる
  Given 管理者でないユーザーがログイン済みである
  When 通貨付与APIを呼び出す
  Then 権限エラーメッセージが表示される
```

## 実装ファイル
- `src/lib/services/admin-service.ts` — AdminService（通貨付与ロジック）
- `src/app/api/admin/users/[userId]/currency/route.ts` — 通貨付与 API
- `features/step_definitions/admin.steps.ts` — BDDステップ定義
