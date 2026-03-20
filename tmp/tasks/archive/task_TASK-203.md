---
task_id: TASK-203
sprint_id: Sprint-75
status: completed
assigned_to: bdd-coding
depends_on: [TASK-202]
created_at: 2026-03-20T12:00:00+09:00
updated_at: 2026-03-20T14:30:00+09:00
locked_files:
  - src/lib/domain/models/thread.ts
  - src/lib/infrastructure/repositories/thread-repository.ts
  - src/lib/services/post-service.ts
  - src/app/(senbra)/[boardId]/subject.txt/route.ts
  - "[NEW] supabase/migrations/*_add_thread_dormancy.sql"
  - src/__tests__/lib/services/post-service.test.ts
  - src/lib/infrastructure/adapters/__tests__/subject-formatter.test.ts
  - src/app/(senbra)/__tests__/route-handlers.test.ts
---

## タスク概要
スレッド休眠(is_dormant)機能を実装する。subject.txtの50件制限を従来のLIMIT方式からis_dormantフラグ方式に移行し、専ブラでのスレッド幽霊蓄積問題を解消する。設計ドキュメント(D-05, D-07, D-08)は更新済み。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/work_summary_thread_dormancy.md` — 実装仕様の詳細（変更対象ファイル・処理フロー・完了条件）
2. [必須] `docs/specs/thread_state_transitions.yaml` — D-05 状態遷移仕様（休眠方式の正本）
3. [必須] `docs/architecture/architecture.md` §4.2, §7.1 step 2b, §11.2, TDR-012
4. [必須] `docs/architecture/components/posting.md` §2.3, §3.1, §5「休眠管理の責務」
5. [必須] `docs/architecture/components/senbra-adapter.md` §5.1, §6「subject.txt フィルタリング」
6. [参考] `docs/research/thread_dormancy_design_2026-03-20.md` — 設計背景・方式決定の経緯

## 出力（生成すべきファイル）
- `supabase/migrations/{timestamp}_add_thread_dormancy.sql` — is_dormantカラム + インデックス
- `src/lib/domain/models/thread.ts` — isDormantフィールド追加
- `src/lib/infrastructure/repositories/thread-repository.ts` — wakeThread, demoteOldestActiveThread, countActiveThreads, findByBoardId onlyActive対応
- `src/lib/services/post-service.ts` — createPost Step 10b(休眠管理), getThreadList onlyActive化
- `src/app/(senbra)/[boardId]/subject.txt/route.ts` — LIMIT → onlyActive: true
- 関連テストファイル — 新規テスト + 既存フィクスチャへのisDormant追加

## 完了条件
- [ ] `is_dormant` カラムがマイグレーションで追加されている
- [ ] Thread ドメインモデルに `isDormant` が存在する
- [ ] ThreadRepository の `findByBoardId` が `onlyActive` オプションに対応している
- [ ] ThreadRepository に `wakeThread`, `demoteOldestActiveThread`, `countActiveThreads` が実装されている
- [ ] PostService の createPost に Step 10b（休眠管理）が実装されている
- [ ] PostService の getThreadList が `onlyActive: true` を使用している
- [ ] subject.txt ルートが LIMIT ではなく `onlyActive: true` を使用している
- [ ] `npx tsc --noEmit` がエラー0件（TASK-202で確立したベースラインを維持）
- [ ] `npx vitest run` が全件PASS
- [ ] `npx cucumber-js` が既存シナリオを壊していない

## スコープ外
- BDDシナリオ（`.feature` ファイル）の変更
- Web UIのスレッド一覧ページの変更（PostService経由で自動的に反映される）
- dat Route Handler / bbs.cgi Route Handlerの変更（不要。休眠スレッドも閲覧・書き込み可能）
- sage機能の実装
- 同時書き込み時のロック機構

## 補足・制約

### 確定済み設計判断（エスカレーション不要）
- sage で休眠スレッドを復活させるか → **無条件に復活**（TDR-012）
- 同時書き込み時の競合制御 → **明示的ロックなし**。一時的に50件超を許容（TDR-012）
- 休眠管理失敗時の挙動 → **書き込み全体をロールバック**（D-08 posting.md §5）

### 重要な実装ノート
- `createPost()` の Step 10b は Step 10（last_post_at更新）の後に実行する
- `targetThread` は Step 0 で取得したスナップショット。isDormant判定に使えるが、countActiveThreadsはDB最新値を参照する
- `THREAD_LIST_MAX_LIMIT`（既存定数 = 50）を利用する
- `is_pinned = true` のスレッドは休眠化対象外
- 休眠管理の失敗は握りつぶさない（try-catchで囲まない。例外を上位に伝搬させる）

### ThreadRow → Thread マッピング
`rowToThread()` で `is_dormant ?? false` のフォールバックを入れること（既存データはDEFAULT false だが安全策）

### テストについて
- TASK-202で`npx tsc --noEmit`がクリーンになっている前提。isDormant追加時に全Threadフィクスチャに`isDormant: false`を追加すること
- ThreadRepository新規関数の単体テストを追加すること
- PostService Step 10b の単体テストを追加すること（休眠→復活、アクティブ数超過→末尾休眠化）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全実装・全テスト PASS
- 未解決の問題: なし

### 進捗ログ

1. `supabase/migrations/00018_add_thread_dormancy.sql` 新規作成 — `is_dormant BOOLEAN NOT NULL DEFAULT false` カラム追加 + 複合インデックス追加
2. `src/lib/domain/models/thread.ts` — `isDormant: boolean` フィールド追加
3. `src/lib/infrastructure/repositories/thread-repository.ts` — `ThreadRow.is_dormant`、`rowToThread()` マッピング、`findByBoardId` の `onlyActive` オプション対応、`wakeThread`/`demoteOldestActiveThread`/`countActiveThreads` 追加
4. `src/lib/services/post-service.ts` — `createPost` Step 10b（休眠管理）追加、`getThreadList` の `onlyActive: true` 移行
5. `src/app/(senbra)/[boardId]/subject.txt/route.ts` — LIMIT → `onlyActive: true` 変更
6. `src/app/(web)/[boardId]/page.tsx`, `src/app/(web)/dev/page.tsx`, `src/app/api/threads/route.ts` — `getThreadList` 引数変更（limit 削除）
7. `features/support/in-memory/thread-repository.ts` — BDD インメモリリポジトリに `wakeThread`/`demoteOldestActiveThread`/`countActiveThreads`/`onlyActive` 追加
8. 既存テストファイル 6件に `isDormant: false` をフィクスチャへ追加（TypeScriptエラー0件維持）
9. `src/__tests__/lib/infrastructure/repositories/thread-dormancy-repository.test.ts` 新規作成（12テスト）
10. `src/lib/services/__tests__/post-service.test.ts` — `getThreadList` テスト更新 + Step 10b テスト8件追加
11. `features/step_definitions/thread.steps.ts` — "51個のアクティブなスレッドが存在する" と "低活性スレッド" ステップに `demoteOldestActiveThread` 呼び出しを追加（BDDシナリオ2件のGREEN化）
12. `npx supabase migration up` 実行 — ローカルDBにマイグレーション適用
13. `npx tsc --noEmit` — 0エラー確認

### テスト結果サマリー

- **単体テスト (Vitest)**: 67ファイル、1431テスト PASS / 0 FAIL
- **BDDテスト (Cucumber)**: 256シナリオ中 240 PASS / 16 pending（UI関連）/ 0 FAIL
  - 新たにPASSになったシナリオ:
    - `スレッド一覧には最新50件のみ表示される` (thread.feature:53)
    - `一覧外のスレッドに書き込むと一覧に復活する` (thread.feature:59)
- **TypeScript**: `npx tsc --noEmit` エラー 0件
