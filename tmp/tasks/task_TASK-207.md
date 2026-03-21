---
task_id: TASK-207
sprint_id: Sprint-75
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T17:00:00+09:00
updated_at: 2026-03-20T17:00:00+09:00
locked_files:
  - e2e/fixtures/index.ts
---

## タスク概要
本番スモークテストの管理ユーザー詳細テストが、ダミーuserID `"prod-smoke-user"` を使用しているため失敗している。環境変数 `PROD_SMOKE_USER_ID` を導入し、本番DBの実在UUIDを使用するよう修正する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-205/analysis.md` — 原因分析と修正方針の詳細
2. [必須] `e2e/fixtures/index.ts` — 修正対象（authenticateProd関数のL89付近）
3. [参考] `e2e/fixtures/auth.fixture.ts` — authenticateLocalとの比較

## 出力（生成すべきファイル）
- `e2e/fixtures/index.ts` — authenticateProdが `PROD_SMOKE_USER_ID` 環境変数からuserIdを取得するよう修正

## 完了条件
- [ ] `authenticateProd` が `process.env.PROD_SMOKE_USER_ID` からuserIdを取得している
- [ ] `PROD_SMOKE_USER_ID` が未設定の場合、明確なエラーメッセージを出す（サイレント失敗を防ぐ）
- [ ] `npx tsc --noEmit` がエラー0件
- [ ] `npx vitest run` が全件PASS
- [ ] `npx playwright test e2e/smoke/navigation.spec.ts` が全件PASS（ローカル環境ではadminテストはlocalモードで動作するためPASSするはず）

## スコープ外
- `.env.prod.smoke` への実際のUUID記入（人間タスク）
- e2e/fixtures/index.ts以外のファイル変更（ただし .env.prod.smoke.example がある場合は更新可）
- BDDシナリオの変更

## 補足・制約

### 修正箇所（アーキテクト分析書より）

`e2e/fixtures/index.ts` L89付近:
```typescript
// Before:
userId: "prod-smoke-user",

// After:
userId: process.env.PROD_SMOKE_USER_ID ?? (() => { throw new Error("PROD_SMOKE_USER_ID is not set in .env.prod.smoke"); })(),
```

### .env.prod.smoke.example
既存の `.env.prod.smoke.example` があれば `PROD_SMOKE_USER_ID` を追加すること。なければ作成不要。

### 本番UUIDの取得方法（人間向けメモ）
```sql
SELECT id FROM users WHERE author_id_seed = 'SMOKE_TEST';
```
このSQLで取得したUUIDを `.env.prod.smoke` の `PROD_SMOKE_USER_ID` に設定する。

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を達成
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `e2e/fixtures/index.ts` L89: `userId: "prod-smoke-user"` を `process.env.PROD_SMOKE_USER_ID ?? (() => { throw new Error(...) })()` に変更
2. `.env.prod.smoke.example`: `PROD_SMOKE_USER_ID=` エントリを追加（取得SQLコメント付き）

### テスト結果サマリー

- `npx tsc --noEmit`: エラー0件 PASS
- `npx vitest run`: 67ファイル / 1431テスト 全件 PASS
- `npx playwright test e2e/smoke/navigation.spec.ts`: 19テスト 全件 PASS（管理ユーザー詳細テスト含む）
