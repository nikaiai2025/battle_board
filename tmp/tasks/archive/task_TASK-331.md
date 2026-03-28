---
task_id: TASK-331
sprint_id: Sprint-127
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T15:00:00+09:00
updated_at: 2026-03-26T15:00:00+09:00
locked_files:
  - "src/lib/domain/rules/command-parser.ts"
  - "src/lib/domain/rules/__tests__/command-parser.test.ts"
  - "src/lib/services/handlers/copipe-handler.ts"
  - "src/__tests__/lib/services/handlers/copipe-handler.test.ts"
---

## タスク概要

`!copipe` コマンドの引数解析改善。コマンド名と引数の間の半角スペースを省略可能にする。

## 変更内容

### 1. command-parser.ts — COMMAND_PATTERN 修正

コマンド名の直後に空白なしで続く非空白文字列も引数としてキャプチャする。

現在の正規表現（引数キャプチャ部分）:
```
!([a-zA-Z][a-zA-Z0-9_]*)((?:${WHITESPACE}+\\S+|>>\\d+)*)
```

修正後:
```
!([a-zA-Z][a-zA-Z0-9_]*)(\\S*(?:${WHITESPACE}+\\S+|>>\\d+)*)
```

追加した `\\S*` が、コマンド名直後のスペースなしテキスト（例: `!copipeドッキング` の `ドッキング`）をキャプチャする。`\S*` は0文字以上なので、スペースありの場合も既存動作に影響しない。

**影響確認ポイント:**
- `!copipeドッキング` → command: `copipe`, args: `["ドッキング"]` になること
- `!copipe ドッキング` → 既存動作と同一（args: `["ドッキング"]`）
- `!tell >>5` → 既存動作と同一（args: `[">>5"]`）
- `!w>>5` → 既存動作と同一（args: `[">>5"]`）
- `!abeshinzo` → 既存動作と同一（args: `[]`）
- 既存の command-parser テスト全件PASS

### 2. copipe-handler.ts — 引数結合

複数argsを結合して1つの検索キーワードにする。`!copipe ドッキング にぼし` が「ドッキング にぼし」として検索される。

```typescript
// 変更前
const nameArg = ctx.args[0];

// 変更後
const nameArg = ctx.args.join(" ").trim() || undefined;
```

`undefined` にフォールバックすることで、空文字列の場合もランダムモードになる（`!copipe ` 対応）。

## 完了条件

- [ ] `!copipeドッキング` で正しく引数がパースされること（command-parser テスト追加）
- [ ] `!copipe` / `!copipe ` でランダムモードが動作すること
- [ ] 既存の command-parser テスト全件PASS
- [ ] 既存の copipe-handler テスト全件PASS（必要なら修正）
- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` 全件PASS（既存 passed 数が減らないこと）

## スコープ外

- BDD feature ファイルの変更（不要）
- Git コミット（人間がまとめてコミットする）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全て
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. command-parser.ts — COMMAND_PATTERN の正規表現を修正（`\S*` 追加）
   - `!copipeドッキング` → `args: ["ドッキング"]` に対応
   - コメントに「ルール10: コマンド名直後スペースなし引数対応」を追記
2. command-parser.test.ts — 新テストグループ「新ルール: コマンド名直後スペースなし引数」を追加（7件）
3. copipe-handler.ts — `ctx.args[0]` → `ctx.args.join(" ").trim() || undefined` に変更
4. copipe-handler.test.ts — 新テストグループ「引数結合（複数 args を結合して検索）」を追加（4件）

### テスト結果サマリー

| テストファイル | 変更前 | 変更後 | 差分 |
|---|---|---|---|
| command-parser.test.ts | 51 PASS | 58 PASS | +7（新テスト全PASS） |
| copipe-handler.test.ts | 33 PASS | 37 PASS | +4（新テスト全PASS） |
| cucumber-js 全体 | 334 passed | 334 passed | 変化なし |

注: `schema-consistency.test.ts` の1件FAILは今回タスクとは無関係の既存問題（`copipe_entries` テーブルのマイグレーション未適用）。変更前から存在。
