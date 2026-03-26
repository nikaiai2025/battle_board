# R-010 防御レポート

## ATK-010-1: edge-token に有効期限がなく、盗難トークンが永続的に有効

### 判定: ACCEPT

### 根拠

攻撃レポートの指摘は事実である。

`EdgeTokenRow`（`src/lib/infrastructure/repositories/edge-token-repository.ts` L27-33）に `expires_at` カラムが存在しない。`verifyEdgeToken`（`src/lib/services/auth-service.ts` L157-190）は `is_verified=true` の確認のみで認証を成立させ、時間ベースの有効期限チェックを行わない。

コードコメント（auth-service.ts L16-19）には「IP 一致チェックは廃止。モバイル回線等の IP 変動時の再認証問題を解消」と設計意図が明記されており、IP 変動対応として意図的な設計変更である。しかし、IP チェックを廃止する代替として有効期限が導入されていない。

**再現条件の現実性:**
- ネットワーク盗聴（HTTP 環境）、XSS、端末奪取などによるトークン窃取は、設計として HttpOnly Cookie を使用している（route.ts L129-134）ため XSS 経由は困難だが、端末奪取や MITM（非 HTTPS 環境）では成立する
- 正規ユーザーがパスワード変更してもトークンは失効しないのは仕様上の欠陥である（パスワード変更による無効化が本システムでは Supabase Auth セッションに対してのみ行われ、edge-token には伝播しない）

**影響範囲:** セキュリティ侵害（永続的な不正書き込み・なりすまし）。テスト未検出。

---

## ATK-010-2: G3 シナリオは「Cookie が届かない」だけをテストしており、DBトークンの期限切れを検証していない

### 判定: ACCEPT

### 根拠

攻撃レポートの指摘は正確である。

BDD ステップ定義（`features/step_definitions/authentication.steps.ts` L996-1003）では `edgeToken: null` を渡してシナリオを成立させている。L1000 のコメント「Cookie期限切れ」という説明と実装内容が乖離している。

BDD シナリオの文言「edge-token Cookieの有効期限が切れると再認証が必要になる」が意図する受け入れ基準は「有効期限を過ぎた DB レコードを提示した際に認証が拒否されること」であるが、実装されているのは「Cookie 自体が存在しない場合に新規 edge-token が発行されること」という別の正常系である。

`null` を渡した場合、`resolveAuth`（post-service.ts L252-258）は `edgeToken === null` 分岐に入り新規発行フローを起動する。これは期限切れトークン（値は存在するが時刻超過）の拒否とは異なるコードパスである。

ATK-010-1 で指摘される有効期限ロジック自体が存在しないため、期限切れを持つトークン値を渡してもそのまま `is_verified=true` として認証される。このパスはいかなるテストでも検証されていない。

**影響範囲:** テストが受け入れ基準を正しく検証しておらず、ATK-010-1 の欠陥を隠蔽している。

---

## ATK-010-3: `isBotWrite=true` が任意の外部 IP からの IP BAN を完全に回避する

### 判定: REJECT

### 根拠

攻撃レポートの前提条件（「API ルートが `isBotWrite` をクライアント入力から受け取ることが前提」）が成立しない。

一般ユーザー向けの書き込みエンドポイントである `POST /api/threads/{threadId}/posts`（`src/app/api/threads/[threadId]/posts/route.ts` L106-112）は、リクエストボディから `body` のみを受け取り、`isBotWrite: false` をハードコードして `PostService.createPost` に渡す。クライアントがリクエストボディに `isBotWrite: true` を含めても、ルートハンドラーはこれを一切参照しない。

専ブラ互換エンドポイント（`src/app/(senbra)/test/bbs.cgi/route.ts` L541）も同様に `isBotWrite: false` をハードコードしている。

`isBotWrite: true` で呼ばれる経路は以下のみである:
- `POST /api/internal/bot/execute` — Bearer 認証（`BOT_API_KEY`）で保護されたサーバー内部 API
- `POST /api/internal/newspaper/complete` — Bearer 認証（`BOT_API_KEY`）で保護されたサーバー内部 API
- `PostService` 内部からの再帰呼び出し（welcome メッセージ投稿等）

いずれも外部クライアントが `isBotWrite: true` を注入できる経路ではない。サービス層の `isBotWrite` フラグはサーバーサイドの呼び出し元が制御しており、クライアント入力は到達不能である。

**結論:** 攻撃シナリオの前提条件が本番環境では成立しないため、現状の実装ではこの攻撃は実現不可能である。`PostInput` 型の設計として `isBotWrite` がサービス層のインターフェースに露出している点は設計上の懸念ではあるが、API 境界での遮断が確立されているため本番到達不能と判定する。
