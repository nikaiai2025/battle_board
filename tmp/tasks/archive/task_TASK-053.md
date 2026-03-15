---
task_id: TASK-053
sprint_id: Sprint-19
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T03:00:00+09:00
updated_at: 2026-03-15T03:00:00+09:00
locked_files:
  - src/app/(web)/auth/verify/page.tsx
---

## タスク概要

/auth/verify ページのwrite_token表示セクションに「ワンタッチコピーボタン」を追加し、案内文をwrite_token永続化仕様に合わせて更新する。

**背景**: ユーザーから「書き込みトークンのハッシュ値をワンタッチでコピーできるボタン付けて」という要望があった。また、TASK-052でwrite_tokenが30日有効・何度でも使用可能に変更されるため、案内文の「有効期限: 10分」「一度だけ使用できます」を更新する必要がある。

## 対象BDDシナリオ
- なし（UI改善。BDDシナリオは振る舞いの変更を伴わないため対象外）

## 必読ドキュメント（優先度順）
1. [必須] `src/app/(web)/auth/verify/page.tsx` — 修正対象

## 出力（生成すべきファイル）
- `src/app/(web)/auth/verify/page.tsx` — コピーボタン追加 + 案内文更新

## 完了条件
- [ ] write_token表示（`#write-token-section`）の横にコピーボタンがある
- [ ] コピーボタンクリックで `#<write_token>` がクリップボードにコピーされる
- [ ] コピー成功時に「コピーしました」等のフィードバック表示がある
- [ ] 案内文の「有効期限: 10分」を「有効期限: 30日」に変更
- [ ] 案内文の「このコードは一度だけ使用できます」を「このコードはメール欄に入れたままにしてください」に変更
- [ ] 案内文に `sage#<write_token>` の使用例を追加
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外
- write_tokenの有効期限・ワンタイム性の変更（TASK-052で対応）
- 認証フォーム部分の変更
- バックエンドの変更

## 補足・制約

### コピーボタンの実装方針

`navigator.clipboard.writeText()` を使用する。"use client" コンポーネントのためブラウザAPIが利用可能。

```tsx
const [copied, setCopied] = useState(false);

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(`#${writeToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch {
    // フォールバック: selectAll + copy
  }
};
```

### 案内文の更新内容

**変更前:**
```
次の書き込み時に、メール欄に以下のコードを入力してください（有効期限: 10分）。
...
※ このコードは一度だけ使用できます
```

**変更後:**
```
メール欄に以下のコードを入力してください（有効期限: 30日間）。
sageと併用する場合は sage#<write_token値> と入力してください。
...
※ このコードはメール欄に入れたままご利用ください
```

### コピーボタンのデザイン

write_token表示の `<code>` ブロックの右側または下部にボタンを配置。
- アイコン: クリップボードアイコン（テキスト「コピー」でも可）
- コピー成功: ボタンテキストを一時的に「コピーしました」に変更（2秒後に戻る）
- Tailwindでスタイリング

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を達成
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/app/(web)/auth/verify/page.tsx` を修正
  - `copied` state 追加（コピーフィードバック用）
  - `handleCopy` 関数追加（`navigator.clipboard.writeText` で `#<write_token>` をコピー、2秒後にリセット）
  - write_token 案内文: 「有効期限: 10分」→「有効期限: 30日間」
  - write_token 案内文: 「このコードは一度だけ使用できます」→「このコードはメール欄に入れたままご利用ください」
  - sage 併用例を追加
  - `#copy-token-btn` ボタン追加（コピー成功時に「コピーしました」表示）

### テスト結果サマリー

- `npx vitest run`: **587 tests PASSED** (18 test files)
- `npx cucumber-js`: **95 scenarios PASSED** (454 steps passed, 0m00.274s)
