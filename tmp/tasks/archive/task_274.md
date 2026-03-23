---
task_id: TASK-274
sprint_id: Sprint-99
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T23:00:00+09:00
updated_at: 2026-03-22T23:00:00+09:00
locked_files:
  - src/lib/domain/rules/command-parser.ts
---

## タスク概要

本番バグ修正: ステルスコマンド（!aori, !iamsystem）の本文除去が機能しない。`parseCommand()` の `raw` フィールドがホワイトスペースを正規化して再構築するため、`post-service.ts` の `String.replace()` が元の本文テキストと一致しない。

## 根本原因

`command-parser.ts` Line 165-166:
```typescript
const raw = args.length > 0 ? `!${commandName} ${args.join(" ")}` : `!${commandName}`;
```

`args.join(" ")` は半角スペース1文字で結合するが、ユーザーの本文に全角スペース・複数スペース・スペースなし（Rule 9: `!aori>>5`）がある場合、再構築された `raw` は元の本文に存在しないテキストになる。

`post-service.ts` の `resolvedBody.replace(commandResult.rawCommand, "")` が不一致で無声失敗する。

## 修正内容

### `src/lib/domain/rules/command-parser.ts` Line 165-166

**Before:**
```typescript
const raw = args.length > 0 ? `!${commandName} ${args.join(" ")}` : `!${commandName}`;
```

**After:**
```typescript
const raw = match[0];
```

`match[0]` は COMMAND_PATTERN の実マッチテキストであり、元の本文中のサブストリングそのもの。lookbehind は zero-width なのでマッチテキストに含まれない。

**なぜ正しいか:**
- `!aori >>5`（単一スペース）→ match[0] = `"!aori >>5"` → replace成功
- `!aori  >>5`（二重スペース）→ match[0] = `"!aori  >>5"` → replace成功
- `!aori　>>5`（全角スペース）→ match[0] = `"!aori　>>5"` → replace成功
- `!aori>>5`（スペースなし, Rule 9）→ match[0] = `"!aori>>5"` → replace成功
- `>>5 !aori`（前方引数）→ match[0] = `"!aori"` → replace成功（>>5は残留、これが正しい）

**BDDテストへの影響:**
- 既存BDDテストは全て単一半角スペースの入力を使用 → `match[0]` と再構築結果が同一 → テスト結果に変化なし

## 必読ドキュメント
1. [必須] `src/lib/domain/rules/command-parser.ts` — 修正対象（`parseCommand()`のrawフィールド）
2. [参考] `src/lib/services/post-service.ts` L485-504 — Step 5.5 ステルス処理（replace使用箇所）
3. [参考] `src/lib/services/command-service.ts` L746-758 — rawCommand伝播

## 完了条件
- [ ] command-parser.ts の raw フィールドが `match[0]` を使用している
- [ ] 単体テスト全件PASS（`npx vitest run`）
- [ ] BDDテスト全件PASS（`npx cucumber-js`）— 特に command_aori.feature と command_iamsystem.feature のステルスシナリオ

## スコープ外
- post-service.ts の変更（不要。rawが正確なら既存のreplaceロジックで動作する）
- command-parser の新規単体テスト追加（別タスクで対応可）
- locked_files 外のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: command-parser.ts の raw フィールドを match[0] に変更、単体テスト・BDDテスト全件確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/lib/domain/rules/command-parser.ts` Line 164-166 を修正
  - Before: `const raw = args.length > 0 ? \`!${commandName} ${args.join(" ")}\` : \`!${commandName}\`;`
  - After: `const raw = match[0];`
  - match[0] は COMMAND_PATTERN の実マッチテキスト（lookbehind は zero-width のため不含）
  - 空白の正規化による post-service.ts の String.replace() 不一致バグを解消

### テスト結果サマリー

**単体テスト（npx vitest run）**
- 結果: 84ファイルPASS / 1ファイルFAIL
- 失敗: `schema-consistency.test.ts` — `pending_async_commands` テーブルが DB スキーマに存在しない（今回の修正と無関係の既存問題）
- command-parser 関連テスト: 全件PASS

**BDDテスト（npx cucumber-js）**
- 結果: 313シナリオ — 297 PASS / 16 Pending / 0 FAIL
- Pending シナリオは Discord認証・UI表示の未実装部分（今回の修正と無関係）
- command_aori.feature、command_iamsystem.feature のステルスシナリオ: PASS
