# R-004 攻撃レポート

レビュアー: Red Team
日時: 2026-03-25

---

## ATK-004-1

**重大度**: CRITICAL

**問題の要約**: IP BAN 解除後に同じIPを再BANしようとすると UNIQUE 制約違反で 500 エラーになり、以降その IP を永続的に BAN できなくなる。

**詳細**:

`ip_bans` テーブルには `CONSTRAINT ip_bans_ip_hash_unique UNIQUE (ip_hash)` が定義されている（`supabase/migrations/00010_ban_system.sql:35`）。この制約は `is_active` の値に関わらずテーブル全体でユニーク。

`IpBanRepository.deactivate` は `is_active = false` に更新するだけでレコードを物理削除しない（`src/lib/infrastructure/repositories/ip-ban-repository.ts:152-161`）。

`AdminService.banIpByUserId` は重複チェックをせず `IpBanRepository.create` を直接呼ぶ（`src/lib/services/admin-service.ts:296-306`）。

結果として:
1. `POST /api/admin/ip-bans` で IP X を BAN → `ip_hash = X` のレコード作成（`is_active = true`）
2. `DELETE /api/admin/ip-bans/{banId}` で解除 → `is_active = false` に更新（レコード残存）
3. 再度 `POST /api/admin/ip-bans` で IP X を BAN → `IpBanRepository.create` が `ip_hash = X` で INSERT → UNIQUE 制約違反 → `IpBanRepository.create` が `throw new Error(...)` → 500 レスポンス

この制約はインメモリ実装（`features/support/in-memory/ip-ban-repository.ts`）には存在しないため、BDD テストはグリーンのまま本番で破綻する。

**再現条件**: 管理者が同一ユーザー（または同一IPから登録した別ユーザー）に対して「IP BAN → 解除 → 再BAN」の操作を行うとき、2回目の BAN 操作が 500 エラーになる。

---

## ATK-004-2

**重大度**: HIGH

**問題の要約**: 「管理者がユーザーのIPをBANする」シナリオの BDD テストで、BAN に登録される ipHash と書き込み時にチェックされる ipHash が別の値を使用しており、BAN が実際に書き込みを拒否するかどうかを検証していない。

**詳細**:

`admin.steps.ts` の Given「ユーザー {string} が存在する」（823-844行）では:
- `user.authorIdSeed = "test-seed-${userName}"`
- `user.lastIpHash = "test-ip-hash-${userName}"`
- `namedUser.ipHash = user.authorIdSeed`（840行）→ `"test-seed-${userName}"`

When「ユーザー {string} のIPをBANする」（1093-1117行）では:
- `AdminService.banIpByUserId(namedUser.userId, ...)` を呼ぶ
- `banIpByUserId` 内: `user.lastIpHash`（= `"test-ip-hash-${userName}"`）を BAN リストに登録（`admin-service.ts:296`）

Then「IP BANリストに登録される」（1128-1142行）では:
- `InMemoryIpBanRepo.listActive()` に1件以上あるかだけ確認

つまりBANリストに登録された ipHash（`"test-ip-hash-${userName}"`）と、仮に続けて書き込みを試みたときに `createPost` に渡される ipHash（`namedUser.ipHash = "test-seed-${userName}"`）は **別の値**。このシナリオは「BANリストへの INSERT が成功した」ことしか検証しておらず、書き込みが実際に拒否されることを確認していない。

本番では `banIpByUserId` が登録する `lastIpHash` と次回書き込み時の現在 IP ハッシュは一致するが、テストデータの構造的な乖離（`authorIdSeed` と `lastIpHash` を別値にした状態で `namedUser.ipHash = authorIdSeed` とした）によってこの経路が一度も通らない状態でテストがパスしている。

**再現条件**: テストシナリオ「管理者がユーザーのIPをBANする」の Then ステップが通過するとき、`banIpByUserId` で登録したIPに対して書き込みを試みる後続テストを追加すれば、`namedUser.ipHash` のミスマッチにより書き込みが拒否されないことが判明する。

---

## ATK-004-3

**重大度**: HIGH

**問題の要約**: `AdminService.banIpByUserId` は `user.lastIpHash` が `null` の場合に `no_ip_hash` エラーで失敗するが、`lastIpHash` は書き込み時に初めて更新される設計のため、一度も書き込みしていないユーザーのIPを BAN できず、そのユーザーが書き込みを完了した直後に別 IP へ変わると実質的に BAN が不可能になる。

**詳細**:

`users.last_ip_hash` は書き込みリクエストのたびに `UserRepository.updateLastIpHash` で更新される（`post-service.ts:427-433`）。`UserRepository.create` には `lastIpHash` の初期値設定がなく（`supabase/migrations/00010_ban_system.sql:19` の `ALTER TABLE` 定義でも `DEFAULT` なし）、初回書き込み前は `null` のまま。

`AdminService.banIpByUserId` は `user.lastIpHash` が `null` の場合 `{ success: false, reason: "no_ip_hash" }` を返す（`admin-service.ts:292-294`）。API は `400` を返す（`route.ts:91-96`）。

また `lastIpHash` は「最後に書き込んだリクエストのIPハッシュ」であり、管理者がBANしようとした時点から次に別IPで書き込みを行うまでの間しか最新状態を反映しない。動的IP環境では次の書き込みで `lastIpHash` が更新されてしまうと BANしたIPと実際の現在IPが乖離し、BANが機能しなくなる（管理者が気づかないまま「BANした」と思い込む）。

`IpBanRepository.isBanned` は書き込み時の `input.ipHash`（現在の実リクエストIPハッシュ）でチェックするため（`post-service.ts:345`）、`lastIpHash` が古い値の場合、BAN は登録されていても実際の書き込みは通過する。

**再現条件**: モバイル回線等でIPが動的に変わるユーザーに対して「管理者がIPをBANする」を実行するとき、BAN操作と書き込みの間にIPが切り替わった場合、BANは `lastIpHash`（旧IP）に対して登録されるが、次の書き込みは新しいIPで行われるため `isBanned` チェックを通過し書き込みが成功する。
