# R-002 Defense Report

Blue Team レビュー。対象: ログイン + edge-token継続性 + ログアウト + パスワード再設定シナリオ。

---

## ATK-002-1

**判定**: ACCEPT（部分同意）

**根拠**:

攻撃者の主張を分解すると2点ある。それぞれ個別に評価する。

### 論点1: 通常ログイン済みユーザーが recovery フローを経由せずに `/api/auth/update-password` でパスワード変更できる

これは **ACCEPT**。

`update-password/route.ts:76` は `AuthService.verifyEdgeToken(edgeToken, "")` を呼ぶ。`verifyEdgeToken` は edge-token の存在と `is_verified=true` のみを確認する（`auth-service.ts:157-190`）。recovery フロー経由か通常ログイン経由かを区別するフラグは edge_tokens テーブルにも users テーブルにも存在しない。

したがって、本登録済みユーザーが通常ログインで取得した edge-token を使って `POST /api/auth/update-password` を呼び出せば、パスワード再設定メールを受け取ることなくパスワードを変更できる。これは「パスワード再設定はメール本人確認を経由する」という設計意図に反する特権操作を許可している。

BDD テストはこの経路差異を検出できない。「メール内の再設定リンクをクリックする」ステップ（`steps.ts:2476`）は `handleRecoveryCallback()` を直接呼ぶだけであり、「通常ログインの edge-token では `/api/auth/update-password` が拒否されること」を検証するシナリオは存在しない。

### 論点2: 攻撃者が自分の edge-token で他人のパスワードを変更できる

これは **REJECT**。

`route.ts:86-88` は `authResult.userId`（verifyEdgeToken が返した本人の userId）を `updatePassword()` に渡す。攻撃者が自分の edge-token を使っても変更対象は「攻撃者自身」のアカウントに限定される。他人の userId を渡す手段はない。攻撃者シナリオのステップ2-3（自分の edge-token → 自分のパスワードが変わるだけ）は攻撃者自身が認めている通り安全である。

---

## ATK-002-2

**判定**: ACCEPT（部分同意）

**根拠**:

攻撃者の主張を分解すると2点ある。

### 論点1: メール確認リンクの並行クリックによる競合状態

これは **ACCEPT**（ただし影響は限定的）。

`completeRegistration()` は `updateSupabaseAuthId()` と `updatePatToken()` の2ステップに分割されており（`registration-service.ts:185-194`）、両者の間にアトミック性がない。`handleEmailConfirmCallback()` の冪等チェック（`registration-service.ts:216`）は `findBySupabaseAuthId()` で行われるが、Supabase の `verifyOtp` は同一 token_hash を1回しか受け付けないため、**現実の HTTP フローでは** 同一トークンが2つのリクエストで同時に verifyOtp を通過する確率は極めて低い。

ただし「ブラウザの多重クリック」という現実的なトリガーが存在し、ネットワーク遅延次第では2リクエストが競合し PAT が後勝ちで上書きされる可能性はゼロではない。この場合、先行リクエストに発行された edge-token は有効なまま残り、ユーザーが認識している PAT と DB 上の PAT が不一致になる。影響はデータ不整合（PAT 再発行で回復可能）にとどまり、セキュリティ侵害ではないが、BDD テストはこの並行ケースをカバーしていない。

### 論点2: `supabase_auth_id` の UNIQUE 制約違反が上位にそのまま伝播する

これは **ACCEPT**。

`user-repository.ts:402-408` の `updateSupabaseAuthId()` は Supabase の constraint violation を `throw new Error(...)` としてそのまま伝播させる（エラーコードや種別の判定なし）。同一 `supabase_auth_id` で2度目の本登録が試みられた場合（メール × Discord の競合など）、サービス層でハンドリングされずに 500 エラーとなる。BDD テストはこのエラーパスをカバーしていない。

---

## ATK-002-3

**判定**: REJECT

**根拠**:

攻撃者は「`auth.admin.updateUserById` が InMemorySupabaseClient のパスワードストアを更新しない可能性がある」と主張するが、これは事実に反する。

`features/support/in-memory/supabase-client.ts:206-223` の `updateUserById` 実装を確認すると、`supabaseAuthStore` を走査して対象ユーザーを探し、`attrs.password` が渡された場合はパスワードを更新して `supabaseAuthStore.set()` で書き戻している（`supabase-client.ts:211-213`）。

また `signInWithPassword`（`supabase-client.ts:138-153`）は `supabaseAuthStore` の `password` と照合する実装になっている。

つまり:
1. Given「パスワード再設定メールを受信している」で `_registerSupabaseUser(supabaseAuthId, TEST_EMAIL, TEST_PASSWORD)` が呼ばれ、ストアに初期パスワードが登録される（`steps.ts:2435`）
2. When「新しいパスワードを入力して確定する」で `updatePassword()` → `updateUserById()` → `supabaseAuthStore` のパスワードが `TEST_NEW_PASSWORD` に更新される
3. Then「新しいパスワードでログインできる」で `loginWithEmail(email, TEST_NEW_PASSWORD)` → `signInWithPassword` がストアと照合 → 更新後のパスワードで照合されるため成功する

このフローは実際にパスワード更新が機能していることを検証している。`updatePassword` が何もしなかった場合、ストアのパスワードは `TEST_PASSWORD` のままとなり、`loginWithEmail(email, TEST_NEW_PASSWORD)` は失敗してシナリオが RED になる。

「旧パスワードでのログイン失敗を検証していない」という指摘は正しいが、これは BDD シナリオ（`features/user_registration.feature`）に「旧パスワードでのログインが失敗すること」という Then が含まれていない問題であり、ステップ定義の実装問題ではない。BDD シナリオの追加・変更は人間の承認が必要（CLAUDE.md 禁止事項）なため、防御側の実装スコープ外である。テスト欠落はシナリオ設計レベルの課題として分離して扱うべきであり、現行実装のバグとして ACCEPT する理由にはならない。
