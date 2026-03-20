# Sprint-40 計画書

> 作成: 2026-03-17

## スプリント概要

Phase 5 検証完了後の技術的負債解消スプリント。
Sprint-38/39のコードレビューで検出されたMEDIUM指摘のうち、リスク「中」以上の3件 + リスク「低」の2件を修正する。

## 対象課題

| ID | 内容 | リスク | 対応 |
|---|---|---|---|
| MEDIUM-007 | auth-service.ts L325,L406 + auth-code-repository.ts L232 に `new Date()` 残存 | 中 | TASK-117 |
| MEDIUM-001 | sumAllBalances — 全行フェッチ+JS集計 → DB側SUM集計へ | 低 | TASK-118 |
| MEDIUM-002 | countActiveThreadsByDate — 全行フェッチ+JS Set → DB側COUNT DISTINCT へ | 低 | TASK-118 |
| MEDIUM-005 | スレッド削除 N+1 UPDATE → バッチUPDATE へ | 低 | TASK-118 |

## スコープ外（今回見送り）

| ID | 理由 |
|---|---|
| MEDIUM-006 | 実装はOpenAPI仕様と一致済。仕様側の不統一修正はAPI契約変更のため人間承認が必要 |
| MEDIUM-003 | aggregate-daily-stats タイムゾーン — 設計判断が必要（UTC vs JST）。別途検討 |
| LOW-003 | bot_system/incentive.steps.ts コメント乖離 — リスク低、将来対応 |

## タスク分解

| TASK | 担当 | 内容 | depends_on | locked_files |
|---|---|---|---|---|
| TASK-117 | bdd-coding | `new Date()` → `new Date(Date.now())` 統一（プロダクションコード残存3箇所） | なし | auth-service.ts, auth-code-repository.ts |
| TASK-118 | bdd-coding | リポジトリ性能最適化（DB集計化 + バッチ更新） | なし | currency-repository.ts, post-repository.ts, admin-service.ts, thread-repository.ts, admin-service.test.ts, admin-dashboard.test.ts |

## 並行実行計画

TASK-117 と TASK-118 は locked_files に重複がないため、並行実行可能。

```
[TASK-117] ───────────→ 完了
[TASK-118] ───────────→ 完了
                          └→ vitest / cucumber-js 全件確認
```

## 結果

| TASK | ステータス | 備考 |
|---|---|---|
| TASK-117 | **completed** | 3箇所修正。vitest 1047 PASS |
| TASK-118 | **completed** | 3件最適化（sumAllBalances DB SUM / countActiveThreadsByDate INNER JOIN COUNT / softDeleteByThreadId バッチ削除）。vitest 1047 PASS, cucumber 219 passed |

### 最終テスト結果
- vitest: 39 files / 1047 tests / **全PASS**
- cucumber-js: 228 scenarios (219 passed, 9 pending) / **0 failed**

### 変更ファイル一覧
- `src/lib/services/auth-service.ts` — new Date() 修正
- `src/lib/infrastructure/repositories/auth-code-repository.ts` — new Date() 修正
- `src/lib/infrastructure/repositories/currency-repository.ts` — sumAllBalances DB集計化
- `src/lib/infrastructure/repositories/post-repository.ts` — countActiveThreadsByDate DB集計化 + softDeleteByThreadId 追加
- `src/lib/services/admin-service.ts` — deleteThread バッチ削除化
- `src/lib/services/__tests__/admin-service.test.ts` — テスト更新
- `src/__tests__/lib/services/admin-dashboard.test.ts` — テスト更新
- `features/support/in-memory/post-repository.ts` — BDDインメモリ実装にsoftDeleteByThreadId追加

### Phase5再検証の要否
不要。全変更は内部実装の最適化のみ（振る舞い変更なし、BDDシナリオ変更なし、API契約変更なし）
