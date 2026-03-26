# R-003: ユーザーBAN（BAN/書き込み拒否/BAN解除）

## 対象シナリオ

```gherkin
Scenario: 管理者がユーザーをBANする
  Given 管理者がログイン済みである
  And ユーザー "UserA" が存在する
  When ユーザー "UserA" をBANする
  Then ユーザー "UserA" のステータスがBAN済みになる

Scenario: BANされたユーザーの書き込みが拒否される
  Given ユーザー "UserA" がBANされている
  When ユーザー "UserA" がスレッドへの書き込みを試みる
  Then エラーメッセージが表示される
  And レスは追加されない

Scenario: 管理者がユーザーBANを解除する
  Given 管理者がログイン済みである
  And ユーザー "UserA" がBANされている
  When 管理者がユーザー "UserA" のBANを解除する
  Then ユーザー "UserA" の書き込みが可能になる
```

## 実装ファイル
- `src/lib/services/admin-service.ts` — AdminService（BAN/解除ロジック）
- `src/lib/services/post-service.ts` — PostService（書き込み時のBANチェック）
- `src/app/api/admin/users/[userId]/ban/route.ts` — BAN API
- `features/step_definitions/admin.steps.ts` — BDDステップ定義
