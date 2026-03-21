# Sprint-89 計画書

> 作成日: 2026-03-22

## 目的

固定スレッド（案内板）のコマンド一覧に隠しコマンド `!abeshinzo` が表示されるバグの修正。

## スコープ

### TASK-258: 固定スレッド生成スクリプトの hidden コマンド除外

- **担当:** bdd-coding
- **優先度:** 高（ユーザー向け表示バグ）
- **内容:** `scripts/upsert-pinned-thread.ts` の `loadCommandConfigs()` で `hidden` フラグをフィルタに追加 + スクリプト再実行
- **locked_files:**
  - `scripts/upsert-pinned-thread.ts`

## 結果

| TASK | ステータス | 備考 |
|---|---|---|
| TASK-258 | completed | 全テストPASS (vitest 78ファイル/1638テスト) |
