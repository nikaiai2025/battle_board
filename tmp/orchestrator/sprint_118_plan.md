# Sprint-118 計画書

> 管理者ユーザー一覧 N+1問題修正（本番障害対応）

## 背景

Sprint-117 (c906c62) で `getUserList` に通貨残高(balance)を追加した際、各ユーザーの残高を1件ずつ個別取得する N+1 実装になっていた。
`limit=50` 時に 52 サブリクエストが発生し、Cloudflare Workers Free plan の上限(50/invocation)を超過して 500 エラーとなる。
フロントエンド(`page.tsx`)のレスポンス型も `User[]` のままで、バックエンドの `UserListItem[]` と不一致。

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 |
|---|---|---|---|
| TASK-315 | getUserList N+1解消 + フロントエンド型修正 | bdd-coding | completed |

## TASK-315 詳細

### 修正箇所

1. **CurrencyRepository**: `getBalancesByUserIds(userIds: string[])` を新設。`SELECT user_id, balance FROM currencies WHERE user_id IN (...)` で一括取得
2. **admin-service.ts**: `getUserList` の N+1 `Promise.all(users.map(getBalance))` を `getBalancesByUserIds` 一括呼び出しに置換
3. **page.tsx**: レスポンス型を `UserListItem[]` に合わせる。balance は実際に表示する。`streakDays`/`lastPostDate` はバックエンドが返さないため表示を調整
4. **テスト**: 新設関数の単体テスト追加、既存テスト修正

### サブリクエスト数
- 修正前: 2 + N (N=ユーザー数) → limit=50 で 52
- 修正後: 2 + 1 = 3（上限50に余裕）

## 結果

- TASK-315: completed
  - `CurrencyRepository.getBalancesByUserIds` 新設（IN句一括取得）
  - `getUserList` N+1解消（52→3サブリクエスト）
  - `UserListItem` に `streakDays`/`lastPostDate` 追加（推奨案A採用）
  - フロントエンド `page.tsx` を `UserListItem` 型に修正、balance実数値表示
  - InMemory実装にも `getBalancesByUserIds` 追加（ESC-TASK-315-1 解決）
  - vitest: 97 files, 1867 tests PASS
  - cucumber-js: 347 scenarios (331 passed, 16 pending)
  - 新規テスト12件（currency-repository: 10, admin-service: 2）
