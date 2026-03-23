---
task_id: TASK-287
sprint_id: Sprint-107
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T12:00:00+09:00
updated_at: 2026-03-24T12:00:00+09:00
locked_files:
  - "[NEW] src/lib/domain/constants.ts"
  - src/app/(web)/page.tsx
  - src/app/(web)/_components/ThreadCreateForm.tsx
  - src/app/api/threads/route.ts
  - src/lib/services/post-service.ts
  - src/lib/services/bot-service.ts
  - src/app/(senbra)/test/bbs.cgi/route.ts
  - src/app/(senbra)/[boardId]/SETTING.TXT/route.ts
  - src/app/(senbra)/bbsmenu.json/route.ts
  - src/app/(senbra)/bbsmenu.html/route.ts
  - scripts/upsert-pinned-thread.ts
  - scripts/check-e2e-coverage.ts
---

## タスク概要

サイトリネーム Phase 1。ハードコードされた板ID `"battleboard"` を定数 `DEFAULT_BOARD_ID` に置換する純粋なリファクタリング。値は変更しない（`"battleboard"` のまま）。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/site_rename_migration_plan.md` Section 2 — Phase 1 の詳細手順
2. [参考] `src/lib/domain/` — 既存のドメイン層ファイル構成

## 入力（前工程の成果物）

- `tmp/site_rename_migration_plan.md` Section 2 — 置換対象11ファイルの一覧と置換方針

## 出力（生成すべきファイル）

- `src/lib/domain/constants.ts` — 定数定義ファイル（新規作成）
- 上記 locked_files の各ファイル — `"battleboard"` リテラルを `DEFAULT_BOARD_ID` 参照に置換

## 完了条件

- [ ] `src/lib/domain/constants.ts` が作成され、`DEFAULT_BOARD_ID = "battleboard"` が定義されている
- [ ] locked_files 内の全ファイルで `"battleboard"` 文字列リテラルが `DEFAULT_BOARD_ID` に置換されている
- [ ] `npx vitest run` 全PASS
- [ ] `npx tsc --noEmit` エラーなし
- [ ] 動作の変更がないこと（純粋なリファクタリング）

## スコープ外

- 定数の値の変更（`"battleboard"` → `"livebot"` は Phase 2）
- サイト名 `"BattleBoard"` の定数化・変更（Phase 2）
- テストコード内の `"battleboard"` 置換（Phase 2）
- features/ の変更
- ドキュメントの変更

## 補足・制約

- 移行計画書 Section 2.2 の表に記載された11ファイルが対象。計画書の置換方針に従うこと
- `bot-service.ts` のローカル定数 `BOT_DEFAULT_BOARD_ID` は削除し、`DEFAULT_BOARD_ID` の import に統一する
- テストコードの `boardId: "battleboard"` は変更しない（Section 2.3）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全11ファイルの置換 + constants.ts 新規作成
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/lib/domain/constants.ts` 新規作成（`DEFAULT_BOARD_ID = "battleboard"`）
- `src/app/(web)/page.tsx` — `redirect("/battleboard/")` → `redirect(\`/${DEFAULT_BOARD_ID}/\`)`
- `src/app/(web)/_components/ThreadCreateForm.tsx` — デフォルト値 `"battleboard"` → `DEFAULT_BOARD_ID`
- `src/app/api/threads/route.ts` — 3箇所置換
- `src/lib/services/post-service.ts` — 3箇所置換 + import追加
- `src/lib/services/bot-service.ts` — ローカル定数 `BOT_DEFAULT_BOARD_ID` 削除、`DEFAULT_BOARD_ID` import に統一（2箇所使用箇所置換）
- `src/app/(senbra)/test/bbs.cgi/route.ts` — 3箇所置換
- `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` — マップキー `[DEFAULT_BOARD_ID]` に置換
- `src/app/(senbra)/bbsmenu.json/route.ts` — `url` と `directory_name` を置換
- `src/app/(senbra)/bbsmenu.html/route.ts` — URLパス内の板ID置換
- `scripts/upsert-pinned-thread.ts` — `PINNED_THREAD_BOARD_ID` とURL内板ID置換
- `scripts/check-e2e-coverage.ts` — `DYNAMIC_ROUTE_HINTS` 内の板IDヒント置換

### テスト結果サマリー

- `npx tsc --noEmit`: エラーなし（PASS）
- `npx vitest run`: 88ファイル中87ファイルPASS、1773テスト中1772PASS
  - 失敗1件: `schema-consistency.test.ts` — DBスキーマ不整合（`theme_id`, `font_id`, `daily_events`, `pending_async_commands`）
  - この失敗は本タスク前から存在する既存の問題（git stash で確認済み）。今回の変更と無関係。
