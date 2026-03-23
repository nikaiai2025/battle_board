---
task_id: TASK-290
sprint_id: Sprint-108
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T14:00:00+09:00
updated_at: 2026-03-24T14:00:00+09:00
locked_files:
  - e2e/cf-smoke/workers-compat.spec.ts
  - e2e/fixtures/data.fixture.ts
  - e2e/smoke/navigation.spec.ts
  - e2e/api/senbra-compat.spec.ts
---

## タスク概要

Sprint-108（サイトリネーム Phase 2）で漏れた E2E テストコードの名称更新。

## 名称対応表

| 概念 | 旧 | 新 |
|------|-----|-----|
| 板ID | `battleboard` | `livebot` |
| サイト名 | `BattleBoard` | `ボットちゃんねる` |
| 板名 | `BattleBoard総合` | `なんでも実況B（ボット）` |

## 対象ファイルと箇所

| ファイル | 箇所 |
|---|---|
| `e2e/cf-smoke/workers-compat.spec.ts:26` | `BOARD_ID = "battleboard"` |
| `e2e/fixtures/data.fixture.ts` | `board_id: "battleboard"` / `boardId: "battleboard"`（6箇所） |
| `e2e/smoke/navigation.spec.ts:72` | `toHaveText("BattleBoard")` |
| `e2e/api/senbra-compat.spec.ts:25` | `BOARD_ID = "battleboard"` |
| `e2e/api/senbra-compat.spec.ts` | `"BattleBoard"` アサーション（3箇所）、`directory_name === "battleboard"` / `contain("battleboard")`（2箇所） |

## 完了条件

- [x] 上記全箇所が新名称に更新されている
- [x] `npx tsc --noEmit` エラーなし

## スコープ外

- E2Eテストの実行（本番DBクリア前のため実行不可）
- features/ の変更
- src/ の変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 4ファイルの全置換 + tsc確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `e2e/cf-smoke/workers-compat.spec.ts`: `BOARD_ID = "battleboard"` → `"livebot"`、コメント・テスト名の `/battleboard/` → `/livebot/` も更新
- `e2e/fixtures/data.fixture.ts`: `board_id: "battleboard"` 4箇所・`boardId: "battleboard"` 2箇所 → `"livebot"` に全置換
- `e2e/smoke/navigation.spec.ts`: `toHaveText("BattleBoard")` → `"ボットちゃんねる"`、URLパス `/battleboard/` → `/livebot/` も全置換（`page.goto`・`waitForURL`・`toContain`）
- `e2e/api/senbra-compat.spec.ts`: `BOARD_ID = "battleboard"` → `"livebot"`、`"BattleBoard"` アサーション3箇所・`directory_name === "battleboard"` 1箇所・`.toContain("battleboard")` 1箇所を更新、テスト名も `/battleboard/` → `/livebot/` に更新

### テスト結果サマリー

- `npx tsc --noEmit`: エラーなし（出力なし）
- E2E実行: スコープ外（本番DB未移行のため）
