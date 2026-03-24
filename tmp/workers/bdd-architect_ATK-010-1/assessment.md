# ATK-010-1 セキュリティ評価: edge-tokenの有効期限欠如

作成日: 2026-03-25
担当: bdd-architect

---

## 1. 調査結果

### 1.1 スキーマ確認（`edge_tokens` テーブル）

`supabase/migrations/00006_user_registration.sql` より:

```sql
CREATE TABLE edge_tokens (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id),
  token        VARCHAR      NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

**確認**: `expires_at` カラムは存在しない。`last_used_at` は記録されるが、有効期限検証には使用されていない。後続の全マイグレーション（00007〜00030）にも `edge_tokens` への `expires_at` 追加は存在しない。

### 1.2 `verifyEdgeToken` の検証ロジック

`src/lib/services/auth-service.ts` より、検証条件は以下の2つのみ:

1. `edge_tokens` テーブルにトークンが存在する（`findByToken` で `null` でない）
2. `users.is_verified = true`

有効期限チェックは存在しない。

### 1.3 `issueEdgeToken` の発行ロジック

`expires_at` を設定する処理なし。発行時は `created_at` / `last_used_at` のみDBデフォルトで記録される。

### 1.4 Cookie側の有効期限

各ルートハンドラ（`/api/auth/verify/route.ts`, `/api/threads/.../posts/route.ts`, 等）では `maxAge: 60 * 60 * 24 * 365`（365日）を設定している。Cookie が期限切れになってもDBレコードは残存する。

---

## 2. 判定

**対応推奨**（CRITICALではなく「推奨」）

---

## 3. 判定根拠

### 3.1 なぜCRITICALではないか（本サービスの性質を踏まえた評価）

edge-tokenは **「匿名ユーザーがTurnstile認証済みであることを示す書き込み資格証」** であり、ログインセッショントークンとは本質的に異なる。

| 比較軸 | ログインセッショントークン | edge-token（本サービス） |
|---|---|---|
| 保護対象資産 | アカウント・個人情報・課金データ | 匿名書き込み資格（CAPTCHA通過証明） |
| 盗難時の実害 | なりすまし・不正課金・情報漏洩 | 他者の代わりに匿名で書き込める |
| 本人確認との結合 | 強（メール/パスワードで本人確定） | 弱（匿名、IPベースのseedのみ） |
| 代替入手コスト | 高（パスワード奪取が必要） | 低〜中（Turnstileを通過すれば新規発行可能） |

盗難されても「攻撃者が匿名掲示板に書き込める」のみであり、個人情報の漏洩や金銭的被害には直結しない。管理者による `users.is_banned = true` でユーザー単位の書き込みを即時停止できる既存の失効手段も存在する。

よって、一般的なセッショントークン盗難と同等のCRITICAL評価は過剰である。

### 3.2 なぜ「対応推奨」か（無視すべきでない理由）

以下の問題は実在する:

**問題1: DBレコードが無期限に増加する**
ユーザーがCookieを削除・期限切れにして再認証を繰り返しても、古い `edge_tokens` レコードは削除されない（ログアウト時の `deleteByToken` が呼ばれない限り残存）。長期運用でDBが肥大化する。

**問題2: 状態遷移仕様との不整合**
`docs/specs/user_state_transitions.yaml` には:
```yaml
- from: authenticated
  to: unauthenticated
  trigger: edge-token期限切れ / Cookie削除
```
と定義されているが、「edge-token期限切れ」はCookieの期限切れを指しているのみで、DBレコード側に対応する有効期限制御が存在しない。仕様とDB設計に不整合がある。

**問題3: 長期放置トークンのリスク**
365日後にCookieが失効してもDBレコードは残る。盗難（例: 通信経路での傍受、ブラウザ拡張機能による漏洩）が発生してからユーザーが気づくまでの期間が無制限になる。`last_used_at` は記録されているため、「長期未使用トークンの自動失効」は低コストで実装できる。

---

## 4. 修正方針（対応推奨）

### 方針A: `last_used_at` を用いた非アクティブ失効（推奨）

`expires_at` カラムを追加せず、`last_used_at` の閾値チェックで対応する。

- `verifyEdgeToken` に「最終使用から N 日超過なら無効」のチェックを追加（N = 180日程度を推奨）
- 認証成功時に `updateLastUsedAt` を呼び出す（現在 `EdgeTokenRepository.updateLastUsedAt` は実装済みだが未呼出しのため、呼び出しを追加）
- 定期的（GitHub Actions cron）に N 日以上未使用のレコードを削除するジョブを追加

**利点**: スキーマ変更不要。既存の `last_used_at` インフラを活用できる。

### 方針B: `expires_at` カラム追加（代替案）

マイグレーションで `expires_at TIMESTAMPTZ` を追加し、`verifyEdgeToken` で期限チェック。

**欠点**: スキーマ変更マイグレーションが必要。既存全レコードへのバックフィルが必要。`issueEdgeToken` および `EdgeTokenRepository.create` の変更も必要で変更箇所が多い。

### 推奨: 方針Aを採用し、N=180日で実装

理由: 本サービスのedge-tokenはCookieと同期することが前提の設計であり、「アクティブユーザーのトークンは常にlast_used_atが更新される」という不変条件を明示的に活用できる。BDDシナリオへの影響（振る舞いの変化）は最小限（既存の認証成功フローに `updateLastUsedAt` 呼び出しが加わるのみ）。

---

## 5. 関連ファイル

| ファイル | 変更の要否 |
|---|---|
| `supabase/migrations/` | 方針Aなら不要、方針Bなら新規マイグレーション追加 |
| `src/lib/services/auth-service.ts` | `verifyEdgeToken` に非アクティブチェック追加、`updateLastUsedAt` 呼び出し追加 |
| `src/lib/infrastructure/repositories/edge-token-repository.ts` | 方針Aなら変更不要（`updateLastUsedAt` は実装済み） |
| `.github/workflows/` | 期限切れレコード削除cronジョブ追加 |
| `docs/specs/user_state_transitions.yaml` | 「edge-token期限切れ」の定義をDBレベルでの失効と整合させる（記述の明確化） |
