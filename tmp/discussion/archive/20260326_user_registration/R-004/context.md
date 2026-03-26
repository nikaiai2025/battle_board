# R-004: 課金制約 + マイページ表示

## 対象シナリオ
1. 仮ユーザーは課金できない
2. 本登録済みの無料ユーザーは課金できる
3. 仮ユーザーのマイページに本登録案内が表示される
4. 本登録ユーザーのマイページにアカウント種別と認証方法が表示される

## 実装ファイル
- `src/lib/services/mypage-service.ts` — マイページサービス
- `src/lib/domain/rules/mypage-display-rules.ts` — マイページ表示ルール
- `src/lib/domain/models/user.ts` — ユーザー型定義
- `src/lib/infrastructure/repositories/user-repository.ts` — ユーザーDB操作

## ステップ定義
- `features/step_definitions/user_registration.steps.ts` — 課金・マイページ関連ステップ
- `features/step_definitions/mypage.steps.ts` — マイページ共通ステップ

## テスト
- `src/lib/services/__tests__/mypage-service.test.ts`
