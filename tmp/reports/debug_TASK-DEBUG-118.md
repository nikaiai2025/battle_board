# TASK-DEBUG-118: 管理者ユーザー一覧 500 エラー調査報告

## 症状

管理者ダッシュボード `/admin/users` にて「ユーザー一覧の取得に失敗しました。」エラーが表示される。
フロントエンド（`src/app/(admin)/admin/users/page.tsx` L114）が `GET /api/admin/users` の non-ok レスポンスを検出してエラー表示している。

## 原因（特定済み）

Sprint-117 (コミット c906c62) で `getUserList` に通貨残高取得の N+1 クエリが追加されたことが原因。

### 変更前

```
getUserList → UserRepository.findAll (Supabase x2 リクエスト: count + select)
```

### 変更後

```
getUserList → UserRepository.findAll (x2)
           → CurrencyRepository.getBalance x N (ユーザー数分の並列リクエスト)
合計: 2 + N サブリクエスト
```

### 発生メカニズム

Cloudflare Workers **Free plan のサブリクエスト上限は 50/invocation**。
`/api/admin/users?limit=50` で呼び出された場合:
- findAll: 2 リクエスト
- getBalance x 50: 50 リクエスト
- **合計 52 で上限超過**

上限超過時、CF Workers ランタイムが例外をスローし、route.ts の try-catch が 500 レスポンスを返す。

## 該当箇所

| ファイル | 行 | 問題 |
|---|---|---|
| `src/lib/services/admin-service.ts` | L492-505 | `Promise.all(users.map(getBalance))` で N+1 クエリ |
| `src/app/api/admin/users/route.ts` | L53 | `getUserList` を呼び出す |
| `src/app/(admin)/admin/users/page.tsx` | L109-116 | API の non-ok レスポンスでエラー表示 |

## 修正方針（提案）

### 方針A: バッチクエリ化（推奨）

`CurrencyRepository` に `getBalancesByUserIds(userIds: string[])` メソッドを新設し、1回の Supabase クエリで全ユーザーの残高を取得する。

```sql
SELECT user_id, balance FROM currencies WHERE user_id IN (:userIds)
```

これにより合計 3 サブリクエスト（count + select + getBalances）に削減される。

### 方針B: SQL JOIN 化

`UserRepository.findAll` で currencies テーブルを LEFT JOIN し、1クエリで残高付きユーザー一覧を取得する。合計 2 サブリクエスト。ただしリポジトリ層の責務境界を越えるためアーキテクチャ上の判断が必要。

### 方針C: フロントエンド対応（暫定）

フロントエンドの page.tsx がバックエンドの型変更（`User[]` -> `UserListItem[]`）に追随していない点も修正する。`UserListItem` には `streakDays`, `lastPostDate` 等が含まれていないため、テーブル表示も壊れている。

## 備考

- Playwright MCP が利用不可のため、ブラウザでの直接再現確認は未実施
- wrangler tail は起動したがリクエスト再現なし（ブラウザ操作不可のため）
- TypeScript コンパイルは正常完了（型の不整合は runtime に影響しない箇所）
