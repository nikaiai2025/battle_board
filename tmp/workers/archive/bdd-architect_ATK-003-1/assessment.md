# ATK-003-1 セキュリティアセスメント
## BAN済みユーザーがedge-token再取得でBANを回避できる問題

作成日: 2026-03-25

---

## 1. 問題の実在確認

**実在する。** コードを直接トレースして確認した。

---

## 2. 攻撃フローのトレース

### 前提状態
- ユーザー（userId=X）が users.is_banned=true にされている
- ユーザーが保持する edge-token は Cookie に残っている

### 通常フロー（BAN有効時）

```
POST /api/post
  → resolveAuth(edgeToken, ipHash, false)
    → AuthService.verifyEdgeToken(edgeToken, ipHash)
      → EdgeTokenRepository.findByToken(edgeToken)  → hit
      → UserRepository.findById(userId=X)           → hit, isBanned=true
      → user.isVerified チェック                    → true (通過)
      → return { valid: true, userId: X, ... }      ← BAN未チェック
  → authResult.authenticated = true
  → Step 2b: AuthService.isUserBanned(userId=X)    → true
  → return USER_BANNED  ← ここで正しく拒否される
```

通常の edge-token 所持状態では BAN が正しく機能する。

### BANを回避する攻撃フロー

```
1. BAN済みユーザーが Cookie から edge-token を削除（またはブラウザを変える）

2. POST /api/post（edge-token: null）
     → resolveAuth(null, ipHash, false)
       → edge-token が null → "not_found" パスへ
       → AuthService.issueEdgeToken(ipHash)
           → IpBanRepository.isBanned(ipHash)  ← IP BAN のみチェック
           → IP BANされていなければ通過
           → 新規ユーザーレコード（users）を CREATE  ← 新しい userId=Y を生成
           → EdgeTokenRepository.create(userId=Y, newToken)
           → return { token: newToken, userId: Y }  ← 新規発行成功
       → AuthService.issueAuthCode(ipHash, newToken)
       → return { authenticated: false, authRequired: { edgeToken: newToken } }

3. Turnstile 認証を通過する（新しい edge-token を verified に）

4. 新しい edge-token で POST /api/post
     → resolveAuth(newToken, ipHash, false)
       → verifyEdgeToken → userId=Y, isBanned=false  ← 新規ユーザーなので BAN なし
     → Step 2b: isUserBanned(userId=Y) → false
     → 書き込み成功  ← BANを回避
```

### 根本原因

`issueEdgeToken` はユーザー新規作成関数であるため、呼ばれるたびに新しい userId が生成される。
ユーザー BAN は userId に紐づくため、新しい userId では BAN 状態が引き継がれない。
IP BAN であれば `issueEdgeToken` 内でブロックできるが、ユーザー BAN は IP BAN と独立した概念であり、
IP BAN チェックでは代替できない。

---

## 3. 影響範囲の評価

| 観点 | 評価 |
|---|---|
| 攻撃難易度 | **低い**。Cookie を削除するだけで再現する。技術知識は不要 |
| 効果の持続性 | 再度 Turnstile を通過するだけで恒久的に回避できる |
| IP BAN による緩和 | IP BAN を同時に実施すれば `issueEdgeToken` でブロックできる。しかし現状の UI/運用でユーザー BAN と IP BAN が常にセットで実施される保証はない |
| BDDシナリオとの乖離 | `features/admin.feature` "BANされたユーザーの書き込みが拒否される" の受け入れ基準を満たしていない（edge-token 再取得後の書き込みを拒否するシナリオが存在しないため、既存テストはパスするが、攻撃は通る） |

---

## 4. 判定

**対応必須（CRITICAL）**

BAN 機能は管理上の安全弁であり、ユーザーが自力でゼロコスト回避できる状態は機能として成立していない。

---

## 5. 修正方針

### 方針: `issueEdgeToken` 呼び出し前に同一 IP のBAN済みユーザー存在チェックを追加する

`resolveAuth` の `not_found` パス（edge-token が null / not_found のとき）で `issueEdgeToken` を呼ぶ前に、
当該 IP の `authorIdSeed`（= ipHash）に紐づく BAN 済みユーザーが存在するか確認する。

```
resolveAuth の not_found パス:
  1. UserRepository.findBannedByAuthorIdSeed(ipHash) で BAN 済みユーザーを検索
  2. 存在すれば { success: false, code: "USER_BANNED" } を返す（issueEdgeToken は呼ばない）
  3. 存在しなければ現行通り issueEdgeToken → issueAuthCode
```

#### トレードオフ

- **長所**: 最小変更。issueEdgeToken に変更を加えず、呼び出しの手前でガードする
- **短所**: `authorIdSeed` は IPv6 /48 で縮約されているため、同一プレフィックスの別ユーザーが誤ってブロックされるリスクがある。ただしこのリスクは IP BAN でも同様であり、既存設計上の受け入れ済み制約である

#### 代替案（不採用）

- `issueEdgeToken` 内にユーザー BAN チェックを追加する案: `issueEdgeToken` の責務は「新規ユーザー作成の前提チェック」であり、引数が ipHash のみのため既存ユーザーの BAN 状態を確認できない。責務の混乱を避けるため `resolveAuth` 側でガードする方が適切
- `verifyEdgeToken` で BAN チェックを追加する案: 既存 edge-token 経由の BAN は現時点で正しく機能しているため変更不要

### 必要な実装変更

1. `UserRepository`: `findBannedByAuthorIdSeed(authorIdSeed: string): Promise<User | null>` を追加
2. `PostService.resolveAuth`: `not_found` パスの 2 箇所（edgeToken=null 分岐、not_found reason 分岐）に上記チェックを挿入
3. BDDシナリオ: `features/admin.feature` に「BAN済みユーザーが edge-token を削除して再取得しても書き込みが拒否される」シナリオを追加（人間の承認が必要）

### 優先度

BAN 機能を実装済みの現スプリントでただちに対応すること。スプリントをまたぐ対応は非推奨。
