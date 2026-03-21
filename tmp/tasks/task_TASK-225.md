---
task_id: TASK-225
sprint_id: Sprint-79
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-225
depends_on: [TASK-221, TASK-222, TASK-223]
created_at: 2026-03-22T00:30:00+09:00
updated_at: 2026-03-22T00:30:00+09:00
locked_files: []
---

## タスク概要
フェーズ5検証で検出されたHIGH指摘5件 + APIテスト失敗3件の妥当性をダブルチェックし、対応方針を検討する。

## ダブルチェック対象

### APIテスト失敗（TASK-221 bdd-gate）

**GATE-FAIL-1: auth-cookie Max-Age不一致**
- テスト `e2e/api/auth-cookie.spec.ts:442` が30日(2592000秒)を期待
- 実装 `src/app/api/auth/auth-code/route.ts:167` は365日(31536000秒)、コメント「専ブラ bbs.cgiと統一」
- 問い: 実装とテストのどちらが正しいか？ テストを365日に修正すべきか？

**GATE-FAIL-2/3: senbra-compat DB汚染**
- `e2e/api/senbra-compat.spec.ts:403,474` がE2Eテスト後のDB残存データで失敗
- 問い: apiプロジェクトにbeforeAll cleanupを追加すべきか、テスト実行順序を制御すべきか？

### コードレビューHIGH（TASK-222 bdd-code-reviewer）

**CODE-HIGH-001: hissi-handler 冗長2回DBクエリ**
- `src/lib/services/handlers/hissi-handler.ts:158-171` で同一データを2回取得
- レビューアは「allPosts.slice(0, 3)で1回に統合可能」と指摘
- 問い: 実際にコードを読んで、指摘が妥当か確認する

**CODE-HIGH-002: attack-handler 賠償金CreditReason誤用**
- `src/lib/services/handlers/attack-handler.ts:391-395` で賠償金付与に `"bot_elimination"` を使用
- レビューアは「監査ログの正確性に影響」と指摘
- 問い: 実際のCreditReason定義を確認し、適切なreasonが存在するか確認する

### ドキュメントレビューHIGH（TASK-223 bdd-doc-reviewer）

**DOC-HIGH-001: thread-view.yaml route旧形式**
- `docs/specs/screens/thread-view.yaml` のrouteが `/threads/{threadId}` のまま
- 問い: 実際に確認し、修正すべき箇所を特定する

**DOC-HIGH-002: thread-view.yaml post-number format矛盾**
- post-numberの`format`が`">>{postNumber}"`だがBDDは「>>なし数字のみ」
- 問い: 実装コード(PostItem.tsx)と照合して確認する

**DOC-HIGH-003: thread-view.yaml command-helpコマンド欠落**
- `command-help`に!w, !hissi, !kinouが未記載
- 問い: 実装コードと照合して確認する

## 必読ドキュメント
1. `tmp/reports/code_review.md` — コードレビュー全文
2. `tmp/reports/doc_review.md` — ドキュメントレビュー全文
3. `tmp/tasks/task_TASK-221.md` — ゲートテスト結果
4. 各指摘で参照されているソースコード

## 出力
- `tmp/workers/bdd-architect_TASK-225/assessment.md` — ダブルチェック結果と対応方針

## 完了条件
- [x] 全8件の指摘について妥当性を判定（妥当/過剰/誤検知）
- [x] 妥当な指摘について対応方針を提案（修正スコープ・影響範囲）
- [x] Sprint 75-79の変更が原因か既存問題かを分類

## 作業ログ

### 2026-03-21 ダブルチェック完了

検証したソースコード:
- `src/app/api/auth/auth-code/route.ts` (L155-172) — maxAge 365日を確認
- `src/app/api/auth/login/route.ts`, `callback/route.ts`, `threads/route.ts`, `threads/[threadId]/posts/route.ts`, `(senbra)/test/bbs.cgi/route.ts` — 全6箇所が365日で統一されていることを確認
- `e2e/api/auth-cookie.spec.ts` (L442) — テスト側が30日を期待していることを確認
- `e2e/api/senbra-compat.spec.ts` — beforeEach cleanupDatabase() の存在を確認
- `src/lib/services/handlers/hissi-handler.ts` (L158-171) — 2回のDB呼び出しを確認
- `src/lib/infrastructure/repositories/post-repository.ts` findByAuthorIdAndDate — created_at DESC ソート確認
- `src/lib/services/handlers/attack-handler.ts` (L391-395) — bot_elimination の使用を確認
- `src/lib/domain/models/currency.ts` (L43-55) — CreditReason型に compensation が存在しないことを確認
- `docs/specs/screens/thread-view.yaml` — route, format, command-help の全内容確認
- `features/thread.feature` @url_structure, @post_number_display — BDD正本との照合
- `src/app/(web)/_components/PostItem.tsx` — postNumber表示が数字のみであることを確認

結果: 全8件妥当。誤検知0件。詳細は `tmp/workers/bdd-architect_TASK-225/assessment.md`

### チェックポイント
- 状態: 完了
- 完了済み: 全8件の妥当性判定、対応方針提案、分類
- 未解決の問題: なし
