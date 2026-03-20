---
task_id: TASK-170
sprint_id: Sprint-62
status: completed
assigned_to: bdd-coding
depends_on: [TASK-165]
created_at: 2026-03-19T22:30:00+09:00
updated_at: 2026-03-19T22:30:00+09:00
locked_files:
  - src/app/(senbra)/[boardId]/route.ts
---

## タスク概要

Vercelビルドエラーの修正。`(senbra)/[boardId]/route.ts` (route handler) と `(web)/[boardId]/page.tsx` (page) が同一URL `/{boardId}` で衝突している。Sprint-61で `(web)/[boardId]/page.tsx` が板トップページとして新設されたため、`(senbra)/[boardId]/route.ts` のリダイレクト機能は不要になった。このファイルを削除する。

## 修正内容

`src/app/(senbra)/[boardId]/route.ts` を削除する。

理由:
- このファイルは `/{boardId}/` を `/ `にリダイレクトしていた
- TASK-165(Sprint-61)で `(web)/[boardId]/page.tsx` が作成され、`/{boardId}/` は直接ページ表示する
- Next.js App Router で同一パスに page.tsx と route.ts を配置できないため、ビルドエラーが発生

`(senbra)/[boardId]/` ディレクトリ自体は削除しない（`subject.txt/route.ts`, `dat/[threadKey]/route.ts` 等のサブルートが存在する）。

## 完了条件
- [ ] `src/app/(senbra)/[boardId]/route.ts` が削除されている
- [ ] `npx next build` がエラーなく完了する（実際のビルド実行は不要。ファイル削除のみでOK）
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- `(senbra)/[boardId]/` 配下のサブルート（subject.txt, dat, SETTING.TXT, kako）は変更しない

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: `src/app/(senbra)/[boardId]/route.ts` の削除
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/app/(senbra)/[boardId]/route.ts` を削除。サブディレクトリ（dat, kako, SETTING.TXT, subject.txt）は残存を確認済み。

### テスト結果サマリー

- `npx vitest run` 実行: 64ファイル中63 PASS / 1 FAIL
- 失敗テスト: `src/__tests__/integration/schema-consistency.test.ts` — `BotRow.next_post_at` カラム不整合
  - この失敗は今回の変更前から既存の問題（`git stash` で変更前に戻した状態でも同一のテストが失敗することを確認済み）
  - 今回の作業（route.ts削除）とは無関係
