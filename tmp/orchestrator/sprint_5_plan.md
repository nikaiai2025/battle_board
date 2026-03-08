# Sprint-5 計画・結果

> Sprint ID: Sprint-5
> 期間: 2026-03-09
> ステータス: **completed**

---

## 目的

Phase 1 Step 5 — 書き込み + スレッド管理（最初の垂直スライス）。
CurrencyService + PostService + API Route Handlers を実装し、認証→スレッド作成→書き込み→一覧→閲覧の全フローをサービス層＋API層で完成させる。

## 対象BDDシナリオ

- `features/phase1/posting.feature` — 書き込みの基本・バリデーション・同時書き込み（4シナリオ）
- `features/phase1/thread.feature` — スレッド作成・一覧・閲覧（10シナリオ）
- `features/phase1/currency.feature` — 初期通貨・残高確認・残高制約・二重消費防止（5シナリオ）

NOTE: BDDステップ定義の実装はスコープ外。サービス層・API層の実装＋単体テストに集中する。

## スコープ

| TASK_ID | 内容 | 担当 | ステータス | 依存 |
|---|---|---|---|---|
| TASK-008 | CurrencyService（通貨サービス）+ AuthService初期通貨連携 | bdd-coding | **completed** | なし |
| TASK-009 | PostService（書き込み・スレッド管理サービス） | bdd-coding | **completed** | TASK-008 |
| TASK-010 | API Route Handlers（threads / posts エンドポイント） | bdd-coding | **completed** | TASK-009 |

## locked_files 競合チェック

| TASK_ID | locked_files |
|---|---|
| TASK-008 | `[NEW] src/lib/services/currency-service.ts`, `[NEW] src/lib/services/__tests__/currency-service.test.ts`, `src/lib/services/auth-service.ts`, `src/lib/services/__tests__/auth-service.test.ts` |
| TASK-009 | `[NEW] src/lib/services/post-service.ts`, `[NEW] src/lib/services/__tests__/post-service.test.ts` |
| TASK-010 | `[NEW] src/app/api/threads/route.ts`, `[NEW] src/app/api/threads/[threadId]/route.ts`, `[NEW] src/app/api/threads/[threadId]/posts/route.ts` |

## 完了基準

- [x] TASK-008: CurrencyService実装完了、初期通貨付与をAuthServiceに統合、単体テストPASS
- [x] TASK-009: PostService実装完了（createPost, createThread, getThreadList, getPostList, getThread）、単体テストPASS
- [x] TASK-010: API Routes実装完了、`npx vitest run` 全件PASS

## 結果

### TASK-008: CurrencyService — **completed**

| 成果物 | 内容 |
|---|---|
| `src/lib/services/currency-service.ts` | credit/deduct/getBalance/initializeBalance（INITIAL_BALANCE=50） |
| `src/lib/services/__tests__/currency-service.test.ts` | 39件テスト |
| `src/lib/services/auth-service.ts`（修正） | issueEdgeToken内にinitializeBalance呼び出し追加 |
| `src/lib/services/__tests__/auth-service.test.ts`（修正） | currency-serviceモック追加、45件テスト |

- エスカレーション: ESC-TASK-008-1（auth-service.test.tsのlocked_files追加 → 自律解決）
- テスト: 248件PASS（6ファイル）

### TASK-009: PostService — **completed**

| 成果物 | 内容 |
|---|---|
| `src/lib/services/post-service.ts` | createPost/createThread/getThreadList/getPostList/getThread |
| `src/lib/services/__tests__/post-service.test.ts` | 37件テスト |

- エスカレーション: なし
- テスト: 285件PASS（7ファイル）

### TASK-010: API Route Handlers — **completed**

| 成果物 | 内容 |
|---|---|
| `src/app/api/threads/route.ts` | GET /api/threads（一覧）, POST /api/threads（作成） |
| `src/app/api/threads/[threadId]/route.ts` | GET /api/threads/{threadId}（詳細+レス一覧） |
| `src/app/api/threads/[threadId]/posts/route.ts` | POST /api/threads/{threadId}/posts（書き込み） |

- エスカレーション: なし
- テスト: 285件PASS（7ファイル、既存テスト破損なし）

## Sprint-5 判定

- エスカレーション: 1件（ESC-TASK-008-1 → 自律解決済み、テストファイルのモック追加のみ）
- BDDシナリオ変更: なし
- 人間確認要否: **不要**（自律的に次スプリントへ進行可能）
