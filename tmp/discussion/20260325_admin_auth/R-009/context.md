# R-009: 書き込み認証 Turnstile（未認証案内/成功/失敗/バイパス防止）

## 対象シナリオ

```gherkin
Scenario: 未認証ユーザーが書き込みを行うと認証ページが案内される
  Given 未認証のユーザーが書き込みフォームから書き込みを送信する
  When サーバーが書き込みリクエストを処理する
  Then 認証ページへの案内が表示される
  And edge-token Cookie が発行される

Scenario: Turnstile通過で認証に成功する
  Given ユーザーが未認証のedge-tokenを持っている
  And ユーザーがTurnstile検証を通過している
  When ユーザーが /auth/verify でTurnstile認証を完了する
  Then edge-token が有効化される
  And write_tokenが発行される
  And 書き込み可能状態になる

Scenario: Turnstile検証に失敗すると認証に失敗する
  Given ユーザーが未認証のedge-tokenを持っている
  And ユーザーがTurnstile検証に失敗している
  When ユーザーが /auth/verify でTurnstile認証を試みる
  Then 認証エラーメッセージが表示される
  And edge-token は有効化されない

Scenario: edge-token発行後、Turnstile未通過で再書き込みすると認証が再要求される
  Given ユーザーがedge-tokenを発行されているがTurnstile認証を完了していない
  When ユーザーが書き込みを送信する
  Then 認証ページへの案内が再度表示される
  And 書き込みは処理されない
```

## 実装ファイル
- `src/lib/services/auth-service.ts` — AuthService（Turnstile検証・edge-token管理）
- `src/lib/services/post-service.ts` — PostService（書き込み時の認証チェック）
- `src/app/api/auth/verify/route.ts` — Turnstile検証 API
- `features/step_definitions/authentication.steps.ts` — BDDステップ定義
