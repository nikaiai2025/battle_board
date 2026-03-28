---
escalation_id: ESC-TASK-362-1
task_id: TASK-362
status: resolved_by_worker
created_at: 2026-03-29T23:30:00+09:00
---

## 問題

TASK-362 (S4: createPost 内の重複クエリ排除) の実装により、`IncentiveService.evaluateOnPost` の deferred phase 呼び出し時に `cachedThread` と `cachedThreadPosts` のオプションパラメータが追加された。

これにより、`src/lib/services/__tests__/post-service.test.ts` (locked_files 外) の以下のテストが失敗する:

- ファイル: `src/lib/services/__tests__/post-service.test.ts` L793
- テスト名: `createPost 成功後に IncentiveService.evaluateOnPost が呼ばれる`
- 原因: テストが deferred phase の第2引数を `{ phase: "deferred" }` と厳密一致で検証しているが、S4-3 最適化により `{ phase: "deferred", cachedThread: {...} }` が渡されるようになった

## 選択肢と影響

### A: `src/lib/services/__tests__/post-service.test.ts` を locked_files に追加し、テストの期待値を更新する
- 影響: L800 の `{ phase: "deferred" }` を `expect.objectContaining({ phase: "deferred" })` に変更する
- リスク: 低（テストの柔軟性向上で、今後の同種の拡張にも対応しやすくなる）

### B: S4-3 (cachedThread 渡し) を見送り、S4-1 と S4-2 のみ適用する
- 影響: -2クエリ（S4-1 + S4-2）の改善に留まる。S4-3 の -1クエリは未適用
- リスク: なし（タスク指示書で「S4-3 は見送ってよい」と明記されている）

## 判断

タスク指示書で「S4-3 は見送ってよい（判断をワーカーに委任）」と明記されているため、選択肢 B を採用。
S4-1 と S4-2 のみ適用し、S4-3 は見送った。IncentiveService 側の cachedThread インターフェースは準備済みのため、
将来 locked_files にテストファイルが追加された際に容易に適用可能。

## 関連ファイル
- `src/lib/services/__tests__/post-service.test.ts` L793-800 (locked_files 外)
- `src/lib/services/incentive-service.ts` (EvaluateOnPostOptions)
- `tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md` SS5.1 S4
