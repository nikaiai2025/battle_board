# R-002: ログイン + edge-token継続性 + ログアウト + パスワード再設定

## 対象シナリオ
1. 本登録後も既存の edge-token で書き込みできる
2. Cookie 削除後に非ログイン状態で書き込むと別人として扱われる
3. Cookie 削除後にログインすると同一ユーザーに復帰する
4. 本登録ユーザーがメールアドレスとパスワードでログインする
5. 本登録ユーザーが Discord アカウントでログインする（pending）
6. ログイン後も旧デバイスの edge-token は有効なままである
7. 誤ったパスワードではログインできない
8. 本登録ユーザーがパスワード再設定を申請する
9. パスワード再設定リンクから新しいパスワードを設定する
10. 未登録のメールアドレスでパスワード再設定を申請してもエラーを明かさない
11. ログアウトすると書き込みに再認証が必要になる

## 実装ファイル
- `src/lib/services/registration-service.ts` — ログイン・パスワード再設定
- `src/lib/services/auth-service.ts` — edge-token発行・認証
- `src/lib/infrastructure/repositories/edge-token-repository.ts` — edge-token DB操作
- `src/lib/infrastructure/repositories/user-repository.ts` — ユーザーDB操作

## ステップ定義
- `features/step_definitions/user_registration.steps.ts`

## テスト
- `src/lib/services/__tests__/auth-service.test.ts`
