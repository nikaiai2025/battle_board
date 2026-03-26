# 敵対的コードレビュー 最終レポート

- 実施日: 2026-03-26
- 対象: user_registration.feature
- レビュー単位数: 4
- 指摘総数: 12 / 採用: 8 / 却下: 4

## 採用された問題（重複排除後: 6件）

### 1. completeRegistration の非アトミック2段階更新
- 問題ID: ATK-R001-1 / ATK-002-2 / ATK-R003-2（同根）
- 重大度: **CRITICAL**
- 対象シナリオ: メール確認リンクをクリックして本登録が完了する
- ファイル: `src/lib/services/registration-service.ts:185-194`
- 詳細: `updateSupabaseAuthId()` と `updatePatToken()` が別々のDB呼び出し。1回目成功・2回目失敗で「本登録済み・PATなし」の固着状態。`handleEmailConfirmCallback` の冪等チェックが既登録と判断して再実行しないため自己修復不可。二重クリックでPATサイレント上書きも発生。
- 防御側見解: CF Workers環境でのタイムアウトや503は現実的再現条件。UNIQUE制約違反のハンドリングも欠落。

### 2. メール重複検出のエラーメッセージ文字列依存
- 問題ID: ATK-R001-2
- 重大度: **CRITICAL**
- 対象シナリオ: 既に使用されているメールアドレスでは本登録できない
- ファイル: `src/lib/services/registration-service.ts:116-122`
- 詳細: Supabase signUp() のエラーメッセージ文字列パターンマッチで重複検出。ユーザー列挙防止設定が有効な場合、重複メールでも成功を返すためemail_takenが検出されず `success: true` が返る。
- 防御側見解: エラーフォーマット変更時に500エラー化する点も問題。BDDテストはモック直接注入のため乖離検出不可。

### 3. パスワード更新のrecoveryフロー認可チェック欠如
- 問題ID: ATK-002-1
- 重大度: **CRITICAL**
- 対象シナリオ: パスワード再設定リンクから新しいパスワードを設定する
- ファイル: `src/lib/services/registration-service.ts:437-455`, `src/app/api/auth/update-password/route.ts`
- 詳細: `updatePassword()` はedge-tokenのis_verified確認のみ。recovery メール経由で発行されたedge-tokenかどうかを区別しない。通常ログイン済みユーザーが直接APIを叩いてパスワード変更可能。
- 防御側見解: 影響は自己アカウントに限定（他者への攻撃不可）。ただし認可チェック欠如は設計上の問題。

### 4. PAT平文がJSON APIレスポンスに含まれる
- 問題ID: ATK-R004-1
- 重大度: **CRITICAL**
- 対象シナリオ: マイページでPATを確認できる
- ファイル: `src/lib/services/mypage-service.ts:264`, `src/app/api/mypage/route.ts:81`
- 詳細: `GET /api/mypage` のJSONに `patToken` が平文で含まれる。PATはedge-token再発行可能な認証資格情報。`authToken` をCR-002で除去した設計方針と矛盾。XSS経由での奪取リスク。
- 防御側見解: authToken除去方針との不整合は明確。

### 5. MockBbsCgiResponseBuilder の引数シグネチャ乖離
- 問題ID: ATK-R003-3
- 重大度: HIGH
- 対象シナリオ: 無効なPATでは書き込みが拒否される
- ファイル: PAT統合テスト（`pat-integration.test.ts:72-77`）
- 詳細: MockのbuildAuthRequiredが3引数、実装は2引数。`unknown`キャストでTypeScript型チェック回避。認証案内レスポンス生成パスが単体テストで保護されていない。

### 6. 仮ユーザー課金制約のNOT_REGISTERED単体テスト欠落
- 問題ID: ATK-R004-3
- 重大度: HIGH
- 対象シナリオ: 仮ユーザーは課金できない
- ファイル: `src/lib/services/__tests__/mypage-service.test.ts`
- 詳細: `upgradeToPremium` の `NOT_REGISTERED` 分岐を検証するテストケースなし。`registrationType: null` フィクスチャも未定義。BDD専用で保護されており、vitest-only CIでは回帰検出不可。

## 却下された問題（4件）

| 問題ID | 理由 |
|--------|------|
| ATK-R001-3 | pendingUserIdはサーバーサイドでedge-tokenから特定。クライアント改ざん不可 |
| ATK-002-3 | InMemoryのupdateUserByIdはパスワードストアを実際に更新。テストは機能している |
| ATK-R003-1 | PostService.createPost() Step 2bでBANチェックあり。PAT認証後も書き込みは拒否される |
| ATK-R004-2 | フロントエンドは!res.okで一律エラー処理。仮ユーザーはボタンdisabled |

## アーキテクト評価

| 問題ID | 概要 | アーキテクト判定 | 修正方針 |
|--------|------|----------------|---------|
| ATK-REG-001 | completeRegistration非アトミック2段階更新 | **対応必須** | 2つのUPDATEを単一UPDATEに統合（UserRepository.completeRegistrationUpdate新設） |
| ATK-REG-002 | メール重複検出の文字列依存 | 対応推奨 | signUp()レスポンスのidentities空配列チェックに変更 |
| ATK-REG-003 | パスワード更新のrecovery認可チェック欠如 | 対応推奨 | edge_tokensにpurposeカラム追加、recovery限定認可 |
| ATK-REG-004 | PAT平文がJSON APIに含まれる | 対応推奨 | MypageInfoからPAT除外、既存/api/auth/patエンドポイントに分離 |
