---
task_id: TASK-GATE-144
sprint_id: Sprint-144
status: assigned
assigned_to: bdd-gate
depends_on: [TASK-369]
created_at: 2026-03-29T11:30:00+09:00
updated_at: 2026-03-29T11:30:00+09:00
locked_files: []
---

## タスク概要

Sprint-144（陳腐化した単体テスト15件修正 + auth/verify route.ts変更）のコミット前品質ゲート。全テストスイートを実行し合否を判定する。

## 完了条件

- [ ] vitest 全PASS
- [ ] cucumber-js 全PASS（pending/undefinedは既知のもののみ許容）
- [ ] playwright E2E 実行（既知の2件失敗は許容）
- [ ] playwright API 全PASS

## 変更ファイル一覧

- `src/__tests__/api/auth/callback/route.test.ts` — モック引数修正
- `src/__tests__/api/auth/login/discord/route.test.ts` — 同期関数対応
- `src/__tests__/api/auth/register/discord/route.test.ts` — 同期関数対応
- `src/__tests__/lib/services/registration-service.test.ts` — 戻り値形状+同期対応
- `src/app/api/auth/verify/__tests__/route.test.ts` — 期待ステータスコード修正
- `src/app/api/auth/verify/route.ts` — edge-token未存在時の新規発行ロジック追加

## 作業ログ

### チェックポイント
- 状態: 完了（合否判定: FAIL）
- 完了済み: 全テストスイート実行
- 次にすべきこと: APIテスト失敗2件の対応（コーディングAIへの修正依頼 or スキップ承認）
- 未解決の問題: APIテスト失敗2件（詳細は下記テスト結果サマリー参照）

### 進捗ログ

- 2026-03-29 Supabase Local 起動確認 OK
- 2026-03-29 Vitest 実行 → 116ファイル / 2224件 全PASS
- 2026-03-29 Cucumber.js 実行 → 435シナリオ / 2351ステップ PASS（3 undefined, 18 pending は既知）
- 2026-03-29 Playwright E2E + Smoke 実行 → 34/35 PASS（auth-flow 1件失敗は既知のサイトタイトル不一致）
- 2026-03-29 Playwright API 実行 → 9/28 PASS（19件FAIL）

### テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 2224/2224 | 16.21s |
| BDD (Cucumber.js) | PASS | 414/435シナリオ (pending/undefined 21件は既知) | 3.08s |
| E2E (Playwright e2e+smoke) | PASS | 34/35 (1件は既知の失敗) | 2.3m |
| API (Playwright api) | FAIL | 9/28 | 36.4s |

#### APIテスト失敗詳細

**失敗1: auth-cookie.spec.ts (1件)**

- テスト名: `POST /api/auth/verify — edge-token Cookie なしで 400 を返す`
- エラー: Expected `400`, Received `200`
- 原因: Sprint-144 の `route.ts` 変更により、edge-token 未存在時の挙動が「400を返す」から「新規 edge-token を発行して認証を継続する（200）」に変わった。単体テスト (`route.test.ts`) は403期待に修正済みだが、E2Eの `auth-cookie.spec.ts` が400期待のまま未修正。
- 判定: Sprint-144 変更に起因する **テストコードの追随漏れ**。コーディングAIの修正対象。

**失敗2: senbra-compat.spec.ts (18件)**

- テスト名: `専ブラ互換API — Shift_JIS・DAT形式検証` 全件
- エラー: `cleanupDatabase: threads DELETE failed (status: 409)`
- 原因: 前回テスト実行時の残留データに対して外部キー制約（posts が threads を参照）によりDELETEが409 Conflict。`beforeEach` の `cleanupDatabase` が失敗してテスト本体が実行されていない。Sprint-144 変更とは無関係。
- 判定: DBセットアップの問題（残留データ起因）。クリーンアップ順序の修正 or Supabase DBリセットが必要。

#### 総合判定: **FAIL**

APIテスト 19件FAIL のため品質ゲート不合格。コミット前に以下の対応が必要:
1. `e2e/api/auth-cookie.spec.ts:441` — 期待ステータスコードを `400` → `200`（またはロジックに合わせた値）に修正
2. `e2e/api/senbra-compat.spec.ts` — `cleanupDatabase` の削除順序修正（先に posts を削除してから threads を削除する）
