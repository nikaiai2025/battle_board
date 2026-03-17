# D-08 コンポーネント境界設計書: Admin（管理）

> ステータス: 運用中
> 関連D-07: SS 3.2 AdminService / SS 5.3 管理者認証

---

## 1. 分割方針

管理者操作（レス削除・スレッド削除・ユーザーBAN・IP BAN・通貨付与・ユーザー管理・ダッシュボード）はセキュリティ上の分離が必要なため、一般ユーザー向けのコンポーネントと明確に境界を引く。管理者認証はAuthServiceに委譲するが、認可（「この操作を管理者だけに許可する」）はAdminServiceが担う。

MVPスコープでは管理者はシステム運営者のみ（エンドユーザーには管理権限を与えない）。

---

## 2. 公開インターフェース

### 2.1 削除操作

```
deletePost(postId: UUID, adminId: UUID, reason?: string, comment?: string): DeletePostResult
deleteThread(threadId: UUID, adminId: UUID, reason?: string): DeleteThreadResult
```

削除はソフトデリート（`is_deleted = true` フラグを立てる）のみ。物理削除は行わない。
deletePost は削除後に「★システム」名義の独立システムレスを挿入する（方式B）。comment 指定時はその内容を表示し、未指定時はフォールバックメッセージを使用する。

### 2.2 BAN操作

```
banUser(userId: UUID, adminId: UUID): BanUserResult
unbanUser(userId: UUID, adminId: UUID): BanUserResult
banIpByUserId(userId: UUID, adminId: UUID, reason?: string): BanIpResult
unbanIp(banId: UUID, adminId: UUID): UnbanIpResult
listActiveIpBans(): IpBan[]
```

- `banUser` / `unbanUser`: ユーザーの `is_banned` フラグを更新する。BANされたユーザーは書き込みが拒否される。
- `banIpByUserId`: 対象ユーザーの `last_ip_hash` を ip_bans テーブルに登録する。管理者にIPハッシュを直接扱わせず userId で間接指定する。
- `unbanIp`: IP BAN レコードの `is_active` を false に更新する（論理削除）。
- `listActiveIpBans`: 有効な IP BAN 一覧を返す（管理画面用）。

### 2.3 通貨付与

```
grantCurrency(userId: UUID, amount: number, adminId: UUID): GrantCurrencyResult
```

CurrencyService.credit を `admin_grant` reason で呼び出す。amount は正の整数であること。成功時は付与後残高を返す。

### 2.4 ユーザー管理

```
getUserList(options?: { limit?: number, offset?: number, orderBy?: 'created_at' | 'last_post_date' }): { users: User[], total: number }
getUserDetail(userId: UUID): UserDetail | null
getUserPosts(userId: UUID, options?: { limit?: number, offset?: number }): Post[]
```

- `getUserList`: ページネーション付きユーザー一覧。管理画面のユーザー一覧ページで使用。
- `getUserDetail`: ユーザー基本情報 + 通貨残高 + 書き込み履歴（最新50件）を集約して返す。
- `getUserPosts`: ユーザーの書き込み履歴（created_at DESC）。ページネーション対応。

### 2.5 ダッシュボード

```
getDashboard(options?: { today?: string }): DashboardSummary
getDashboardHistory(options?: { days?: number, fromDate?: string, toDate?: string }): DailyStat[]
```

- `getDashboard`: 本日分のリアルタイムサマリー（総ユーザー数・本日書き込み数・アクティブスレッド数・通貨流通量）。リポジトリから直接集計。
- `getDashboardHistory`: daily_stats テーブルのスナップショットを期間指定で返す（stat_date ASC）。本日分はリアルタイム集計のため getDashboard を参照する。

### 2.6 将来拡張（未実装）

```
getDeletedPosts(threadId: UUID): Post[]    // 管理画面用（削除済み含む全件）
getAuditLog(limit: number): AuditLog[]     // 操作履歴
```

一般ユーザー向けAPIが `is_deleted = false` のみを返すのに対し、管理画面用クエリは削除済みを含む全件を返す。この違いはRepository層のクエリパラメータで表現する（AdminService専用のRepositoryを作るのではなく、既存PostRepository/ThreadRepositoryにフラグを渡す）。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| PostRepository | `is_deleted` フラグ更新・著者別検索・日付別集計・アクティブスレッド集計 |
| ThreadRepository | `is_deleted` フラグ更新 |
| UserRepository | `is_banned` フラグ更新・ユーザー検索・一覧取得 |
| CurrencyRepository | 全ユーザー残高合計の集計 |
| IpBanRepository | IP BAN の作成・解除・一覧取得・BAN判定 |
| DailyStatsRepository | 日次統計スナップショットの期間取得 |
| CurrencyService | 通貨付与（credit）・残高取得（getBalance） |
| PostService | 削除時のシステムレス挿入（createPost） |
| AuditLogRepository | 管理操作の記録（将来: 当初は簡易ログのみ） |

### 3.2 被依存

```
AdminAPIRoute  →  AdminService
```

一般ユーザー向けAPIからAdminServiceへの呼び出しは禁止。

---

## 4. 隠蔽する実装詳細

- 管理者認証の実体（admin_session Cookie の検証）はAPIルートで行い、AdminServiceには到達前に保証されている
- 削除済みレスの表示文字列（「このレスは削除されました」）はUIの責務。AdminServiceはフラグを立てるだけ
- IP BAN は ip_hash（SHA-512ハッシュ値）で管理され、生IPは保存しない。APIレスポンスにも ip_hash は含めない
- ダッシュボードの本日分集計はリポジトリから直接取得し、過去分は daily_stats テーブルのスナップショットを使用する

---

## 5. 設計上の判断

### 認証と認可の分離

AdminAPIRouteが「管理者セッション（admin_session Cookie）の検証」を行い、検証済みの `adminId` をAdminServiceに渡す。AdminServiceは「渡されたadminIdが有効な管理者であること」を前提とし、再検証は行わない。APIルートで必ず検証される保証があるため二重チェック不要。

### ソフトデリートのみ（物理削除なし）

削除後に参照整合性（accusations・bot_postsのFK等）を壊さないため、物理削除は実装しない。削除済みレスは本文を「このレスは削除されました」に置換して表示するのはUI/Adapter層の責務。

### BAN の二層構造

ユーザーBAN（users.is_banned）と IP BAN（ip_bans テーブル）の二層で管理する。ユーザーBANは個人単位、IP BANは回線単位の制限。両方を併用することで、アカウント乗り換えによるBAN回避を抑止する。

### 管理者への IP ハッシュ非公開

IP BAN は userId を介して間接的に行い、管理者がIPハッシュ値を直接扱うことはない。API レスポンスにも ipHash フィールドは含めない。
