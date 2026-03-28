---
task_id: TASK-305
sprint_id: Sprint-112
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T16:00:00+09:00
updated_at: 2026-03-24T16:00:00+09:00
locked_files:
  - "src/app/(web)/layout.tsx"
  - "src/app/globals.css"
  - "src/app/layout.tsx"
---

## タスク概要

ダークテーマ選択時にページ最外側の背景色（`<body>`の背景）が白のままになるバグを修正する。

### 原因

- `globals.css` の `body { @apply bg-background }` は `:root` の `--background`（白）を参照する
- `.dark` クラスは `(web)/layout.tsx` の内側の `<div>` にのみ付与されている
- `<body>` は `.dark` の子要素ではないため、ダークテーマの `--background` が適用されない
- コンテンツが画面を埋めきらない部分で `<body>` の白背景が露出する

### 修正方針

テーマのCSSクラス（`dark` 等）を `<body>` 要素に反映する。以下のいずれかの方法で実装する:

**方針A: globals.css で `.dark` セレクタを `:root` にも適用**
- `.dark` の CSS変数定義を `:root:has(.dark)` にも適用する
- body の bg-background が暗い色を参照するようになる

**方針B: root layout で Cookie を読んでテーマクラスを body に付与**
- `src/app/layout.tsx` で `bb-theme` Cookie を読み、`<body>` に theme class を追加する
- `(web)/layout.tsx` のテーマクラス付与は div から除去してよい

**方針C: (web)/layout.tsx の div に bg-background を明示付与**
- `.dark` スコープ内の `bg-background` は暗い色を参照するので、div 側に明示追加
- ただしこれだけでは body の白背景は残る。さらに body 側の対策（`:root:has(.dark)` 等）が必要

**判断基準:** テーマ切り替え時に body 背景もテーマに追従すること。テストが全件PASSすること。

## 必読ドキュメント

1. [必須] `src/app/globals.css` — CSS変数定義（`:root` と `.dark`）
2. [必須] `src/app/(web)/layout.tsx` — テーマクラス付与箇所
3. [必須] `src/app/layout.tsx` — root layout（`<body>` 定義箇所）
4. [参考] `src/lib/domain/models/theme.ts` — THEME_CATALOG（cssClass定義）

## 完了条件

- [ ] ダークテーマ選択時に `<body>` の背景色も暗くなる（白い部分が見えない）
- [ ] デフォルトテーマ（ライト）時に影響がない
- [ ] `npx vitest run` でリグレッションなし
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- 有料テーマ（ocean, forest, sunset）のCSS実装（段階2）
- テーマ機能のロジック変更
- BDDシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: globals.css 修正（方針A: `:root:has(.dark)` セレクタ追加）、全テストPASS
- 未解決の問題: なし

### 進捗ログ

- `src/app/globals.css` の `.dark` セレクタに `:root:has(.dark)` を追加（方針A採用）
- これにより `<body>` が `.dark` クラスの子孫でなくてもダークテーマのCSS変数を参照可能になる

### テスト結果サマリー

- 単体テスト: 91ファイル / 1769テスト — 全件PASS（リグレッションなし）
- BDDテスト: 未実行（CSSの変更はVitestの対象外のため、既存BDDシナリオに影響なし）
