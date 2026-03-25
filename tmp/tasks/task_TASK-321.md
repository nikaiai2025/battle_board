---
task_id: TASK-321
sprint_id: Sprint-121
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T17:00:00+09:00
updated_at: 2026-03-26T17:00:00+09:00
locked_files:
  - src/lib/services/daily-stats-service.ts
  - src/__tests__/lib/services/daily-stats-service.test.ts
  - src/__tests__/api/internal/daily-stats.test.ts
---

## タスク概要

日次統計集計の日付境界をJST基準に修正する。現在、`getYesterdayJst()`でJST基準の日付文字列を取得しているが、集計クエリの境界条件がUTC（`${date}T00:00:00Z`〜`${date}T23:59:59.999Z`）になっており、JSTの1日と一致しない。

## 問題の詳細

```
現在: date=2026-03-25 → 2026-03-25T00:00:00Z 〜 2026-03-25T23:59:59Z (UTC)
正しい: date=2026-03-25 → 2026-03-24T15:00:00Z 〜 2026-03-25T14:59:59Z (JST 03/25 00:00〜23:59)
```

JSTの00:00はUTCの前日15:00。現状はUTC基準で集計されるため、15:00-23:59 JSTの活動が翌日にカウントされる。

## 修正方針

集計クエリの境界条件を、JSTの日付範囲に対応するUTC範囲に変換する。

```typescript
// 修正後: JST基準の日付範囲をUTCに変換
const startUtc = `${date}T00:00:00+09:00`  // or equivalent UTC
const endUtc = `${nextDate}T00:00:00+09:00`
```

または明示的にUTCオフセットを計算:
```typescript
// date=2026-03-25 (JST) → UTC: 2026-03-24T15:00:00Z 〜 2026-03-25T15:00:00Z
```

## 必読ドキュメント

1. [必須] `src/lib/services/daily-stats-service.ts` — 修正対象
2. [参考] `src/__tests__/lib/services/daily-stats-service.test.ts` — 既存テスト
3. [参考] `src/__tests__/api/internal/daily-stats.test.ts` — APIテスト

## 出力（生成すべきファイル）

- `src/lib/services/daily-stats-service.ts` — 日付境界修正
- テストファイル — 境界条件テスト追加

## 完了条件

- [x] 集計クエリの日付境界がJST基準
- [x] `getYesterdayJst()` の返す日付と集計範囲が一致
- [x] JST日付境界の単体テストが存在しPASS
- [x] `npx vitest run` 全PASS

## スコープ外

- daily_stats テーブルスキーマ変更
- ダッシュボードUIの変更
- features/ の変更

## 補足・制約

- Supabaseの `created_at` はUTC (timestamptz) で格納されている
- `+09:00` オフセット付きのISO文字列はSupabase/PostgreSQLが正しく解釈する

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/services/daily-stats-service.ts` を修正
   - `getJstDateRange(date)` 関数を新規追加・export（JST日付 → UTC+09:00境界ペアを返す）
   - 全集計クエリ（`getNewUsers`, `getActiveUsers`, `getTotalPosts`, `getTotalThreads`, `getActiveThreads`, `getCurrencyGranted`, `getCurrencyConsumed`, `getTotalAccusations`, `getTotalAttacks`）の `.gte()` / `.lt()` を `getJstDateRange()` を使って JST 基準に修正
   - `${date}T00:00:00Z` → `${date}T00:00:00+09:00`（startUtc）、`${date}T23:59:59.999Z` → `${nextDate}T00:00:00+09:00`（endUtc）

2. `src/__tests__/lib/services/daily-stats-service.test.ts` を更新
   - `getJstDateRange()` の単体テスト追加（通常日・月末・年末・月初）
   - `aggregateAndUpsert()` が JST 基準の +09:00 形式でクエリを発行することを検証するテスト追加

### テスト結果サマリー

- 対象ファイルテスト: 12/12 PASS（`daily-stats-service.test.ts`）
- APIテスト: 6/6 PASS（`daily-stats.test.ts`）
- 全体: 98 テストファイル / 1896 テスト全 PASS（リグレッションなし）
