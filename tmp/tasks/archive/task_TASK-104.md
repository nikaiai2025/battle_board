---
task_id: TASK-104
sprint_id: Sprint-35
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T14:00:00+09:00
updated_at: 2026-03-17T14:00:00+09:00
locked_files:
  - "src/app/api/threads/route.ts"
  - "[NEW] src/app/(web)/dev/"
  - "src/app/(senbra)/bbsmenu.html/route.ts"
  - "src/app/(web)/threads/[threadId]/page.tsx"
  - "src/app/(web)/components/ThreadCreateForm.tsx"
---

## タスク概要

開発連絡板（dev板）を設置する。既存のboardIdパラメータ化済みアーキテクチャの上に構築し、Web UIとbbsmenuに対応する。

設計方針は `tmp/feature_plan_pinned_thread_and_dev_board.md` §3 に記載済み（人間承認済み）。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/feature_plan_pinned_thread_and_dev_board.md` — 機能計画書（§3 開発連絡板部分）
2. [必須] `src/app/api/threads/route.ts` — スレッドAPI（boardIdハードコード箇所）
3. [必須] `src/app/(web)/page.tsx` — メイン板トップページ（参照実装）
4. [必須] `src/app/(web)/components/ThreadCreateForm.tsx` — スレッド作成フォーム
5. [必須] `src/app/(senbra)/bbsmenu.html/route.ts` — bbsmenu生成
6. [必須] `src/app/(web)/threads/[threadId]/page.tsx` — スレッド詳細ページ（戻るリンク修正）
7. [参考] `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` — SETTING.TXT

## 出力（生成すべきファイル）
1. `src/app/api/threads/route.ts` — POST bodyからboardIdを受け取るよう修正
2. `src/app/(web)/dev/page.tsx` — 開発連絡板ページ（新規）
3. `src/app/(web)/components/ThreadCreateForm.tsx` — boardId prop追加
4. `src/app/(senbra)/bbsmenu.html/route.ts` — dev板のリンク追加
5. `src/app/(web)/threads/[threadId]/page.tsx` — 戻るリンクをboardIdに応じて分岐

## 完了条件
- [ ] `/dev/` ページでスレッド一覧・作成ができる
- [ ] dev板で作成したスレッドはメイン板に表示されない
- [ ] bbsmenu.htmlにdev板のリンクが含まれる
- [ ] スレッド詳細から正しい板の一覧に戻れる
- [ ] 既存テスト全PASS（回帰なし）
- [ ] `npx vitest run` 全PASS
- [ ] `npm run build` 成功
- [ ] テストコマンド: `npx vitest run` + `npm run build`

## スコープ外
- 固定スレッドの実装（TASK-103で実施）
- BDDシナリオの追加（dev板はfeature未定義のため、ビルド成功+既存回帰なしで完了）
- D-07/D-08ドキュメント更新

## 補足・制約
- 計画書§3-cの方針に従い、POST /api/threads のボディに boardId を追加する方式（方式A）を採用
- メイン板（/）は引き続き boardId="battleboard" 固定
- dev板のゲームコマンドは有効のまま（計画書の判断通り）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク
- 次にすべきこと: なし
- 未解決の問題: pinned-thread.test.ts の2件失敗（TASK-103起因の既存問題。今回の変更による回帰ではない）

### 進捗ログ

1. `src/app/(web)/_components/ThreadCreateForm.tsx` — `boardId` prop 追加、POST body に boardId を含めるよう修正
2. `src/app/api/threads/route.ts` — POST body から boardId を受け取るよう修正（デフォルト "battleboard"）
3. `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` — `dev` 板の設定を BOARD_SETTINGS に追加
4. `src/app/(senbra)/bbsmenu.html/route.ts` — 開発連絡板リンクを追加
5. `src/app/(web)/threads/[threadId]/page.tsx` — Thread インターフェースに boardId 追加、戻るリンクを boardId で分岐
6. `src/app/(web)/dev/page.tsx` — 新規作成（開発連絡板ページ）
7. `src/lib/services/post-service.ts` — ThreadRepository.create に `isPinned: false` 追加（TASK-103起因のビルドエラー修正）
8. `package.json` / `package-lock.json` — `@types/js-yaml` 追加（TASK-103起因のビルドエラー修正）

### テスト結果サマリー

- `npx vitest run`: 37ファイル中36 PASS / 1 FAIL
  - 失敗: `pinned-thread.test.ts` 2件（TASK-103の既存失敗テスト。今回変更前は4件失敗だったが、isPinned修正で2件改善）
  - 今回の変更による回帰: 0件
- `npm run build`: 成功（/dev ページ含む全ルート生成確認）
