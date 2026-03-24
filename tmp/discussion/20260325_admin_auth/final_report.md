# 敵対的コードレビュー 最終レポート

- 実施日: 2026-03-25
- 対象: `admin.feature` (21シナリオ) + `authentication.feature` (12シナリオ)
- レビュー単位数: 12
- 指摘総数: 36 / 採用: 19 / 却下: 17

---

## 採用された問題（重大度順）

### CRITICAL（即座に対応すべき）

#### 1. BAN済みユーザーがedge-token再取得でBANを回避できる
- **問題ID**: ATK-003-1
- **対象シナリオ**: ユーザーBAN — 書き込み拒否
- **ファイル**: `src/lib/services/post-service.ts` (resolveAuth), `src/lib/services/auth-service.ts` (issueEdgeToken)
- **詳細**: BAN済みユーザーのedge-tokenが失効した場合、`issueEdgeToken`はIP BANのみチェックしユーザーBANを確認しない。新しいedge-tokenが発行され書き込みが通る
- **影響**: セキュリティ — BAN機能の無効化

#### 2. IP BAN 解除→再BANでUNIQUE制約違反（500エラー）
- **問題ID**: ATK-004-1
- **対象シナリオ**: IP BAN — BAN/解除サイクル
- **ファイル**: `supabase/migrations/00010_ban_system.sql` (ip_hash UNIQUE), `src/lib/services/admin-service.ts` (banIpByUserId)
- **詳細**: `deactivate`は論理削除のみ。再BAN時にINSERTが`ip_bans_ip_hash_unique`制約に違反。インメモリに制約がないためBDDで検出不能
- **影響**: 運用 — 再BAN操作が500エラーで失敗

#### 3. edge-tokenに有効期限がなく盗難時に失効手段がない
- **問題ID**: ATK-010-1
- **対象シナリオ**: edge-token継続性
- **ファイル**: `edge_tokens`テーブル, `src/lib/services/auth-service.ts` (verifyEdgeToken)
- **詳細**: `expires_at`カラムなし。`verifyEdgeToken`は`is_verified=true`のみで認証。Cookie有効期限（365日）が切れてもDB側トークンは永続有効
- **影響**: セキュリティ — トークン盗難時のリスク窓が無限

#### 4. スレッド削除がトランザクションなしで半削除状態のリスク
- **問題ID**: ATK-002-1
- **対象シナリオ**: スレッド削除
- **ファイル**: `src/lib/services/admin-service.ts` (deleteThread)
- **詳細**: `ThreadRepository.softDelete` → `PostRepository.softDeleteByThreadId` を逐次実行。後者のDB障害でスレッドのみ削除済み・レスは生存
- **影響**: データ整合性 — 半削除状態

#### 5. 管理者ログインでservice_roleキー使用（最小権限違反）
- **問題ID**: ATK-012-2
- **対象シナリオ**: 管理者ログイン
- **ファイル**: `src/lib/infrastructure/repositories/admin-user-repository.ts` (createAuthClient)
- **詳細**: `signInWithPassword`にservice_roleキーを使用。同コードベースに`createAuthOnlyClient()`（anonキー）が既存だが未使用
- **影響**: セキュリティ — RLSバイパスリスク（将来のDB操作追加時）

#### 6. ユーザー一覧に通貨残高（balance）が未実装
- **問題ID**: ATK-006-1
- **対象シナリオ**: ユーザー管理 — 一覧
- **ファイル**: `src/lib/services/admin-service.ts` (getUserList)
- **詳細**: シナリオが「通貨残高が表示される」と要求するが`getBalance()`未呼出。テストもコメントアウトで回避
- **影響**: 機能欠損 — シナリオの受け入れ基準未達

#### 7. ユーザー書き込み履歴にスレッド名が未実装
- **問題ID**: ATK-006-2
- **対象シナリオ**: ユーザー管理 — 書き込み履歴
- **ファイル**: `src/lib/services/admin-service.ts` (getUserPosts), リポジトリ層
- **詳細**: `Post`モデルにスレッド名なし。JOINなし。テストは`threadId`のtruthyチェックで代替
- **影響**: 機能欠損 — シナリオの受け入れ基準未達

### HIGH（計画的に対応すべき）

