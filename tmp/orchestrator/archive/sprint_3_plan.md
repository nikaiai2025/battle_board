# Sprint-3 計画・結果

> Sprint ID: Sprint-3
> 期間: 2026-03-08
> ステータス: **completed**

---

## 目的

Phase 1 Step 3 — リポジトリ層を実装する。
Supabase クライアント経由のCRUD操作をドメインモデル型で抽象化し、上位サービス層から利用可能にする。

## スコープ

Step 3 のリポジトリは計9ファイル。locked_files の競合を避けるため、2タスクに分割する。

| TASK_ID | 内容 | 担当 | ステータス | 依存 |
|---|---|---|---|---|
| TASK-004 | リポジトリ層A: thread, post, user, currency | bdd-coding | assigned | なし |
| TASK-005 | リポジトリ層B: bot, bot-post, accusation, incentive-log, auth-code | bdd-coding | assigned | なし |

## locked_files 競合チェック

| TASK_ID | locked_files |
|---|---|
| TASK-004 | `[NEW] src/lib/infrastructure/repositories/thread-repository.ts`, `[NEW] src/lib/infrastructure/repositories/post-repository.ts`, `[NEW] src/lib/infrastructure/repositories/user-repository.ts`, `[NEW] src/lib/infrastructure/repositories/currency-repository.ts` |
| TASK-005 | `[NEW] src/lib/infrastructure/repositories/bot-repository.ts`, `[NEW] src/lib/infrastructure/repositories/bot-post-repository.ts`, `[NEW] src/lib/infrastructure/repositories/accusation-repository.ts`, `[NEW] src/lib/infrastructure/repositories/incentive-log-repository.ts`, `[NEW] src/lib/infrastructure/repositories/auth-code-repository.ts` |

→ **重複なし。並行実行可能。**

## 完了基準

- [ ] TASK-004: 4リポジトリ実装完了、`npx vitest run` PASS
- [ ] TASK-005: 5リポジトリ実装完了、`npx vitest run` PASS

## 結果

### TASK-004: リポジトリ層A — **completed**

| 成果物 | 内容 |
|---|---|
| `src/lib/infrastructure/repositories/thread-repository.ts` | findById, findByThreadKey, findByBoardId, create, incrementPostCount, updateLastPostAt, updateDatByteSize, softDelete |
| `src/lib/infrastructure/repositories/post-repository.ts` | findById, findByThreadId, findByAuthorId, getNextPostNumber, create, softDelete |
| `src/lib/infrastructure/repositories/user-repository.ts` | findById, findByAuthToken, create, updateAuthToken, updateStreak, updateUsername |
| `src/lib/infrastructure/repositories/currency-repository.ts` | findByUserId, create, credit, deduct（楽観ロック）, getBalance |

- テスト: 既存164件 PASS
- エスカレーション: なし
- 注意事項: incrementPostCount / credit / deduct はPostgreSQL RPC関数を前提とした実装。RPC関数（`increment_thread_post_count`, `credit_currency`, `deduct_currency`）の定義が追加マイグレーションとして必要。

### TASK-005: リポジトリ層B — **completed**

| 成果物 | 内容 |
|---|---|
| `src/lib/infrastructure/repositories/bot-repository.ts` | findById, findActive, create, updateHp, updateDailyId, reveal, unreveal, eliminate, increment系3メソッド |
| `src/lib/infrastructure/repositories/bot-post-repository.ts` | create, findByPostId（!tell判定用）, findByBotId |
| `src/lib/infrastructure/repositories/accusation-repository.ts` | create, findByAccuserAndTarget, findByThreadId |
| `src/lib/infrastructure/repositories/incentive-log-repository.ts` | create（ON CONFLICT DO NOTHING）, findByUserIdAndDate, findByUserId |
| `src/lib/infrastructure/repositories/auth-code-repository.ts` | create, findByCode, findByTokenId, markVerified, deleteExpired + AuthCode型定義 |

- テスト: 既存164件 PASS
- エスカレーション: なし

## 申し送り事項

TASK-004で判明: リポジトリ層がPostgreSQL RPC関数を前提としている。以下のRPC関数を追加マイグレーションとして定義する必要がある:
- `increment_thread_post_count(thread_id UUID)`
- `credit_currency(user_id UUID, amount INTEGER)`
- `deduct_currency(user_id UUID, amount INTEGER) → boolean`

→ Sprint-4 で追加マイグレーションタスクを含める。

## Sprint-3 判定

- エスカレーション: 0件
- BDDシナリオ変更: なし
- 人間確認要否: **不要**（自律的に次スプリントへ進行）
