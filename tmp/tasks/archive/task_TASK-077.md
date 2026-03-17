---
task_id: TASK-077
sprint_id: Sprint-26
status: completed
assigned_to: bdd-coding
depends_on: [TASK-076]
created_at: 2026-03-16T20:00:00+09:00
updated_at: 2026-03-16T20:00:00+09:00
locked_files:
  - src/lib/infrastructure/encoding/shift-jis.ts
  - src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts
---

## タスク概要

専ブラ書き込み時、ChMateがVariation Selector (U+FE0F)をHTML数値参照ではなくUTF-8生バイトで送信する場合、TextDecoder("shift_jis")が未知バイトをU+FFFD(Replacement Character `�`)に変換し、DBに保存されてしまう。

TASK-076の`decodeHtmlNumericReferences`はHTML数値参照の`&#65039;`は除去するが、生バイト経由で到着したU+FFFDには対処できていない。

## 修正内容

`decodeHtmlNumericReferences` 関数内（またはその後）で、U+FFFD (Replacement Character) を除去する処理を追加する。

U+FFFDはShift_JISデコード時に未知バイトに対して挿入される文字であり、ユーザーが意図的に入力する文字ではない。専ブラ書き込み経路でU+FFFDが残っている場合、それは不正なバイト列の残骸なので除去が正しい。

実装案:
```typescript
// decodeHtmlNumericReferences の結果に対して追加
.replace(/\uFFFD/g, "")
```

または `decodeHtmlNumericReferences` 関数の末尾に統合してもよい。

## 完了条件

- [x] U+FFFD除去の単体テスト追加
  - `"🕳\uFFFD"` → `"🕳"`
  - `"テスト\uFFFDです"` → `"テストです"`
  - U+FFFDが複数ある場合も全除去
- [x] `npx vitest run` 全PASS
- [x] `npx cucumber-js` 既存シナリオが壊れないこと

## スコープ外

- bbs.cgi route.tsの変更（decodeHtmlNumericReferences関数側で対応するため不要のはず）
- DatFormatter/PostServiceの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `decodeHtmlNumericReferences` の JSDoc に変換ルール5番（U+FFFD除去）を追記
- 実装: `text.replace(...).replace(/\uFFFD/g, "")` をチェーンで追加
- テスト6件を `shift-jis.test.ts` に追加（U+FFFD単体、絵文字+U+FFFD、テキスト中U+FFFD、複数U+FFFD、副作用なし確認、複合ケース）

### テスト結果サマリー

- 単体テスト: 695件 PASS / 0件 FAIL（20ファイル）
- BDDシナリオ: 105件 PASS / 3件 pending（既存の未実装シナリオ）/ 0件 FAIL
