---
task_id: TASK-059
sprint_id: Sprint-21
status: completed
assigned_to: bdd-coding
depends_on: [TASK-058]
created_at: 2026-03-15T14:00:00+09:00
updated_at: 2026-03-15T14:00:00+09:00
locked_files:
  - "[NEW] src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts"
  - "[NEW] src/app/(senbra)/[boardId]/route.ts"
  - "[NEW] src/app/(senbra)/[boardId]/kako/[...path]/route.ts"
  - features/step_definitions/specialist_browser_compat.steps.ts
---

## タスク概要

5ch URL体系互換のためのルートハンドラを3つ新設する。専ブラがbbs.cgiのURLパターンから自動構築するURL（read.cgi・板トップ・過去ログ）に応答できるようにする。

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature`
  - @read.cgiのURLでスレッドが閲覧できる
  - @板トップURLがアクセス可能である
  - @過去ログ(kako)リクエストに適切に応答する

## 必読ドキュメント（優先度順）

1. [必須] `features/constraints/specialist_browser_compat.feature` — 対象シナリオ3件（URL体系互換セクション）
2. [必須] 既存のルートハンドラ（パターン参考）:
   - `src/app/(senbra)/[boardId]/subject.txt/route.ts`
   - `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts`
3. [参考] `src/app/(web)/page.tsx` — Web UIのスレッド一覧ページ（リダイレクト先）

## 入力（前工程の成果物）

なし

## 出力（生成すべきファイル）

- `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` — GETでWeb UIスレッド表示ページへ302リダイレクト
- `src/app/(senbra)/[boardId]/route.ts` — GETでWeb UIスレッド一覧ページへ302リダイレクト
- `src/app/(senbra)/[boardId]/kako/[...path]/route.ts` — GET で 404応答（Shift_JIS）
- `features/step_definitions/specialist_browser_compat.steps.ts` — ステップ定義追加

## 完了条件

- [x] `/test/read.cgi/battleboard/1234567890/` → Web UIスレッド表示ページへリダイレクト
- [x] `/battleboard/` → Web UIスレッド一覧ページへリダイレクト
- [x] `/battleboard/kako/xxxx/1234567890.dat` → 404（専ブラが解釈可能な形式）
- [x] BDDステップ定義追加（3シナリオ分）
- [x] テストコマンド: `npx vitest run` && `npx cucumber-js`

## 補足・制約

- read.cgiのパスは `/test/read.cgi/{boardId}/{key}/` （末尾スラッシュあり）。5chの標準URL体系に従う
- 板トップ `/battleboard/` は既存の `(senbra)/[boardId]/` ルートグループ内。subject.txt等の既存ルートと競合しないこと（Next.js App Routerの動的ルート解決順序に注意）
- kako は過去ログ機能未実装のためスタブ（404）でよい。専ブラのリトライ防止が目的
- リダイレクト先のWeb UIパスは既存のページ構造を確認して決定すること

## スコープ外

- Web UIページの変更
- 既存のsubject.txt/dat/SETTING.TXTルートの変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全成果物実装・テスト PASS確認済み
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [1] ドキュメント・既存コード調査完了
- [2] 3つのルートハンドラ実装完了
  - `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` — 302リダイレクト（threadKey→threadId変換）
  - `src/app/(senbra)/[boardId]/route.ts` — 302リダイレクト（Web UIスレッド一覧）
  - `src/app/(senbra)/[boardId]/kako/[...path]/route.ts` — 404（Shift_JIS形式）
- [3] BDDステップ定義追加完了（3シナリオ分 + Before hookリセット変数追加）
- [4] テスト全PASSを確認

### テスト結果サマリー
- 単体テスト (Vitest): 601 passed / 0 failed（18 test files）
- BDDテスト (Cucumber.js): 101 passed / 4 undefined / 0 failed（105 scenarios）
  - 今回追加した3シナリオ: PASS
    - `read.cgiのURLでスレッドが閲覧できる`: PASS
    - `板トップURLがアクセス可能である`: PASS
    - `過去ログ(kako)リクエストに適切に応答する`: PASS
  - undefined 4件はタスクスコープ外（Set-Cookie属性検証・HTTP:80インフラ制約）
