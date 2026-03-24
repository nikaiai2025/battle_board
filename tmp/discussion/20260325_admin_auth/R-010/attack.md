# R-010 攻撃レポート

## ATK-010-1 [CRITICAL] edge-token に有効期限がなく、盗難トークンが永続的に有効

### 重大度
CRITICAL

### コード箇所
- `src/lib/infrastructure/repositories/edge-token-repository.ts` — `EdgeTokenRow` の定義（L27-33）、`findByToken`（L115-128）
- `src/lib/services/auth-service.ts` — `verifyEdgeToken`（L157-190）

### 問題
`edge_tokens` テーブルに `expires_at` カラムが存在せず、`EdgeTokenRow` にも有効期限フィールドがない。`verifyEdgeToken` は「レコード存在 + `is_verified=true`」のみで認証を通す。したがって、一度 Turnstile を通過した edge-token は**DB から削除されない限り永久に有効**である。

### 再現条件
1. 攻撃者がネットワーク盗聴・XSS・端末奪取などで Cookie の `edge-token` 値を入手する
2. 盗んだトークンで `POST /api/posts` を呼び出す
3. `verifyEdgeToken` がレコードを検索し `is_verified=true` を確認 → 認証成功
4. 正規ユーザーがパスワードを変更しても、ログアウト操作をしない限りトークンは失効しない

---

## ATK-010-2 [CRITICAL] G3 シナリオは「Cookie が届かない」だけをテストしており、DBトークンの期限切れを検証していない

### 重大度
CRITICAL

### コード箇所
- `features/step_definitions/authentication.steps.ts` — `"edge-token Cookieの有効期限が切れた後に書き込みを行う"` ステップ（L982-1021）
- 対応 BDD シナリオ: `edge-token Cookieの有効期限が切れると再認証が必要になる`

### 問題
G3 の When ステップは `edgeToken: null` を `createPost` に渡すことで期限切れを模倣している（L1000 コメント「Cookie期限切れ」）。これは「ブラウザが Cookie を送信しなかった」ケースのテストであり、**DB 上の edge-token レコードが依然として有効な状態**でシナリオが成立する。

BDD シナリオの意図（「有効期限が切れると再認証が必要になる」）は、サービス層で期限切れを検出して拒否することを受け入れ基準としているが、実装側には期限判定ロジックが存在しない（ATK-010-1 参照）。

テストは「null トークン → 新規発行フロー起動」という別の正常系を通過しているだけであり、**有効期限切れトークンを提示された場合に認証が拒否されるか否かは一度も検証されていない**。

### 再現条件
1. `edge-token` を Cookie に入れたまま `POST /api/posts` を送信する（期限が過ぎているとしても）
2. `verifyEdgeToken` は期限チェックを行わないので認証成功
3. G3 テストは `edgeToken: null` を送るシナリオなので、このパスを通らずグリーンのまま残る

---

## ATK-010-3 [HIGH] `isBotWrite=true` が任意の外部 IP からの IP BAN を完全に回避する

### 重大度
HIGH

### コード箇所
- `src/lib/services/post-service.ts` — Step 0b（L339-353）
- `src/lib/services/post-service.ts` — `resolveAuth`（L245-249）

### 問題
`createPost` の IP BAN チェック（Step 0b）は `!input.isBotWrite` を条件に持ち、`isBotWrite=true` の場合は **IP BAN チェックと edge-token 検証の両方をスキップ**して `authenticated: true` を直ちに返す（`resolveAuth` L247-249）。

`isBotWrite` フラグはリクエスト入力（`PostInput`）から来る。API ルート層がこのフラグを検証なしで受け入れた場合、クライアントは `isBotWrite: true` を指定するだけで IP BAN をバイパスして書き込める。加えて、ユーザー BAN チェック（Step 2b）も `!input.isBotWrite && authResult.userId` が条件なので同様にスキップされる。

### 再現条件
1. BAN 対象の IP または BAN 対象ユーザーが、リクエストボディに `isBotWrite: true` を付与して `POST /api/posts` を呼び出す
2. Step 0b の IP BAN チェックが `if (!input.isBotWrite)` でスキップされる
3. `resolveAuth` が `isBotWrite=true` で即座に `authenticated: true` を返す
4. Step 2b のユーザー BAN チェックも `!input.isBotWrite` の条件でスキップされる
5. 書き込みが成功する（再現のためには API ルートが `isBotWrite` をクライアント入力から受け取ることが前提）
