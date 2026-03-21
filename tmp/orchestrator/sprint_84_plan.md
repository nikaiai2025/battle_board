# Sprint-84: ウェルカムシーケンス + CF Cron + マイページ — 実装 Wave 1-2

> 開始日: 2026-03-21
> ステータス: completed

## 背景

Sprint-83の設計成果（TASK-236, TASK-237）に基づく実装フェーズ。
設計書の依存関係に従い、2波（Wave）に分けて実行する。

## タスク一覧

### Wave 1（並行実行、依存なし）

| TASK_ID | 担当 | 内容 | locked_files | 状態 |
|---|---|---|---|---|
| TASK-238 | bdd-coding | CF Cron scheduled ハンドラ + wrangler.toml + bot-scheduler.yml無効化 | `wrangler.toml`, `src/cf-scheduled.ts`[NEW], `.github/workflows/bot-scheduler.yml` | **completed** |
| TASK-239 | bdd-coding | Welcome sync(①②) + Currency v5 + pending_tutorials DB + PendingTutorialRepository | `src/lib/services/post-service.ts`, `src/lib/services/currency-service.ts`, `src/lib/infrastructure/repositories/post-repository.ts`, `src/lib/domain/models/currency.ts`, `supabase/migrations/*`[NEW], `src/lib/infrastructure/repositories/pending-tutorial-repository.ts`[NEW] | **completed** |

### Wave 2（Wave 1完了後、並行実行）

| TASK_ID | 担当 | 内容 | depends_on | locked_files | 状態 |
|---|---|---|---|---|---|
| TASK-240 | bdd-coding | Tutorial BOT Strategy + bot_profiles.yaml + PostInput.botUserId + resolveStrategies | TASK-239 | `config/bot_profiles.yaml`, `src/lib/services/bot-strategies/*`[NEW+既存], `src/lib/services/bot-service.ts`, `src/lib/services/post-service.ts` | **completed** |
| TASK-241 | bdd-coding | Mypage searchByAuthorId + getPostHistory拡張 + APIルートparams + OpenAPI | TASK-239 | `src/lib/infrastructure/repositories/post-repository.ts`, `src/lib/services/mypage-service.ts`, `src/app/api/mypage/history/route.ts`, `docs/specs/openapi.yaml` | **completed** |

## 実行計画

```
Wave 1: TASK-238 (CF Cron) ∥ TASK-239 (Welcome sync)
         ↓                    ↓
Wave 2:                  TASK-240 (BOT Strategy) ∥ TASK-241 (Mypage backend)
```

## 後続スプリント（Sprint-85予定）

- Tutorial BOT spawn + daily reset + BDD step definitions (welcome.feature)
- Mypage UI (PostHistorySection.tsx) + BDD step definitions (mypage.feature pagination/search)
- Documentation updates (D-08 bot.md, posting.md, currency.md)

## 結果

全4タスク completed。

- TASK-238: CF Cron handler (cf-scheduled.ts) + wrangler.toml + bot-scheduler.yml 無効化
- TASK-239: Welcome sync (PostService Step 6.5/11.5) + Currency v5 (INITIAL_BALANCE=0) + pending_tutorials DB + PendingTutorialRepository。1560テスト全PASS
- TASK-240: Tutorial BOT 3 Strategy + bot_profiles.yaml tutorial + PostInput.botUserId + 日次リセット除外 + クリーンアップ。1575テスト PASS (mypage 9件失敗はTASK-241作業中)
- TASK-241: searchByAuthorId + getPostHistory拡張 + API params + OpenAPI + 後方互換修正。1628テスト全PASS

**テスト最終状態:** vitest 1628 PASS / 78ファイル
