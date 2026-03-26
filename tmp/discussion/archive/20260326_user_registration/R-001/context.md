# R-001: 本登録（メール認証）+ データ引き継ぎ

## 対象シナリオ
1. 仮ユーザーがメールアドレスとパスワードで本登録を申請する
2. メール確認リンクをクリックして本登録が完了する
3. 既に使用されているメールアドレスでは本登録できない
4. 本登録後に仮ユーザー時代の通貨残高が引き継がれる
5. 本登録後に仮ユーザー時代の書き込み履歴が引き継がれる
6. 本登録後に仮ユーザー時代のストリークが引き継がれる

## 実装ファイル
- `src/lib/services/registration-service.ts` — 本登録サービス
- `src/lib/infrastructure/repositories/user-repository.ts` — ユーザーDB操作
- `src/lib/domain/models/user.ts` — ユーザー型定義
- `src/lib/services/auth-service.ts` — edge-token発行

## ステップ定義
- `features/step_definitions/user_registration.steps.ts` — 本登録関連ステップ

## テスト
- `src/lib/services/__tests__/registration-service.test.ts`（存在する場合）
