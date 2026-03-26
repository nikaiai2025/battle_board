# R-003: PAT（専ブラ連携トークン）

## 対象シナリオ
1. 本登録完了時に PAT が自動発行される
2. マイページで PAT を確認できる
3. 専ブラの mail 欄に PAT を設定して書き込みできる
4. PAT 認証後は Cookie で認証され PAT は認証処理に使われない
5. Cookie 喪失時に mail 欄の PAT で自動復帰する
6. PAT を再発行すると旧 PAT が無効になる
7. 仮ユーザーには PAT が表示されない
8. 無効な PAT では書き込みが拒否される

## 実装ファイル
- `src/lib/services/registration-service.ts` — PAT発行・再発行・検証
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — 専ブラ応答生成
- `src/lib/infrastructure/repositories/edge-token-repository.ts` — edge-token DB操作
- `src/lib/infrastructure/repositories/user-repository.ts` — ユーザーDB操作（PAT格納）
- `src/lib/services/auth-service.ts` — PAT認証フロー

## ステップ定義
- `features/step_definitions/user_registration.steps.ts` — PAT関連ステップ
- `features/step_definitions/specialist_browser_compat.steps.ts` — 専ブラ関連（参考）

## テスト
- 関連する単体テスト
