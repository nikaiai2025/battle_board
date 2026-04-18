---
task_id: TASK-370
sprint_id: Sprint-144
status: completed
assigned_to: bdd-coding
depends_on: [TASK-369]
created_at: 2026-03-29T12:00:00+09:00
updated_at: 2026-03-29T12:00:00+09:00
locked_files:
  - e2e/api/auth-cookie.spec.ts
  - e2e/api/senbra-compat.spec.ts
---

## タスク概要

品質ゲート（TASK-GATE-144）で検出されたAPIテスト2ファイルの修正。テストコードのみを修正し、実装コードは変更しない。

## 修正内容

### 1. e2e/api/auth-cookie.spec.ts (1件)

- テスト: `POST /api/auth/verify — edge-token Cookie なしで 400 を返す`（441行付近）
- 現状: edge-tokenなしで400を期待しているが、実装が変更されedge-token未存在時は新規発行して認証を継続する挙動になった
- 対処: 実装の新しい挙動（`src/app/api/auth/verify/route.ts`）を読み、テストの期待値を正しい値に修正する。edge-tokenなしでも新規発行されて認証フローが成功する（200）ことを確認するテストに書き換える

### 2. e2e/api/senbra-compat.spec.ts (18件 — 全件がDB前処理で失敗)

- 現状: `beforeEach` の `cleanupDatabase` で threads の DELETE が 409 Conflict（FK制約: postsがthreadsを参照）
- 原因: `cleanupDatabase` 関数の削除順序が不正。posts を先に削除してから threads を削除する必要がある
- 対処: `cleanupDatabase` 関数内の削除順序を修正する（posts → threads の順に変更）。他に外部キー制約で影響を受けるテーブルがあれば、依存関係の逆順（子テーブル→親テーブル）で削除するよう修正する

## 完了条件

- [ ] `npx playwright test --config=e2e/api/playwright.config.ts` で全テストPASS
- [ ] 既存テストに回帰がないこと

## スコープ外

- 実装コードの変更
- locked_files以外のファイルの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 両ファイルの修正完了、全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/app/api/auth/verify/route.ts` を読んで edge-token なし時の挙動を確認
   - edge-token なし → `issueEdgeToken()` + `issueAuthCode()` で新規発行 → 認証継続 → 200
   - 旧テストが期待していた 400 は実装に存在しない
2. `e2e/api/auth-cookie.spec.ts:426` のテストを「新規発行して認証成功(200)」に書き換え
3. `supabase/migrations/` を `REFERENCES threads` で全検索し、FK依存テーブルを洗い出し
   - 漏れていたテーブル: `pending_tutorials`, `pending_async_commands`
4. `e2e/api/senbra-compat.spec.ts` の cleanupDatabase に上記2テーブルの削除を追加（posts削除後、threads削除前）

### テスト結果サマリー

`npx playwright test --project=api` — **28件 PASS / 0件 FAIL**
- auth-cookie.spec.ts: 10件 PASS
- senbra-compat.spec.ts: 18件 PASS
