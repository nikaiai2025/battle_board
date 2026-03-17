---
task_id: TASK-139
sprint_id: Sprint-48
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-18T00:30:00+09:00
updated_at: 2026-03-18T00:30:00+09:00
locked_files:
  - scripts/upsert-pinned-thread.ts
---

## タスク概要

`scripts/upsert-pinned-thread.ts` のバグ修正。`threads.created_by` が `UUID NOT NULL REFERENCES users(id)` であるにも関わらず、文字列 `"system"` を渡している。GitHub Actions上で `invalid input syntax for type uuid: "system"` エラーとなる。

## 修正方針

スクリプトのメイン処理冒頭で「システムユーザー」をupsertし、その UUID を `created_by` に使用する。

```typescript
// Well-known system user UUID（固定値）
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

// システムユーザーをupsert（冪等）
await supabase.from("users").upsert({
  id: SYSTEM_USER_ID,
  auth_token: "system",
  author_id_seed: "system",
}, { onConflict: "id" });
```

そしてスレッド作成時の `created_by: "system"` を `created_by: SYSTEM_USER_ID` に変更する。

## 参考: usersテーブルのスキーマ（00001_create_tables.sql）

```sql
CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_token      VARCHAR      NOT NULL,
    author_id_seed  VARCHAR      NOT NULL,
    is_premium      BOOLEAN      NOT NULL DEFAULT false,
    username        VARCHAR(20),
    streak_days     INTEGER      NOT NULL DEFAULT 0,
    last_post_date  DATE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

後続マイグレーションで追加されたカラムがあるかもしれないので、確認して対応すること。

## 完了条件

- [ ] `"system"` 文字列の直接指定が除去されている
- [ ] システムユーザーのupsertが冪等に行われる
- [ ] `SYSTEM_USER_ID` 定数が定義されている
- [ ] 既存のテストが壊れない（`npx vitest run` PASS）

## スコープ外

- スキーマ変更（マイグレーション追加は行わない）
- ワークフローファイルの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件クリア
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. タスク指示書を読み込み、対象ファイル `scripts/upsert-pinned-thread.ts` を確認
2. supabase/migrations/ 配下を全確認し、usersテーブルへの後続追加カラムを調査
   - 00005: `is_verified` (BOOLEAN NOT NULL DEFAULT false)
   - 00006: `supabase_auth_id`, `registration_type`, `registered_at`, `pat_token`, `pat_last_used_at` (全てNULL許容)
   - 00008: `grass_count` (INTEGER NOT NULL DEFAULT 0)
   - 00010: `is_banned`, `last_ip_hash`
   - upsert時に必須のNOT NULL非DEFAULT列: `auth_token`, `author_id_seed` のみ（修正方針の通り）
3. ベーステスト実行: 45ファイル / 1141テスト PASS
4. `scripts/upsert-pinned-thread.ts` を修正:
   - `SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"` 定数を追加
   - `main()` 冒頭にシステムユーザーの冪等upsert処理を追加（`onConflict: "id"`）
   - `created_by: "system"` を `created_by: SYSTEM_USER_ID` に変更
5. 修正後テスト実行: 45ファイル / 1141テスト PASS（既存テストへの影響なし）

### テスト結果サマリー

- 単体テスト: 45ファイル / 1141テスト **全PASS**
- 修正前後で差分なし（既存テストが壊れていないことを確認）
