# 敵対的レビュー: user_registration.feature

## レビュー単位

| # | シナリオ | 関連ファイル（推定） |
|---|---------|-------------------|
| R-001 | 本登録（メール認証）3件 + データ引き継ぎ3件 | registration-service.ts, user-repository.ts |
| R-002 | ログイン4件 + edge-token継続性3件 + ログアウト1件 + パスワード再設定3件 | auth-service.ts, registration-service.ts, edge-token-repository.ts |
| R-003 | PAT（専ブラ連携トークン）8件 | registration-service.ts, bbs-cgi-response.ts, edge-token-repository.ts |
| R-004 | 課金制約2件 + マイページ表示2件 | mypage-service.ts, mypage-display-rules.ts |

## 除外
- Discord連携シナリオ（1件）: pending実装のため除外
