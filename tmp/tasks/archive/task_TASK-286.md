---
task_id: TASK-286
sprint_id: Sprint-106
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-23T08:25:00+09:00
updated_at: 2026-03-23T08:25:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/currency-repository.ts
---

## タスク概要

管理者ダッシュボード `GET /api/admin/dashboard` が本番環境で500エラーを返している。原因は `CurrencyRepository.sumAllBalances()` が PostgREST の集計関数 `balance.sum()` を使用しているが、Supabase環境で「Use of aggregate functions is not allowed」エラーになるため。

## 障害の詳細

CFログから取得したエラー:
```
[GET /api/admin/dashboard] Unhandled error:
Error: CurrencyRepository.sumAllBalances failed: Use of aggregate functions is not allowed
```

## 修正内容

`src/lib/infrastructure/repositories/currency-repository.ts` の `sumAllBalances()` を修正する。

PostgREST集計構文 `balance.sum()` が使えないため、代替手段で実装する:
- **方式**: 全行のbalanceを取得してJS側でSUM（ユーザー数が少ないため性能問題なし）
- `.select("balance")` で全行取得 → `.reduce()` で合計

```typescript
export async function sumAllBalances(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("currencies")
    .select("balance");

  if (error) {
    throw new Error(
      `CurrencyRepository.sumAllBalances failed: ${error.message}`,
    );
  }

  return (data as { balance: number }[]).reduce((sum, row) => sum + row.balance, 0);
}
```

## 完了条件

- [ ] `npx vitest run` 全PASS
- [ ] `npx tsc --noEmit` エラーなし
- [ ] `sumAllBalances()` がPostgREST集計構文を使用していないこと

## スコープ外

- features/ の変更
- API側のレスポンス仕様変更
- 他のリポジトリメソッドの変更

## 作業ログ

### チェックポイント
- 状態: 完了

### 進捗ログ

- `src/lib/infrastructure/repositories/currency-repository.ts` の `sumAllBalances()` を修正
  - `.select("balance.sum()")` + PostgRESTレスポンスパース → `.select("balance")` + `.reduce()` に変更
  - コメントも実態に合わせて更新（MEDIUM-001参照コメントを削除し障害原因の説明に変更）

### テスト結果サマリー

- `npx vitest run` : 1772 passed / 1 failed
  - 失敗は `schema-consistency.test.ts` (マイグレーション未適用の既存問題、今回のタスクとは無関係)
  - admin関連テスト (`admin-dashboard.test.ts`, `admin-service.test.ts`) : 41/41 PASS
- `npx tsc --noEmit` : エラーなし
- `sumAllBalances()` に PostgREST集計構文 (`balance.sum()`) は含まれていないことを確認済み
