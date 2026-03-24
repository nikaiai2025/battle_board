# R-003 防御レポート

レビュアー: Blue Team
対象: ユーザーBAN（BAN/書き込み拒否/BAN解除）

---

## ATK-003-1

**問題ID**: ATK-003-1
**判定**: ACCEPT

**根拠**:

攻撃者の指摘は本質的に正しい。ただし、実際の動作メカニズムは指摘と異なるため、影響範囲を正確に評価する。

### 動作の実態

BAN済みユーザーが edge-token を持たない（または edge-token が失効した）場合のフローを追う。

1. `post-service.ts:344` でIP BANチェック → ip_bans に登録なければ通過
2. `post-service.ts:367` で `resolveAuth(edgeToken=null, ...)` を呼ぶ
3. `resolveAuth:252-258` が `issueEdgeToken(ipHash)` を呼ぶ
4. `issueEdgeToken:212` はIP BANのみチェックし、ユーザーBANは確認しない
5. `issueEdgeToken` は新規ユーザーを作成し（`UserRepository.create`）、新しい edge-token を発行する
6. `resolveAuth` は `authenticated: false` を返す → `authRequired` 応答
7. 次に新規 edge-token でメール認証を完了させれば `is_verified=true` になる
8. 再書き込み時、`verifyEdgeToken` は**新規ユーザー**の userId を返す
9. `post-service.ts:386` の `isUserBanned(userId)` は新規ユーザーの `isBanned=false` を参照する → 書き込み成功

### 結論

「BAN済みユーザーが edge-token を持つ場合」は正しく拒否される。しかし「BAN済みユーザーが同一 IP から edge-token なしで書き込む場合」は、`issueEdgeToken` がユーザーBANを確認しないため、**全く別の新規ユーザーとして再登録**され、書き込みが通る。

さらに攻撃者が指摘する通り、IP を変えれば IP BAN を受けていなければ無条件に新規ユーザーとして登録できる。これは BAN の実効性を根本的に損なう。

### 影響

- **BAN回避の難易度**: 低。edge-token Cookie を削除するだけで再登録が始まる
- **範囲**: ユーザーBANはアカウント単位でしか機能せず、デバイス・IPの変更で即座に無効化される
- **防御コードの不在**: `issueEdgeToken` にユーザーBAN確認のコードは存在しない

### テストでの検出状況

BDDテスト（`admin.steps.ts:917-939`）では `InMemoryUserRepo.create` でユーザーを作成するが、`InMemoryEdgeTokenRepo` への登録を行わない。このため `namedUser.edgeToken` (`"test-token-banned-UserA"`) は edge_tokens ストアに存在せず、`verifyEdgeToken` は `not_found` を返す → `issueEdgeToken` が呼ばれる。`ipHash = "test-seed-banned-UserA"` はIP BANされていないため `issueEdgeToken` は成功し、`authRequired` が返る。テストは `AUTH_REQUIRED` を `type: "error"` として検出してグリーンになるが、これは `USER_BANNED` ではない。ユーザーBANが機能したからではなく、認証フローが起動したからグリーンになっている。

---

## ATK-003-2

**問題ID**: ATK-003-2
**判定**: ACCEPT

**根拠**:

Then `"ユーザー {string} の書き込みが可能になる"` の実装（`admin.steps.ts:1064-1078`）は以下のみを行う。

```typescript
const user = await InMemoryUserRepo.findById(namedUser.userId);
assert.strictEqual(user.isBanned, false, ...);
```

`PostService.createPost` は一切呼ばれない。シナリオ名「書き込みが可能になる」という振る舞いの確認が、フラグの確認に矮小化されている。

### ATK-003-1との連鎖

ATK-003-1で示した通り、`InMemoryEdgeTokenRepo` には BAN済みユーザーの edge-token が登録されていない。BAN解除後に `createPost` を呼んでも `verifyEdgeToken` は `not_found` → `authRequired` が返り、書き込みは実際にはできない。このため**テストを強化すると逆にレッドになる**という状況にある。

テストが書き込み成功の振る舞いを検証していないため、BAN解除後の実際の書き込み可否がバグを含んでいても検出されない。

### 影響

- テストは「BAN解除後に実際に書き込みが成功すること」を保証しない
- 万一 `unbanUser` のロジックにバグがあっても（例: フラグ更新のコミット失敗、wrong userId）、フラグ確認が通れば検出されない

---

## ATK-003-3

**問題ID**: ATK-003-3
**判定**: ACCEPT

**根拠**:

`namedUsers` への登録時（`admin.steps.ts:932-938`）:

```typescript
this.setNamedUser(userName, {
    userId: user.id,
    edgeToken: user.authToken,          // "test-token-banned-UserA"
    ipHash: user.authorIdSeed,          // "test-seed-banned-UserA"  ← 問題箇所
    ...
});
```

ユーザー作成時の値は:
- `authorIdSeed`: `"test-seed-banned-UserA"`（`ipHash` として `namedUser` に格納）
- `lastIpHash`: `"test-ip-hash-banned-UserA"`（格納されない）

書き込み時（`admin.steps.ts:977`）に `ipHash: namedUser.ipHash` = `"test-seed-banned-UserA"` が渡される。

IP BANチェック（`post-service.ts:345`）は `"test-seed-banned-UserA"` に対して実行される。このハッシュは ip_bans テーブルに登録されていないため通過する。

### 現実の本番環境との乖離

本番では:
- `authorIdSeed` = リクエスト元IPハッシュ（ユーザー識別子）
- `lastIpHash` = 書き込み時の最新IPハッシュ（IP BAN の照合キー）

これら2つが設計上別の値になりうる（例: IP変動後のユーザー）。テストで `ipHash` として `authorIdSeed` を使うのは概念的な誤りであり、IP BAN チェックの照合キーが実装の想定と一致しない。

### 影響

IP BAN とユーザー BAN の協調動作（「IP BAN されかつユーザーBANもされたユーザーが書き込む場合の拒否経路」）がテストで検証されていない。IP BAN チェックが `authorIdSeed` で実行される結果、IP BANが効いているかどうかはテストから判定できない。
