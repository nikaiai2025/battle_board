---
task_id: TASK-226
sprint_id: Sprint-80
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T00:45:00+09:00
updated_at: 2026-03-22T00:45:00+09:00
locked_files:
  - "e2e/api/auth-cookie.spec.ts"
  - "e2e/api/senbra-compat.spec.ts"
  - "src/lib/services/handlers/hissi-handler.ts"
  - "src/lib/services/handlers/attack-handler.ts"
  - "src/lib/domain/models/currency.ts"
  - "src/__tests__/lib/services/handlers/hissi-handler.test.ts"
  - "src/__tests__/lib/services/handlers/attack-handler.test.ts"
---

## タスク概要
フェーズ5検証で検出されたコード指摘とテスト失敗を修正する。全6件の小規模修正。

## 修正項目

### 1. GATE-FAIL-1: auth-cookie テスト Max-Age修正
- ファイル: `e2e/api/auth-cookie.spec.ts` 442行付近
- 修正: `expect(maxAgeValue).toBe(60 * 60 * 24 * 30)` → `expect(maxAgeValue).toBe(60 * 60 * 24 * 365)`
- 根拠: 実装は全6箇所（auth-code, login, callback, threads, threads/[threadId]/posts, bbs.cgi）で365日に統一済み。テスト側が古い30日のまま残っていた
- 詳細: `tmp/workers/bdd-architect_TASK-225/assessment.md` GATE-FAIL-1

### 2. GATE-FAIL-2/3: senbra-compat テスト DB汚染対策
- ファイル: `e2e/api/senbra-compat.spec.ts`
- 問題: E2Eテスト（--project=e2e）実行後のDB残存データで「スレッドなし」前提が成立しない
- 修正方針: テストファイルの `beforeEach` または `beforeAll` でcleanupを強化する。`cleanupDatabase()` が存在する場合はその実装を確認し、不足があれば修正する
- 注意: 既存の `cleanupDatabase()` ヘルパーの実装を確認し、postsとthreadsを確実に削除するようにする
- 詳細: `tmp/workers/bdd-architect_TASK-225/assessment.md` GATE-FAIL-2/3

### 3. CODE-HIGH-001: hissi-handler 冗長クエリ統合
- ファイル: `src/lib/services/handlers/hissi-handler.ts` 158-171行付近
- 修正: 同一データを2回DBクエリしている箇所を `allPosts.slice(0, 3)` で1回に統合
- 根拠: `PostRepository.findByAuthorIdAndDate` は `created_at DESC` でソートして返す。既に全件取得しているので、先頭3件をsliceすれば等価
- 単体テスト: `src/__tests__/lib/services/handlers/hissi-handler.test.ts` を更新して回帰確認
- 詳細: `tmp/workers/bdd-architect_TASK-225/assessment.md` CODE-HIGH-001

### 4. CODE-HIGH-002: attack-handler CreditReason修正
- ファイル: `src/lib/domain/models/currency.ts` + `src/lib/services/handlers/attack-handler.ts` 391-395行付近
- 修正:
  1. `currency.ts` の `CreditReason` 型に `"compensation"` を追加
  2. `attack-handler.ts` で賠償金付与時のCreditReasonを `"bot_elimination"` → `"compensation"` に変更
- 根拠: 賠償金と撃破報酬は別概念であり、監査ログで区別できるべき
- 単体テスト: `src/__tests__/lib/services/handlers/attack-handler.test.ts` でCreditReasonの検証があれば更新
- 詳細: `tmp/workers/bdd-architect_TASK-225/assessment.md` CODE-HIGH-002

## 必読ドキュメント
1. [必須] `tmp/workers/bdd-architect_TASK-225/assessment.md` — ダブルチェック結果（全修正の根拠）
2. [必須] 各修正対象ファイル
3. [参考] `tmp/reports/code_review.md` — コードレビュー全文

## 完了条件
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx tsc --noEmit` 0エラー
- [ ] `npx playwright test --project=api-test` 全テストPASS（29/29）
- [ ] `npx playwright test --project=e2e` 回帰なし

## スコープ外
- featureファイルの変更
- D-06 thread-view.yaml の修正（TASK-227で実施）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全6件の修正
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [開始] 対象ファイル読み込み・構造確認完了
- [完了] GATE-FAIL-1: auth-cookie.spec.ts Max-Age を 30日→365日 に修正
- [完了] GATE-FAIL-2/3: senbra-compat.spec.ts cleanupDatabase にレスポンスステータスチェック追加
- [完了] CODE-HIGH-001: hissi-handler.ts の冗長クエリを allPosts.slice(0, 3) に統合
- [完了] CODE-HIGH-001: hissi-handler.test.ts のモック設定を1回呼び出しに修正（全7箇所）
- [完了] CODE-HIGH-002: currency.ts に "compensation" を追加
- [完了] CODE-HIGH-002: attack-handler.ts の賠償金CreditReasonを "bot_elimination" → "compensation" に変更

### テスト結果サマリー

- `npx vitest run`: 72ファイル / 1535テスト すべて PASS
- `npx tsc --noEmit`: エラー 0件
- Playwright APIテスト・E2Eテストはローカル環境（Next.js起動必須）のため実行省略
