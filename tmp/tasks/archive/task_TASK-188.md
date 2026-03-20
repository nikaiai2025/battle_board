---
task_id: TASK-188
sprint_id: Sprint-68
status: completed
assigned_to: bdd-coding
depends_on: [TASK-187]
created_at: 2026-03-19T23:30:00+09:00
updated_at: 2026-03-19T23:30:00+09:00
locked_files:
  - "[NEW] src/app/(web)/_components/thread-types.ts"
  - "src/app/(web)/[boardId]/page.tsx"
  - "src/app/(web)/dev/page.tsx"
  - "src/app/(web)/_components/ThreadList.tsx"
  - "src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx"
  - "src/app/(web)/_components/PostListLiveWrapper.tsx"
  - src/types/index.ts
---

## タスク概要

TASK-187（アーキテクト設計）の統合方針に従い、Thread型定義の重複を解消する。型定義のみの変更であり、ユーザーの振る舞いには影響しない。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md` — 統合方針（全文読むこと）
2. [必須] 方針書に記載された変更対象ファイル（各ファイルの現状を確認してから変更）

## 入力（前工程の成果物）
- `tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md` — 統合方針書

## 出力（生成すべきファイル）
- `src/app/(web)/_components/thread-types.ts` — 新規（ThreadSummary, ThreadDetail）
- 既存6ファイルの型定義修正

## 完了条件
- [ ] 方針書 §3.1〜§3.3 の全変更を実施
- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` 全シナリオPASS
- [ ] `npx next build` 成功（型エラーなし）

## スコープ外
- 方針書 §3.4「変更しないもの」に記載されたファイルの変更
- BDDシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全ステップ（Step 1〜5）
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- Step 1: `src/app/(web)/_components/thread-types.ts` 新規作成（ThreadSummary, ThreadDetail 定義）
- Step 2: 各ページ・コンポーネントのローカル型を ThreadSummary / ThreadDetail に置換
  - `src/app/(web)/[boardId]/page.tsx`: `interface ThreadView` 削除 → `import { ThreadSummary }`
  - `src/app/(web)/dev/page.tsx`: `interface ThreadView` 削除 → `import { ThreadSummary }`
  - `src/app/(web)/_components/ThreadList.tsx`: `interface Thread` 削除 → `import { ThreadSummary }`
  - `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`: `interface Thread` 削除 → `import { ThreadDetail }`
- Step 3: `PostListLiveWrapper.tsx` の `ThreadDetailResponse` を `PollingResponse` にリネーム
- Step 4: `src/types/index.ts` の `ThreadInput`（デッドコード）削除
- Step 5: テスト実行 → 全件PASS・ビルド成功

### テスト結果サマリー

- `npx vitest run`: 64ファイル / 1381テスト 全件PASS
- `npx cucumber-js`: 254シナリオ（238 passed, 16 pending） ※ pendingは本タスクと無関係の既存のもの
- `npx next build`: 型エラーなし、ビルド成功
