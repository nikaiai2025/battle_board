# R-007: ダッシュボード（統計/日次推移）

## 対象シナリオ

```gherkin
Scenario: 管理者がダッシュボードで統計情報を確認できる
  Given 管理者がログイン済みである
  When ダッシュボードを表示する
  Then 総ユーザー数が表示される
  And 本日の書き込み数が表示される
  And アクティブスレッド数が表示される
  And 通貨流通量が表示される

Scenario: 管理者が統計情報の日次推移を確認できる
  Given 管理者がログイン済みである
  And 過去7日分の日次統計が記録されている
  When ダッシュボードの推移グラフを表示する
  Then 日付ごとの統計推移が確認できる
```

## 実装ファイル
- `src/lib/services/admin-service.ts` — AdminService（ダッシュボードロジック）
- `src/app/api/admin/dashboard/route.ts` — ダッシュボード統計 API
- `src/app/api/admin/dashboard/history/route.ts` — 日次推移 API
- `src/__tests__/lib/services/admin-dashboard.test.ts` — 単体テスト
- `features/step_definitions/admin.steps.ts` — BDDステップ定義
