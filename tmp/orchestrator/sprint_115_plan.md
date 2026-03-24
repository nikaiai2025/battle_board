# Sprint-115 計画書

> 開始: 2026-03-25

## 目的

TD-TEST-001 解消: `loginWithEmail` のレイヤー規約違反修正 + テスト失敗8件の解消

## 背景

- `registration-service.ts`（Service層）が `@supabase/supabase-js` の `createClient` を直接importしている
- これによりテスト環境で `SUPABASE_URL` が未設定のためテスト8件が失敗
- セキュリティレビュー済み（TASK-311）: 使い捨てクライアントの設計意図は妥当。実装場所の問題のみ
- 修正方針: `client.ts` にファクトリ関数 `createAuthOnlyClient()` を追加

## タスク

| TASK_ID | 担当 | 内容 | locked_files |
|---|---|---|---|
| TASK-312 | bdd-coding | loginWithEmail レイヤー規約違反修正 + テスト修正 | `src/lib/infrastructure/supabase/client.ts`, `src/lib/services/registration-service.ts`, `src/__tests__/lib/services/registration-service.test.ts`, `features/support/in-memory/supabase-client.ts` |

## 完了条件

- [ ] `registration-service.ts` から `@supabase/supabase-js` の直接importが除去されている
- [ ] vitest 全PASS（現在の4件失敗が0件に）
- [ ] BDD 全PASS（現在の4件失敗が0件に、pending除く）
- [ ] 既存テストにデグレなし

## 結果

<!-- スプリント完了後に記入 -->
