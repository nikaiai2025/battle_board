---
task_id: TASK-288
sprint_id: Sprint-108
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T13:00:00+09:00
updated_at: 2026-03-24T13:00:00+09:00
locked_files:
  - src/lib/domain/constants.ts
  - src/app/layout.tsx
  - src/app/(web)/_components/Header.tsx
  - src/app/(web)/[boardId]/page.tsx
  - src/app/(admin-public)/admin/login/page.tsx
  - src/app/(web)/admin/layout.tsx
  - src/app/(dev)/dev/page.tsx
  - src/app/(senbra)/bbsmenu.json/route.ts
  - src/app/(senbra)/bbsmenu.html/route.ts
  - src/app/(senbra)/[boardId]/SETTING.TXT/route.ts
  - scripts/upsert-pinned-thread.ts
  - features/step_definitions/**
  - features/support/**
  - features/integration/**
  - src/**/*.test.ts
---

## タスク概要

サイトリネーム Phase 2 のコード変更。ソースコードの名称変更（§3.1〜3.4）とテストコードの一括置換（§3.5）を実施する。

## 名称対応表

| 概念 | 旧 | 新 |
|------|-----|-----|
| 板ID | `battleboard` | `livebot` |
| サイト名 | `BattleBoard` | `ボットちゃんねる` |
| 板名 | `BattleBoard総合` | `なんでも実況B（ボット）` |

**注意:** `BattleBoardWorld` 等の内部クラス名は変更しない。リポジトリ名 `battle_board` も変更しない。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/site_rename_migration_plan.md` Section 3.1〜3.5 — 変更対象の詳細一覧
2. [必須] `src/lib/domain/constants.ts` — Phase 1 で作成した定数ファイル

## 出力（生成すべきファイル）

- 移行計画書 §3.1: `constants.ts` の値変更（1行）
- 移行計画書 §3.2: サイト名変更（9ファイル）
- 移行計画書 §3.3: 板名変更（3ファイル）
- 移行計画書 §3.4: 固定コンテンツ変更（1ファイル）
- 移行計画書 §3.5: テストコード一括置換（~50ファイル）

## 完了条件

- [ ] `DEFAULT_BOARD_ID` が `"livebot"` に変更されている
- [ ] ソースコード内に旧サイト名 `"BattleBoard"` が残存しない（内部クラス名除く）
- [ ] ソースコード内に旧板名 `"BattleBoard総合"` が残存しない
- [ ] テストコード内に旧板ID `"battleboard"` が残存しない（内部クラス名・リポジトリ名除く）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS（既存のpendingを除く）
- [ ] `npx tsc --noEmit` エラーなし

## スコープ外

- features/*.feature の変更（人間が変更済み）
- docs/ 配下のドキュメント変更（TASK-289で実施）
- ドメイン・URL変更（Phase 3）
- DB移行（デプロイ後に別途実施）
- .env ファイルの変更（Phase 3）
- wrangler.toml の変更（Phase 3）

## 補足・制約

- `BattleBoardWorld`（BDDテストのWorldクラス）は変更対象外
- `battle_board`（リポジトリ名・ディレクトリ名）は変更対象外
- テストコードの置換は機械的だが、上記の除外パターンに注意すること
- InMemoryリポジトリ内のテストデータも板IDを `"livebot"` に更新すること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: §3.1 定数値変更、§3.2 サイト名変更(9ファイル)、§3.3 板名変更(3ファイル)、§3.4 固定コンテンツ変更(1ファイル)、§3.5 テストコード一括置換
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- §3.1: `src/lib/domain/constants.ts` の `DEFAULT_BOARD_ID` を `"battleboard"` -> `"livebot"` に変更
- §3.2: 9ファイルでサイト名 `"BattleBoard"` -> `"ボットちゃんねる"` を変更（layout.tsx, Header.tsx, [boardId]/page.tsx, admin/login/page.tsx, admin/layout.tsx, dev/page.tsx, bbsmenu.json/route.ts, bbsmenu.html/route.ts, SETTING.TXT/route.ts）
- §3.3: 3ファイルで板名 `"BattleBoard総合"` -> `"なんでも実況B（ボット）"` を変更（bbsmenu.json/route.ts, bbsmenu.html/route.ts, SETTING.TXT/route.ts）
- §3.4: `scripts/upsert-pinned-thread.ts` の固定スレッドタイトル・本文タイトルを `"■ BattleBoard 案内板"` -> `"■ ボットちゃんねる 案内板"` に変更
- §3.5: テストコード一括置換。対象: src/**/*.test.ts (23ファイル), features/step_definitions/*.ts (20ファイル)。板ID `"battleboard"` -> `"livebot"`、サイト名 `"BattleBoard"` -> `"ボットちゃんねる"`、板名 `"BattleBoard総合"` -> `"なんでも実況B（ボット）"` を置換
- 除外: `BattleBoardWorld`（内部クラス名）、ドメイン名 `battleboard.vercel.app` / `battleboard.example.com` / `battleboard.test`（Phase 3対象）、locked_files外のJSDocコメント内の板ID例示

### テスト結果サマリー
- `npx tsc --noEmit`: PASS（エラーなし）
- `npx vitest run`: 87 passed / 1 failed (schema-consistency.test.ts: 既存のDB未マイグレーション問題。名称変更とは無関係) / 1772 tests passed
- `npx cucumber-js`: 324 scenarios passed / 16 pending (既存) / 1740 steps passed
