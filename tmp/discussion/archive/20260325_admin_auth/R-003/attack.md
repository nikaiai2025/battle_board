# R-003 攻撃レポート

レビュアー: Red Team
対象: ユーザーBAN（BAN/書き込み拒否/BAN解除）

---

## ATK-003-1

**重大度**: CRITICAL

**問題の要約**: BANされたユーザーは edge-token を持っているだけで書き込みチェックをすり抜けられる。

**詳細**:

`post-service.ts:381-395` のユーザーBANチェックは `resolveAuth` の戻り値 `authResult.userId` が存在する場合のみ実行される。`resolveAuth`（`post-service.ts:237-288`）は `verifyEdgeToken` を呼び出し、`verifyEdgeToken`（`auth-service.ts:157-190`）は edge_tokens テーブルで token を検索し、紐づくユーザーの `is_verified=true` を確認するだけで認証成功を返す。

問題は認証フローの順序にある。`resolveAuth` 内でユーザーの `isBanned` は一切参照されない。BANチェックは認証成功後の Step 2b で行われるが、Step 2b が機能するためには `authResult.userId` が非 null である必要がある。

BAN済みユーザーが有効な（`is_verified=true` の）edge-token を保持している場合、`verifyEdgeToken` は `userId` を返し、その `userId` を使って `isUserBanned` が呼ばれ正しく拒否される。これは正常動作に見える。

しかし、BAN済みユーザーが **edge-token を持たない状態**（または edge-token が失効した状態）で書き込みを試みた場合、`resolveAuth` は新規 `issueEdgeToken` → `issueAuthCode` を実行して `authRequired` を返す（`post-service.ts:251-258`）。この時点では `isBotWrite=false` なので IP BAN チェックは実行されるが、ユーザーBANチェックは実行されない。BANされた当該ユーザーは新しい edge-token を取得でき、メール認証を完了させれば再び書き込み可能になる。

さらに、`issueEdgeToken`（`auth-service.ts:206-228`）は IP BAN のみをチェックし（`auth-service.ts:212`）、ユーザーBANは確認しない。BAN済みユーザーが IP を変えれば完全に新規ユーザーとして再登録できる。

**再現条件**:
1. ユーザー UserA が BAN される
2. UserA の edge-token が失効（または削除）している
3. UserA が別の IP から書き込みを試みる → `issueEdgeToken` で新規 edge-token が発行される → 認証完了後に書き込み可能になる

---

## ATK-003-2

**重大度**: CRITICAL

**問題の要約**: 「BAN解除後に書き込みが可能になる」シナリオの Then ステップは実際の書き込みを試みず、フラグ確認だけでグリーンになる。

**詳細**:

シナリオ「管理者がユーザーBANを解除する」の Then `"ユーザー {string} の書き込みが可能になる"`（`admin.steps.ts:1064-1078`）は `InMemoryUserRepo.findById` で `isBanned === false` を確認するだけで終わる。`PostService.createPost` は一度も呼ばれない。

これは「書き込みが可能になる」という振る舞いを検証していない。実際に書き込みが成功するかどうかは検証されていない。

ATK-003-1 で指摘した通り、BAN解除後でも edge-token が edge_tokens テーブルに登録されていなければ書き込みは `authRequired` で弾かれる。BAN解除シナリオの Given `"ユーザー {string} がBANされている"`（`admin.steps.ts:917-939`）は `InMemoryUserRepo.create` でユーザーを作成するが、`InMemoryEdgeTokenRepo` には何も登録しない（`auth-service.ts:157-190` の `verifyEdgeToken` は edge_tokens テーブルを参照する）。

したがって実態は「BAN解除後もそのユーザーは edge-token を持たないため書き込みは認証要求で弾かれる」状態である可能性があるが、テストはフラグ確認のみなので検出できない。テストは実装上のバグを隠蔽している。

**再現条件**:
- BDD テスト「管理者がユーザーBANを解除する」がグリーンであるとき、BAN解除後のユーザーが実際に書き込みできるかを `PostService.createPost` で確認すると `authRequired` が返る（edge-token 未登録のため）

---

## ATK-003-3

**重大度**: HIGH

**問題の要約**: BANされたユーザーの書き込み拒否テストで渡される `ipHash` は実際の IP ハッシュではなく `authorIdSeed` であり、IP BAN チェックが意図しない値で評価される。

**詳細**:

Given `"ユーザー {string} がBANされている"`（`admin.steps.ts:917-939`）では、`namedUsers` への登録時に `ipHash: user.authorIdSeed` を設定している（`admin.steps.ts:935`）。`user.authorIdSeed` は `"test-seed-banned-UserA"` という固定文字列であり、`user.lastIpHash` として設定した `"test-ip-hash-banned-UserA"` とは異なる値である。

When `"ユーザー {string} がスレッドへの書き込みを試みる"`（`admin.steps.ts:953-996`）では `createPost` に `ipHash: namedUser.ipHash` を渡す（`admin.steps.ts:977`）。この値は `authorIdSeed` の `"test-seed-banned-UserA"` である。

`post-service.ts:344-352` の IP BAN チェックは `input.ipHash` = `"test-seed-banned-UserA"` に対して実行される。ところが `isBotWrite=false` かつ `edgeToken = user.authToken = "test-token-banned-UserA"` が渡されるため `resolveAuth` では `verifyEdgeToken("test-token-banned-UserA", ...)` が呼ばれる。しかし InMemoryEdgeTokenRepo にこの authToken は登録されていない（`issueEdgeToken` 経由で作成されたわけではないため）。結果として `verifyEdgeToken` は `not_found` を返し、`resolveAuth` は `issueEdgeToken(ipHash)` を呼び出す。

この時 `ipHash = "test-seed-banned-UserA"` で `issueEdgeToken` が呼ばれ、IP BAN チェックは `"test-seed-banned-UserA"` に対して実行される。このハッシュは ip_bans テーブルには登録されていないため IP BAN では弾かれない。最終的にユーザーBANで拒否されてテストはグリーンになるが、IP BAN チェックは実際に機能しているハッシュとは異なる値で評価されており、IP BAN と USER BAN の協調動作が検証されていない。

**再現条件**:
- Given `"ユーザー {string} がBANされている"` で作成されたユーザーが実際に書き込みを試みると、`ipHash` に `authorIdSeed` が使われるため IP BAN テーブルの照合キーが実装の想定（`lastIpHash`）と一致しない
