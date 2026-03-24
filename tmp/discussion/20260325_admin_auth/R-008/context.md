# R-008: 課金ステータス管理（有料化/無料化）

## 対象シナリオ

```gherkin
Scenario: 管理者がユーザーを有料ステータスに変更する
  Given 管理者がログイン済みである
  And ユーザー "UserA" は無料ユーザーである
  When ユーザー "UserA" を有料ステータスに変更する
  Then ユーザー "UserA" が有料ユーザーになる

Scenario: 管理者がユーザーを無料ステータスに変更する
  Given 管理者がログイン済みである
  And ユーザー "UserA" は有料ユーザーである
  When ユーザー "UserA" を無料ステータスに変更する
  Then ユーザー "UserA" が無料ユーザーになる
```

## 実装ファイル
- `src/lib/services/admin-service.ts` — AdminService（課金ステータス変更ロジック）
- `src/app/api/admin/users/[userId]/premium/route.ts` — 課金ステータス API
- `src/__tests__/lib/services/admin-premium.test.ts` — 単体テスト
- `features/step_definitions/admin.steps.ts` — BDDステップ定義
