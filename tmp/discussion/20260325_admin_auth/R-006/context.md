# R-006: ユーザー管理（一覧/詳細/書き込み履歴）

## 対象シナリオ

```gherkin
Scenario: 管理者がユーザー一覧を閲覧できる
  Given 管理者がログイン済みである
  And ユーザーが5人登録されている
  When ユーザー一覧ページを表示する
  Then ユーザーが一覧表示される
  And 各ユーザーのID、登録日時、ステータス、通貨残高が表示される

Scenario: 管理者が特定ユーザーの詳細を閲覧できる
  Given 管理者がログイン済みである
  And ユーザー "UserA" が過去に3件の書き込みを行っている
  When ユーザー "UserA" の詳細ページを表示する
  Then ユーザーの基本情報（ステータス、通貨残高、ストリーク）が表示される
  And 書き込み一覧が表示される

Scenario: 管理者がユーザーの書き込み履歴を確認できる
  Given 管理者がユーザー "UserA" の詳細ページを表示している
  Then 管理者画面でも各書き込みのスレッド名、本文、書き込み日時が含まれる
```

## 実装ファイル
- `src/lib/services/admin-service.ts` — AdminService（ユーザー管理ロジック）
- `src/app/api/admin/users/route.ts` — ユーザー一覧 API
- `src/app/api/admin/users/[userId]/route.ts` — ユーザー詳細 API
- `src/app/api/admin/users/[userId]/posts/route.ts` — ユーザー書き込み履歴 API
- `features/step_definitions/admin.steps.ts` — BDDステップ定義
