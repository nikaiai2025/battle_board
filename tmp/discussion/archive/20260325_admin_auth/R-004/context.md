# R-004: IP BAN（BAN/書き込み拒否/新規登録拒否/解除）

## 対象シナリオ

```gherkin
Scenario: 管理者がユーザーのIPをBANする
  Given 管理者がログイン済みである
  And ユーザー "UserA" が存在する
  When ユーザー "UserA" のIPをBANする
  Then IP BANリストに登録される

Scenario: BANされたIPからの書き込みが拒否される
  Given ユーザー "UserA" のIPがBANされている
  When そのIPからスレッドへの書き込みを試みる
  Then エラーメッセージが表示される
  And レスは追加されない

Scenario: BANされたIPからの新規登録が拒否される
  Given ユーザー "UserA" のIPがBANされている
  When そのIPから認証を試みる
  Then 認証は拒否される

Scenario: 管理者がIP BANを解除する
  Given ユーザー "UserA" のIPがBANされている
  When 管理者がそのIP BANを解除する
  Then そのIPからの書き込みが可能になる
```

## 実装ファイル
- `src/lib/services/admin-service.ts` — AdminService（IP BAN/解除ロジック）
- `src/lib/services/post-service.ts` — PostService（書き込み時のIP BANチェック）
- `src/lib/services/auth-service.ts` — AuthService（認証時のIP BANチェック）
- `src/app/api/admin/ip-bans/route.ts` — IP BAN一覧/追加 API
- `src/app/api/admin/ip-bans/[banId]/route.ts` — IP BAN解除 API
- `features/step_definitions/admin.steps.ts` — BDDステップ定義
