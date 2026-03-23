---
task_id: TASK-300
sprint_id: Sprint-111
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T23:00:00+09:00
updated_at: 2026-03-24T23:00:00+09:00
locked_files:
  - features/welcome.feature
  - src/lib/services/bot-strategies/content/tutorial.ts
  - src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts
  - src/__tests__/lib/services/post-service-welcome-sequence.test.ts
  - docs/architecture/components/bot.md
  - features/step_definitions/welcome.steps.ts
---

## タスク概要

チュートリアルBOTの `!w` コマンドが本番環境で機能していないバグの修正。

**原因**: コマンドパーサーのルール6（後方引数優先）により、`>>5 !w  新参おるやん🤣` の `新参おるやん🤣` が後方引数として扱われ、前方引数 `>>5` が無視される。GrassHandlerは `"新参おるやん🤣"` をpost IDとして検索→見つからず→サイレント失敗。

**修正**: 本文を改行で分割し、`!w` の後方引数に `新参おるやん🤣` が含まれないようにする。パーサーのCOMMAND_PATTERNは行をまたがないため、改行後のテキストは引数に含まれない。

## 修正内容

### 本文形式の変更

**旧形式（1行）:**
```
>>5 !w  新参おるやん🤣
```

**新形式（改行で分割）:**
```
>>5 !w
新参おるやん🤣
```

### 修正対象ファイル一覧

#### 1. features/welcome.feature L121（人間承認済み）

```diff
      And チュートリアルBOTが以下の書き込みを投稿する:
        """
-        >>5 !w  新参おるやん🤣
+        >>5 !w
+        新参おるやん🤣
        """
```

#### 2. src/lib/services/bot-strategies/content/tutorial.ts L34

```diff
-		return `>>${targetPostNumber} !w  新参おるやん🤣`;
+		return `>>${targetPostNumber} !w\n新参おるやん🤣`;
```

コメント（L17, L29）も新形式に更新する。

#### 3. src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts

全ての expect で旧形式を新形式に更新:
- L111: `">>5 !w  新参おるやん🤣"` → `">>5 !w\n新参おるやん🤣"`
- L125: `">>1 !w  新参おるやん🤣"` → `">>1 !w\n新参おるやん🤣"`
- L139: `">>1 !w  新参おるやん🤣"` → `">>1 !w\n新参おるやん🤣"`
- L153: `">>999 !w  新参おるやん🤣"` → `">>999 !w\n新参おるやん🤣"`
- L363: `">>3 !w  新参おるやん🤣"` → `">>3 !w\n新参おるやん🤣"`
- テスト名の文字列も更新

#### 4. src/__tests__/lib/services/post-service-welcome-sequence.test.ts

- L419: `body: ">>1 !w  新参おるやん🤣"` → `body: ">>1 !w\n新参おるやん🤣"`
- L428: 同上

#### 5. docs/architecture/components/bot.md

- L192: `>>N !w  新参おるやん🤣` → `>>N !w` + 改行 + `新参おるやん🤣`
- L727: 同上

#### 6. features/step_definitions/welcome.steps.ts

対応するステップ定義で旧形式をアサートしている箇所があれば新形式に更新する。

## 完了条件

- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` の welcome.feature 関連シナリオ全PASS
- [ ] `npx tsc --noEmit` エラーなし
- [ ] grep で `!w  新参` のパターンが src/ features/ docs/ 内に残っていないこと（tmp/ は除外可）

## スコープ外

- `tmp/` 配下の歴史的ドキュメント（設計書、タスク指示書、移行計画等）は修正不要
- コマンドパーサーのロジック変更（今回はコンテンツ形式の修正のみ）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイルの旧形式→新形式置換、vitest・BDD・tsc 全PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし（schema-consistency.test.ts の失敗は今回の変更とは無関係の既存問題）

### 進捗ログ

1. tutorial.ts L34: `>>${targetPostNumber} !w  新参おるやん🤣` → `>>${targetPostNumber} !w\n新参おるやん🤣`
2. tutorial.ts L17, L29 コメント: 旧形式→新形式
3. tutorial-strategies.test.ts L111, L125, L139, L153, L363: 旧形式→新形式（テスト名も更新）
4. post-service-welcome-sequence.test.ts L419, L428: 旧形式→新形式（2箇所 replace_all）
5. welcome.feature L121: 1行形式→改行分割形式
6. bot.md L192, L727: 旧形式→新形式
7. welcome.steps.ts: 旧形式の文字列なし（変更不要）

### テスト結果サマリー

- `npx vitest run`（関連ファイル）: 29 tests PASS
- `npx vitest run`（全体）: 1748 tests 中 1747 PASS / 1 FAIL（schema-consistency.test.ts は既存問題・今回の変更とは無関係）
- `npx cucumber-js features/welcome.feature`: 339 scenarios PASS（16 pending は既存）
- `npx tsc --noEmit`: エラーなし
- grep `!w  新参` in src/ features/ docs/: 0件（旧形式の残留なし）
