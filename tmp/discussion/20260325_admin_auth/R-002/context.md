# R-002: スレッド削除 + 存在しないレス削除

## 対象シナリオ

```gherkin
Scenario: 管理者が指定したスレッドを削除する
  Given 管理者がログイン済みである
  And スレッド "不適切なスレッド" が存在する
  When スレッド "不適切なスレッド" の削除を実行する
  Then スレッドとその中の全レスが削除される
  And スレッド一覧から "不適切なスレッド" が消える

Scenario: 存在しないレスの削除を試みるとエラーになる
  Given 管理者がログイン済みである
  And レス >>999 は存在しない
  When レス >>999 の削除を実行する
  Then エラーメッセージ "指定されたレスが見つかりません" が表示される
```

## 実装ファイル
- `src/lib/services/admin-service.ts` — AdminService（スレッド削除ロジック）
- `src/app/api/admin/threads/[threadId]/route.ts` — DELETE APIルート
- `src/app/api/admin/posts/[postId]/route.ts` — DELETE APIルート（存在しないレス）
- `features/step_definitions/admin.steps.ts` — BDDステップ定義
