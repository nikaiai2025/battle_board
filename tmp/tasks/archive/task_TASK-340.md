---
task_id: TASK-340
sprint_id: Sprint-132
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-27T19:00:00+09:00
updated_at: 2026-03-27T19:00:00+09:00
locked_files:
  - src/app/(web)/_components/PostItem.tsx
---

## タスク概要

スマホビューでAA（コピペアスキーアート）が折り返して崩れる問題を修正する。
`PostItem.tsx` にある既存のAA判定ロジックを活用し、AA表示時のみ横スクロールを有効にする。

## 必読ドキュメント（優先度順）
1. [必須] `src/app/(web)/_components/PostItem.tsx` — 修正対象（L285-318）

## 修正内容

### 現状（L301-316）
```tsx
<p
  className={`text-muted-foreground whitespace-pre-wrap ${
    !/【.+】\n/.test(post.inlineSystemInfo) ? "text-xs" : ""
  }`}
  style={
    /【.+】\n/.test(post.inlineSystemInfo)
      ? { fontFamily: "var(--font-aa)", fontSize: "16px", lineHeight: "18px" }
      : undefined
  }
>
  {post.inlineSystemInfo}
</p>
```

### 変更方針
- AA判定（`/【.+】\n/.test()`）の結果を変数に切り出す
- AA判定ありの場合: `whitespace-pre` + スクロール可能なラッパーdivで囲む
- AA判定なしの場合: 現状維持（`text-xs whitespace-pre-wrap`）

### 期待する実装イメージ
```tsx
const isAA = /【.+】\n/.test(post.inlineSystemInfo);

{isAA ? (
  // AA: 横スクロール有効（折り返し禁止）
  <div className="overflow-x-auto">
    <p
      className="text-muted-foreground whitespace-pre"
      style={{ fontFamily: "var(--font-aa)", fontSize: "16px", lineHeight: "18px" }}
    >
      {post.inlineSystemInfo}
    </p>
  </div>
) : (
  // 非AA: 従来通り（折り返しあり）
  <p className="text-muted-foreground text-xs whitespace-pre-wrap">
    {post.inlineSystemInfo}
  </p>
)}
```

## 完了条件
- [ ] `npx vitest run` で全テスト PASS（PostItemはReactコンポーネントのため主にビルド確認）
- [ ] ビルドエラーなし（`npx tsc --noEmit` 等）
- [ ] スコープ外のファイル変更なし

## スコープ外
- BDDシナリオの変更
- CSS/Tailwindのグローバル設定変更
- 他コンポーネントへの変更

## 補足・制約
- `whitespace-pre-wrap` → `whitespace-pre` への変更がAA折り返し防止の核心
- `overflow-x-auto` をラッパーdivに付けることでコンテナ幅を超えた分のみスクロール可能にする
- 非AAコンテンツ（書き込み報酬、おみくじ結果等）は変更しない

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: PostItem.tsx の AA 判定ロジック変数化 + overflow-x-auto ラッパー + whitespace-pre 適用
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- `src/app/(web)/_components/PostItem.tsx` L294-316 を修正
  - `/【.+】\n/.test()` の呼び出しを `const isAA` 変数に一元化
  - AA時: `<div className="overflow-x-auto">` ラッパー + `whitespace-pre` に変更（折り返し禁止・横スクロール有効）
  - 非AA時: `text-xs whitespace-pre-wrap`（従来通り）を維持
  - コメントに横スクロール対応の説明を追記

### テスト結果サマリー
- `npx vitest run`: 102 test files / 2003 tests — **全 PASS**
- `npx tsc --noEmit`: エラーなし（出力なし）
- 完了条件すべて充足
