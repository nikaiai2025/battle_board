# スレッド休眠（is_dormant）実装 — 作業概要

作成日: 2026-03-20
起点: 専ブラでスレッド履歴が無限蓄積する問題
設計者: bdd-architect

---

## 1. 目的

subject.txt の LIMIT 方式を廃止し、`is_dormant` フラグによるスレッド休眠管理に移行する。
これにより以下の3要件を同時に満たす。

| # | 要件 | 実現方法 |
|---|---|---|
| R1 | スレッド一覧を常に ≤ 50件に制御 | `is_dormant = false` のみ subject.txt に掲載 |
| R2 | dat落ちなし（休眠スレッドも閲覧・書き込み可能） | dat/ と bbs.cgi は `is_dormant` を条件にしない |
| R3 | 書き込みがあれば一覧に復活 | 書き込み時に `is_dormant = false` に更新 + 末尾スレッドを入れ替え |

## 2. 必読ドキュメント（優先度順）

1. [必須] `docs/specs/thread_state_transitions.yaml` — D-05 状態遷移仕様（休眠方式の正本）
2. [必須] `docs/architecture/architecture.md` §4.2, §7.1 step 2b, §11.2, TDR-012 — D-07 該当箇所
3. [必須] `docs/architecture/components/posting.md` §2.3, §3.1, §5「休眠管理の責務」 — D-08 PostService設計
4. [必須] `docs/architecture/components/senbra-adapter.md` §5.1, §6「subject.txt フィルタリング」 — D-08 専ブラ設計
5. [参考] `docs/research/thread_dormancy_design_2026-03-20.md` — 設計背景・eddist比較・方式決定の経緯

## 3. 確定済み設計判断

コーディングAIが迷わないよう、以下は決定済みである。

| 判断事項 | 決定 | 記録箇所 |
|---|---|---|
| sage で休眠スレッドを復活させるか | **無条件に復活**（sage 復活抑止なし。本PJにsage要件なし、Web版にメール欄なし） | D-05 unlisted→listed 遷移の guard, TDR-012 |
| 同時書き込み時の競合制御 | **明示的ロックなし**。一時的に50件を超えることを許容（次回書き込み時に自動是正） | TDR-012 |
| 休眠管理失敗時の挙動 | **書き込み全体をロールバック**（コマンド/インセンティブと異なり部分スキップ不可） | D-08 posting.md §5 |

## 4. 変更対象ファイルと変更内容

### 4.1 DB マイグレーション（新規作成）

```
supabase/migrations/{timestamp}_add_thread_dormancy.sql
```

- `threads` テーブルに `is_dormant BOOLEAN DEFAULT false` カラム追加
- インデックス `(board_id, is_deleted, is_dormant, last_post_at DESC)` 追加
- 既存行は全て `is_dormant = false`（DEFAULT値で自動設定）

### 4.2 ドメインモデル

```
src/lib/domain/models/thread.ts
```

- `Thread` interface に `isDormant: boolean` フィールド追加

### 4.3 ThreadRepository

```
src/lib/infrastructure/repositories/thread-repository.ts
```

- `ThreadRow` に `is_dormant: boolean` 追加
- `rowToThread()` に `isDormant` マッピング追加（`is_dormant ?? false` フォールバック）
- `findByBoardId()` を改修:
  - `onlyActive: boolean` オプション追加（true の場合 `.eq("is_dormant", false)` を付加）
  - `onlyActive: true` 時は `.limit()` を付けない（D-05 listing_rules: LIMIT不使用）
  - `onlyActive: false` or 未指定時は現行動作を維持（後方互換）
- 新規関数追加:
  - `wakeThread(threadId)` — `is_dormant = false` に更新
  - `demoteOldestActiveThread(boardId)` — `is_deleted=false AND is_dormant=false AND is_pinned=false` の中で `last_post_at` が最古のスレッドを `is_dormant = true` に更新
  - `countActiveThreads(boardId)` — `is_deleted=false AND is_dormant=false` の件数を返す

### 4.4 PostService

```
src/lib/services/post-service.ts
```

**createPost() — Step 10 の後に Step 10b を追加（L564 付近）:**

```
// Step 10b: 休眠管理（D-07 §7.1 step 2b, D-08 posting.md §5）
// 1. 対象スレッドが休眠中なら復活
// 2. アクティブスレッド数 > 50 なら末尾を休眠化
```

処理の流れ:
1. `targetThread`（Step 0 で取得済み、L307）の `isDormant` を確認
2. `isDormant === true` なら `ThreadRepository.wakeThread(input.threadId)` を呼ぶ
3. `ThreadRepository.countActiveThreads(targetThread.boardId)` でアクティブ数を取得
4. `THREAD_LIST_MAX_LIMIT`（既存定数 = 50）を超えていたら `ThreadRepository.demoteOldestActiveThread(targetThread.boardId)` を呼ぶ
5. 失敗時は例外を投げて書き込み全体を巻き戻す（try-catch で握りつぶさない）

注意: `targetThread` は Step 0 時点のスナップショットであり、Step 10 で `last_post_at` が更新された後の状態ではない。`isDormant` の判定には問題ないが、`countActiveThreads` は最新のDB状態を参照する。

**getThreadList() — LIMIT 方式から onlyActive 方式に変更:**

```typescript
// Before:
return ThreadRepository.findByBoardId(boardId, { limit: resolvedLimit });

// After:
return ThreadRepository.findByBoardId(boardId, { onlyActive: true });
```

### 4.5 subject.txt Route Handler

```
src/app/(senbra)/[boardId]/subject.txt/route.ts
```

- `ThreadRepository.findByBoardId(boardId, { limit: 100 })` を `{ onlyActive: true }` に変更
- LIMIT 指定を削除

### 4.6 dat Route Handler（変更なし）

```
src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts
```

- 変更不要。`findByThreadKey` は `is_dormant` を条件にしない（D-05 dormancy_visibility: dat は休眠スレッドも返す）

### 4.7 bbs.cgi Route Handler（変更なし）

```
src/app/(senbra)/test/bbs.cgi/route.ts
```

- 変更不要。書き込みは PostService 経由であり、PostService の Step 10b で休眠管理が行われる

## 5. 完了条件

- [ ] `is_dormant` カラムがマイグレーションで追加されている
- [ ] Thread ドメインモデルに `isDormant` が存在する
- [ ] ThreadRepository の `findByBoardId` が `onlyActive` オプションに対応している
- [ ] PostService の createPost に Step 10b（休眠管理）が実装されている
- [ ] PostService の getThreadList が `onlyActive: true` を使用している
- [ ] subject.txt ルートが LIMIT ではなく `onlyActive: true` を使用している
- [ ] `npx vitest run` が全件 PASS
- [ ] `npx cucumber-js` が既存シナリオを壊していない

## 6. スコープ外

- BDD シナリオ（`.feature` ファイル）の変更（CLAUDE.md 禁止事項）
- Web UI のスレッド一覧ページの変更（PostService 経由で自動的に反映される）
- dat Route Handler / bbs.cgi Route Handler の変更（不要）
- sage 機能の実装
- 同時書き込み時のロック機構
