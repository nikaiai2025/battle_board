---
task_id: GATE-158
sprint_id: Sprint-158
status: failed
assigned_to: bdd-gate
depends_on: [TASK-402]
created_at: 2026-05-30T00:00:00+09:00
updated_at: 2026-05-30T09:40:00+09:00
---

## タスク概要

Sprint-158（AAビューワー実装）の品質ゲート。
Vitest で1件FAILが報告されているため、既存問題か新規問題かを判定する。

## 完了条件

- [ ] `npx vitest run` 全件PASS
- [x] `npx cucumber-js` 全シナリオPASS（既知pending除く）

## 作業ログ

### チェックポイント
- 状態: FAIL（Vitest 1件FAIL）

### テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | FAIL | 2382/2383 | 14.68s |
| BDD (Cucumber.js) | PASS | 457/464（7 pending） | 3.16s |

### Vitest FAIL 詳細

**失敗テスト:** `src/__tests__/integration/schema-consistency.test.ts`
**テスト名:** `全 Row 型フィールドが対応する DB テーブルのカラムとして存在すること`

**エラーメッセージ:**
```
スキーマ不整合が 1 件検出されました:
1. [reply-candidate-repository.ts] テーブル "reply_candidates" が DB（OpenAPI スキーマ）に存在しないか、カラムが0件です。マイグレーションが適用されているか確認してください。
```

**原因:**
- `supabase/migrations/00051_human_mimic_bot.sql`（`reply_candidates` テーブル作成）が TASK-402 コミット `2204325` で追加されたが、ローカルDBに未適用
- `npx supabase migration list` では "00051" が Local/Remote 欄に表示されているが、実際には `reply_candidates` テーブルがDBに存在しない（PostgREST OpenAPI・直接SQLクエリ双方で確認済み）
- `npx supabase db reset` 未実行が原因と推定される

**TASK-402 起因の新規問題か否か:**
**新規問題（TASK-402 起因）。** 前スプリント（Sprint-157）ゲートでは全件PASSであり、`reply-candidate-repository.ts` と `00051_human_mimic_bot.sql` はいずれもコミット `2204325`（Add human mimic bot candidate pipeline）で追加されたファイル。前スプリントには存在しなかったため「pre-existing」という実装者の報告は誤り。

**修正方法:**
`npx supabase db reset` を実行してローカルDBにマイグレーション00051を適用する。
