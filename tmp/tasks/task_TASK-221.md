---
task_id: TASK-221
sprint_id: Sprint-79
status: done
assigned_to: bdd-gate
depends_on: []
created_at: 2026-03-21T23:40:00+09:00
updated_at: 2026-03-22T00:10:00+09:00
locked_files: []
---

## タスク概要
Sprint 75-79の変更に対するフェーズ5品質ゲート検証。ローカル環境で全テストスイートを実行し、合否を判定する。

## 対象スプリント
- Sprint-75〜79（計画書: `tmp/orchestrator/sprint_75_plan.md` 〜 `sprint_79_plan.md`）

## 対象変更ファイル一覧（Sprint 75-79）
src/lib/services/post-service.ts, src/lib/services/command-service.ts, src/lib/services/bot-service.ts, src/lib/services/handlers/attack-handler.ts, src/lib/services/handlers/kinou-handler.ts, src/lib/services/handlers/hissi-handler.ts, src/lib/services/handlers/tell-handler.ts, src/lib/services/registration-service.ts, src/lib/infrastructure/repositories/post-repository.ts, src/lib/infrastructure/repositories/bot-post-repository.ts, src/lib/infrastructure/repositories/bot-repository.ts, src/lib/infrastructure/repositories/attack-repository.ts, src/lib/domain/rules/url-detector.ts, src/types/post-with-bot-mark.ts, src/app/(web)/_components/PostItem.tsx, src/app/(web)/_components/ImageThumbnail.tsx, src/app/(web)/_components/EliminatedBotToggle.tsx, src/app/(web)/_components/EliminatedBotToggleContext.tsx, src/app/(web)/_components/Header.tsx, src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx, src/app/(web)/register/discord/page.tsx, src/app/api/threads/[threadId]/route.ts, e2e/fixtures/data.fixture.ts, e2e/fixtures/index.ts, e2e/flows/*.spec.ts, features/thread.feature, features/investigation.feature, features/step_definitions/*.steps.ts, docs/architecture/*.md, docs/specs/screens/thread-view.yaml, supabase/migrations/000{19,20}*.sql

## 実行するテストスイート
1. `npx vitest run` — 単体テスト全件
2. `npx cucumber-js` — BDDテスト全件
3. `npx tsc --noEmit` — 型チェック
4. `npx playwright test --project=e2e` — E2Eテスト全件
5. `npx playwright test --project=api-test` — APIテスト全件

## 完了条件
- [ ] 全テストスイートの実行結果を報告
- [ ] PASS/FAIL判定

## 作業ログ

### テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 1535/1535 | 9.51s |
| BDD (Cucumber.js) | PASS | 255/255 (pending: 16) | 1.743s |
| 型チェック (tsc) | PASS | — | — |
| E2E (Playwright e2e) | PASS | 16/16 | 1.4m |
| API (Playwright api) | FAIL | 26/29 | 26.7s |

**総合判定: FAIL**

### 失敗テスト詳細

#### 1. `e2e/api/auth-cookie.spec.ts:442`

**テスト名:** POST /api/auth/auth-code 認証成功 — HttpOnly SameSite=Lax Path=/ Max-Age が設定される

**エラー:**
```
Expected: 2592000  (30日)
Received: 31536000 (365日)
```

**原因:** `src/app/api/auth/auth-code/route.ts:167` にて edge-token の maxAge が `60 * 60 * 24 * 365`（365日）と実装されているが、テストは `60 * 60 * 24 * 30`（30日）を期待している。実装とテストの期待値の不一致。どちらが正しい仕様かは D-04/D-05 等で確認が必要。

#### 2. `e2e/api/senbra-compat.spec.ts:403`

**テスト名:** GET /battleboard/subject.txt — スレッドなし時は空レスポンスを返す

**エラー:**
```
Expected: 0 (空ボディ)
Received: 4969 (バイト数)
```

**原因:** テスト実行順の問題によるDB状態汚染。E2Eテスト（`--project=e2e`）が作成したスレッドデータが DB に残存しており、「スレッドなし」という前提が成立していない。apiプロジェクトに cleanup フィクスチャが存在しないか、`beforeEach` でのデータ削除が機能していない。

#### 3. `e2e/api/senbra-compat.spec.ts:474`

**テスト名:** GET /battleboard/subject.txt — 複数スレッドが bump 順（最終書き込み順）で並ぶ

**エラー:**
```
Expected: 2 (スレッド数)
Received: 94 (残存データを含む行数)
```

**原因:** 上記 2 と同様。前テストランおよびE2Eテスト実行後のデータが DB に残存しており、スレッド数のアサーションが失敗している。

### チェックポイント
- 状態: 完了
- 完了済み: 全テストスイートの実行と結果報告
- 未解決の問題: APIテスト 3件 FAIL（上記参照）
