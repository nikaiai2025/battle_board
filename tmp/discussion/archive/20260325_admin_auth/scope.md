# 敵対的レビュー: admin.feature + authentication.feature

## レビュー単位

| # | シナリオ | 主要実装ファイル |
|---|---------|----------------|
| R-001 | [admin] レス削除 3件（コメント付き/なし/権限エラー） | admin-service.ts, admin/posts/[postId]/route.ts |
| R-002 | [admin] スレッド削除 + 存在しないレス削除 (2件) | admin-service.ts, admin/threads/[threadId]/route.ts |
| R-003 | [admin] ユーザーBAN 3件（BAN/書き込み拒否/解除） | admin-service.ts, admin/users/[userId]/ban/route.ts, post-service.ts |
| R-004 | [admin] IP BAN 4件（BAN/書き込み拒否/新規登録拒否/解除） | admin-service.ts, admin/ip-bans/route.ts, auth-service.ts |
| R-005 | [admin] 通貨付与 2件（正常/権限エラー） | admin-service.ts, admin/users/[userId]/currency/route.ts |
| R-006 | [admin] ユーザー管理 3件（一覧/詳細/書き込み履歴） | admin-service.ts, admin/users/ routes |
| R-007 | [admin] ダッシュボード 2件（統計/日次推移） | admin-service.ts, admin/dashboard/ routes |
| R-008 | [admin] 課金ステータス管理 2件（有料化/無料化） | admin-service.ts, admin/users/[userId]/premium/route.ts |
| R-009 | [auth] 書き込み認証 Turnstile 4件（未認証案内/成功/失敗/バイパス防止） | auth-service.ts, auth/verify/route.ts |
| R-010 | [auth] edge-token継続性 2件（IP変更/有効期限切れ） | auth-service.ts, post-service.ts |
| R-011 | [auth] 日次リセットID 4件（同一ID/リセット/Cookie再認証/日付境界） | auth-service.ts, post-service.ts |
| R-012 | [auth] 管理者ログイン 2件（正常/エラー） | admin-user-repository.ts, admin/login/route.ts |
