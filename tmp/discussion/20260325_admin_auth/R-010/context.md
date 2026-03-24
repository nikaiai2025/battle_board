# R-010: edge-token継続性（IP変更/有効期限切れ）

## 対象シナリオ

```gherkin
Scenario: 認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
  Given ユーザーが書き込み可能状態である
  When ユーザーのIPアドレスが変わった後に書き込みを行う
  Then 書き込みは正常に処理される

Scenario: edge-token Cookieの有効期限が切れると再認証が必要になる
  Given ユーザーが書き込み可能状態である
  When edge-token Cookieの有効期限が切れた後に書き込みを行う
  Then 認証ページへの案内が表示される
  And 新しいedge-tokenが発行される
```

## 実装ファイル
- `src/lib/services/auth-service.ts` — AuthService（edge-token検証）
- `src/lib/services/post-service.ts` — PostService（書き込み処理）
- `features/step_definitions/authentication.steps.ts` — BDDステップ定義
