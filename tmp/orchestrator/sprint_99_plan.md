# Sprint-99 計画書

> 開始: 2026-03-22

## 目標

本番バグ修正: !aori ステルスが機能しない（コマンド文字列が本文に残る）

## 背景

ユーザーから「!aoriがステルスになってない」との報告。
コードトレースにより、`command-parser.ts` の `raw` フィールドが `args.join(" ")` で再構築される際にホワイトスペースが正規化（半角単一スペースに統一）されるため、元の本文テキストとの完全一致が取れず `String.replace()` が無声失敗する問題を特定。

影響範囲: !aori, !iamsystem の全ステルスコマンド

## 根本原因

`src/lib/domain/rules/command-parser.ts` Line 165-166:
```typescript
const raw = args.length > 0 ? `!${commandName} ${args.join(" ")}` : `!${commandName}`;
```

`args.join(" ")` は半角スペース1文字で結合するが、元の本文に全角スペース・複数スペース・スペースなし（Rule 9）がある場合、再構築された `raw` と元の本文が一致しない。

`post-service.ts` Line 493:
```typescript
resolvedBody = resolvedBody.replace(commandResult.rawCommand, "").trim();
```
`String.replace()` は第一引数を完全一致のサブストリングとして検索するため、不一致時は何もしない。

## 修正方針

`raw` フィールドを `match[0]`（正規表現の実マッチテキスト）に変更する。これにより元の本文に出現するテキストと完全一致が保証される。

前方引数（`>>5 !aori`）の場合:
- 現行: raw = `"!aori >>5"` → 本文 `">>5 !aori"` と不一致（既に壊れている）
- 修正後: raw = match[0] = `"!aori"` → replace成功（`>>5` は通常アンカーとして残留）

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-274 | bdd-coding | command-parser.ts raw フィールド修正 | なし | completed |

### 競合管理

単一タスク。競合なし。

## 結果

### TASK-274: command-parser.ts raw フィールド修正
- `command-parser.ts` Line 165-166: `args.join(" ")` による再構築 → `match[0]`（正規表現の実マッチテキスト）に変更
- テスト: vitest 1724 passed（schema-consistency 1件は既存問題）/ BDD 297 passed — 回帰なし
- command_aori.feature / command_iamsystem.feature のステルスシナリオ全件PASS