#### 8. APIルートのreturn欠落フォールスルー（横断的）
- **問題ID**: ATK-002-2, ATK-008-1
- **対象**: threads/posts DELETEルート、premium PUT/DELETEルート
- **ファイル**: `src/app/api/admin/threads/[threadId]/route.ts`, `posts/[postId]/route.ts`, `users/[userId]/premium/route.ts`
- **詳細**: `!result.success`ブロック内の`reason`分岐で`not_found`以外のcaseに`return`なし。フォールスルーして200 OKを返す
- **影響**: 将来のreason追加時にサイレント誤動作

#### 9. BDDテストデータのipHash/authorIdSeed不整合（横断的）
- **問題ID**: ATK-003-3, ATK-004-2
- **対象**: ユーザーBAN・IP BAN テスト
- **ファイル**: `features/step_definitions/admin.steps.ts`
- **詳細**: `namedUser.ipHash`に`authorIdSeed`を設定。`lastIpHash`とは異なる値。BANと書き込み拒否で別キーが使われる
- **影響**: テスト — BAN協調動作の検証不備

#### 10. BAN解除テストが実際の書き込み成功を未検証
- **問題ID**: ATK-003-2
- **対象**: ユーザーBAN解除シナリオ
- **ファイル**: `features/step_definitions/admin.steps.ts`
- **詳細**: `isBanned===false`のフラグ確認のみ。`PostService.createPost`未呼出
- **影響**: テスト — 振る舞い未検証

#### 11. parseInt→Math.min NaN伝播（横断的）
- **問題ID**: ATK-005-3, ATK-006-3, ATK-007-1
- **対象**: 通貨付与/ユーザー一覧/ダッシュボード履歴 APIルート
- **ファイル**: 各route.ts
- **詳細**: `parseInt("abc")`→`NaN`→`Math.min(NaN,上限)`→`NaN`。DB操作に到達し500エラー
- **影響**: 入力検証漏れ — 管理者操作で500エラー

#### 12. 権限チェックBDDテスト素通り
- **問題ID**: ATK-001-1
- **対象**: レス削除 — 権限エラー
- **ファイル**: `features/step_definitions/admin.steps.ts`
- **詳細**: `isAdmin`フラグで早期リターン。AdminService.deletePostもverifyAdminSessionも未呼出
- **影響**: テスト — 認証バイパスバグの検出不能

#### 13. システムレス本文の絵文字プレフィックス乖離
- **問題ID**: ATK-001-2
- **対象**: レス削除 — コメント付き
- **ファイル**: `src/lib/services/admin-service.ts`, `features/step_definitions/admin.steps.ts`
- **詳細**: 実装は`🗑️ `プレフィックス付加、テストは`includes`双方向チェックで不一致を見逃す
- **影響**: シナリオと実装の乖離

#### 14. G1バイパス防止テストが不正コードパスを通過
- **問題ID**: ATK-009-3
- **対象**: 認証バイパス防止（G1）
- **ファイル**: `features/step_definitions/authentication.steps.ts`
- **詳細**: Given で`issueAuthCode`未呼出。`not_verified`ブランチではなく`not_found`パスを通過
- **影響**: テスト — G1振る舞い未検証

#### 15. G3テストがedge-token期限切れを未検証
- **問題ID**: ATK-010-2
- **対象**: edge-token有効期限切れ
- **ファイル**: `features/step_definitions/authentication.steps.ts`
- **詳細**: `edgeToken:null`（Cookie未送信）のみテスト。期限切れトークン提示のケースは未検証
- **影響**: テスト — ATK-010-1の設計欠陥をテストが検出不能

---

## 問題の分類

| カテゴリ | 件数 | 問題ID |
|---------|------|--------|
| セキュリティ | 3 | ATK-003-1, ATK-010-1, ATK-012-2 |
| データ整合性 | 2 | ATK-002-1, ATK-004-1 |
| 機能欠損 | 2 | ATK-006-1, ATK-006-2 |
| 入力検証 | 2 | ATK-005-3/006-3/007-1 (横断), ATK-002-2/008-1 (横断) |
| テスト構造 | 6 | ATK-001-1, ATK-001-2, ATK-003-2, ATK-003-3/004-2, ATK-009-3, ATK-010-2 |

## 却下の内訳

| 却下理由 | 件数 |
|---------|------|
| D-10 §1 設計方針（BDDはサービス層直接）| 3 |
| フレームワーク/インフラ層の責務 | 3 |
| 再現前提が不成立（コード誤読） | 3 |
| BDDスコープ外 / 設計トレードオフ | 4 |
| 理論的リスクで現実的再現条件なし | 4 |
