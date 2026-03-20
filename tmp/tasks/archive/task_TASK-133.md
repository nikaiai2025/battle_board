---
task_id: TASK-133
sprint_id: Sprint-45
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T23:00:00+09:00
updated_at: 2026-03-17T23:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/bot-repository.ts
  - src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts
  - "[NEW] supabase/migrations/00014_add_increment_column_rpc.sql"
---

## タスク概要

Phase 5コードレビュー（TASK-129 HIGH-004）で検出されたレースコンディションを修正する。`BotRepository.incrementColumn` がSELECT+UPDATEの2段階実装であり、同時攻撃時にカウンタ値の不整合が発生する可能性がある。

## 修正対象

### HIGH-004: incrementColumnのレースコンディション

現在の実装:
```typescript
// SELECT で現在値を取得し、+1してUPDATE（非アトミック）
const current = (row as Record<string, number>)[column];
await supabaseAdmin.from("bots").update({ [column]: current + 1 }).eq("id", botId);
```

問題: 同一ボットへの同時攻撃時に `times_attacked` の値が実際の攻撃回数より少なくカウントされるリスク。

## 修正方針（優先順位）

1. **方針A（推奨）: Supabase RPC関数の作成**
   - `supabase/migrations/00014_add_increment_column_rpc.sql` にRPC関数を作成
   - `increment_bot_column(bot_id UUID, column_name TEXT, amount INT)` のようなPL/pgSQL関数
   - `bot-repository.ts` から `.rpc()` 呼び出しに変更

2. **方針B: Raw SQLの使用**
   - Supabase clientの `.rpc()` で直接 `UPDATE bots SET {column} = {column} + 1 WHERE id = $1 RETURNING {column}` を実行

3. **方針C（最小変更）: Supabase filter式の活用**
   - Supabaseクライアントが `column = column + 1` 形式をサポートしているか確認し、可能であればそれを使用

いずれの方針でも、戻り値として更新後の値を返すこと。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-code-reviewer_TASK-129/code_review_report.md` — HIGH-004の詳細
2. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` — 現在の実装
3. [参考] `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` — 既存テスト

## 完了条件
- [x] `incrementColumn` がアトミックな更新に変更
- [x] マイグレーションファイルが作成（方針Aの場合）
- [x] 既存テストが全てPASS
- [x] `npx vitest run` 全件PASS

## スコープ外
- incrementColumn以外のリポジトリ変更
- bot-service.tsの変更（TASK-132が担当）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: マイグレーションSQL作成・bot-repository.ts修正・テストファイル新規作成・全件PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 現在の実装確認完了。方針A（Supabase RPC関数）を採用決定
  - 既存のRPC関数パターン（00004_create_rpc_functions.sql）と整合する
  - `increment_bot_column(p_bot_id UUID, p_column TEXT)` 形式でRPC関数を作成
- [完了] 3ファイルを変更/新規作成
  - `supabase/migrations/00014_add_increment_column_rpc.sql` 新規作成（RPC関数定義）
  - `src/lib/infrastructure/repositories/bot-repository.ts` 修正（SELECT+UPDATE→RPC呼び出し）
  - `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` 新規作成（43件）
- [確認] `npx vitest run` 全件PASS（44ファイル / 1138件）

### テスト結果サマリー
- 全テストファイル: 44 PASS / 0 FAIL
- 全テスト件数: 1138 PASS / 0 FAIL
- 新規テスト（bot-repository.test.ts）: 43件 PASS
  - incrementTimesAttacked（HIGH-004 回帰テスト）: 5件
  - incrementTotalPosts / AccusedCount / SurvivalDays: 各2件
  - findById / findActive / findAll: 各2-7件
  - updateHp / reveal / unreveal / eliminate: 各2件
  - bulkResetRevealed / bulkReviveEliminated: 各3-4件
  - create / updateDailyId: 各2件
