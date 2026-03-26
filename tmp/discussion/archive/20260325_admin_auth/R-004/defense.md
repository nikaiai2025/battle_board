# R-004 防御レポート

レビュアー: Blue Team
日時: 2026-03-25

---

## ATK-004-1

**判定**: ACCEPT

**根拠**:

攻撃者の指摘は正確である。

`supabase/migrations/00010_ban_system.sql:35` に `CONSTRAINT ip_bans_ip_hash_unique UNIQUE (ip_hash)` が定義されており、この制約は `is_active` の値に関わらずテーブル全体に適用される。

`IpBanRepository.deactivate`（`src/lib/infrastructure/repositories/ip-ban-repository.ts:152-161`）は `is_active = false` への論理削除のみを行い、物理削除は行わない。

`AdminService.banIpByUserId`（`src/lib/services/admin-service.ts:296-306`）は `IpBanRepository.create` を直接呼び出す前に、同一 `ip_hash` の非アクティブなレコードが存在しないかチェックしない。

結果として「BAN → 解除 → 再BAN」の操作で `IpBanRepository.create` が INSERT を発行した際に UNIQUE 制約違反が発生し、`throw new Error(...)` が伝播して `route.ts:107-113` の catch ブロックで 500 レスポンスが返る。

インメモリ実装（`features/support/in-memory/ip-ban-repository.ts:66-83`）は Map をキーとしたストアに `create` で直接追加するため、同一 `ipHash` の重複キーをチェックしない。BDD テストはグリーンのまま、本番の PostgreSQL 上でのみ破綻する。

**影響評価**: 管理者が特定IPを「BAN → 解除 → 再BAN」しようとすると 2 回目以降の BAN 操作が永続的に失敗する。実際の運用（荒らし対策等）では同一IPを複数回 BAN する操作は現実的に発生する。

---

## ATK-004-2

**判定**: ACCEPT

**根拠**:

攻撃者の指摘は正確である。

Given「ユーザー {string} が存在する」（`admin.steps.ts:823-844`）では以下の値が設定される。

- `user.authorIdSeed = "test-seed-${userName}"`
- `user.lastIpHash = "test-ip-hash-${userName}"`
- `namedUser.ipHash = user.authorIdSeed`（840行）= `"test-seed-${userName}"`

When「ユーザー {string} のIPをBANする」（`admin.steps.ts:1093-1115`）では `AdminService.banIpByUserId(namedUser.userId, ...)` を呼び出す。`banIpByUserId` は `user.lastIpHash`（= `"test-ip-hash-${userName}"`）を BAN リストに登録する（`admin-service.ts:296-300`）。

Then「IP BANリストに登録される」（`admin.steps.ts:1128-1140`）は `InMemoryIpBanRepo.listActive()` の件数が 1 件以上あることのみを確認する。

この構造では以下の乖離が発生している。

- BANリストに登録される ipHash: `"test-ip-hash-${userName}"`（`user.lastIpHash`）
- 書き込み時に `createPost` に渡される ipHash: `namedUser.ipHash = "test-seed-${userName}"`（`user.authorIdSeed`）

これらは別の値であるため、「BAN後にそのIPから書き込みを試みると拒否される」という経路がテストデータ上で一度も通らない。シナリオ「管理者がユーザーのIPをBANする」の Then は「INSERTが成功した」ことしか検証していない。

本番ではユーザーの書き込み時に `UserRepository.updateLastIpHash(userId, input.ipHash)` が呼ばれ（`post-service.ts:429`）、次の書き込み時の `input.ipHash`（リクエストの実IPハッシュ）と `lastIpHash` が一致するため動作する。しかしテストの構造的ミスにより、「BANされたIPからの書き込みが実際に拒否されること」を検証する経路がテストスイートに存在しない。

なお別シナリオ「BANされたIPからの書き込みが拒否される」（Given「ユーザー {string} のIPがBANされている」）では `namedUser.ipHash = ipHash`（`"test-ip-hash-banned-ip-${userName}"`）と BAN 登録の ipHash が一致するため（`admin.steps.ts:1158-1185`）、そちらのシナリオでの書き込み拒否テストは正しく動作している。問題は「管理者がユーザーのIPをBANする」シナリオのデータ設定のみに限定されている。

---

## ATK-004-3

**判定**: REJECT

**根拠**:

攻撃者は2つの問題を混在させているが、それぞれ異なる評価となる。

**第1点（lastIpHash が null の場合の失敗）**:

`AdminService.banIpByUserId` が `lastIpHash` が null のときに `{ success: false, reason: "no_ip_hash" }` を返すのは意図的な設計であり、APIも 400 を返す（`route.ts:91-96`）。書き込み前のユーザーをIPでBANできないという制約は、設計ドキュメント（`tmp/feature_plan_admin_expansion.md §2-d IP BAN 対象の特定方法`）に明示されており、`lastIpHash` はIPを特定する唯一の手段として採用された設計決定である。`no_ip_hash` エラーは 500 ではなく 400 で適切に処理されており、エラーハンドリングとしては正常である。BDDシナリオのスコープは「書き込み済みユーザーのIP BAN」であり、未書き込みユーザーをBANする振る舞いは定義されていない。

**第2点（動的IPによるBANの実質無効化）**:

この指摘は設計の限界を指摘したものであり、バグではなく既知のトレードオフである。設計上、`lastIpHash` は「BAN操作を実行した時点での最新のIPハッシュ」であり、動的IP環境ではBANが次のIPに追随しないことは設計の制約として認識されている（`post-service.ts:422-425` のコメント「管理者が「このIPをBAN」する際の最新IP特定に使用する」）。この問題の解決にはIPとユーザーを分離したより高度な追跡機構が必要であり、MVPスコープ外の機能拡張に相当する。再現条件（モバイル回線でBAN操作と書き込みの間にIPが切り替わる）は現実に起こりうるが、これはシステムのセキュリティ侵害やデータ損失を引き起こすものではなく、機能上の制約（BANが期待通り機能しない可能性がある）にとどまる。また BDD シナリオ「管理者がユーザーのIPをBANする」はこの動的IP追跡を受け入れ基準として定義していない。

以上の理由から ATK-004-3 全体は REJECT とする。ただし第2点は設計制約として認識・記録しておく価値はある。
