---
task_id: TASK-058
sprint_id: Sprint-21
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T14:00:00+09:00
updated_at: 2026-03-15T14:00:00+09:00
locked_files:
  - src/lib/infrastructure/encoding/shift-jis.ts
  - src/__tests__/lib/infrastructure/encoding/shift-jis.test.ts
  - features/step_definitions/specialist_browser_compat.steps.ts
---

## タスク概要

CP932非対応文字（絵文字等）の処理をeddist参考実装に準拠させる。現在の「全角？に置換」方式を「HTML数値参照に変換」方式に改修する。加えて、異体字セレクタの除去とZWJの保持を実装する。

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature`
  - @Shift_JIS範囲外の文字がHTML数値参照として保持される（既存シナリオの仕様変更）
  - @異体字セレクタがDAT出力時に除去される（新規）
  - @ゼロ幅接合子(ZWJ)がHTML数値参照として保持される（新規）

## 必読ドキュメント（優先度順）

1. [必須] `features/constraints/specialist_browser_compat.feature` — 対象シナリオ3件
2. [必須] `src/lib/infrastructure/encoding/shift-jis.ts` — 改修対象（sanitizeForCp932）
3. [参考] `tmp/test_report_sprint20.md` — eddist参考実装の調査結果

## 入力（前工程の成果物）

なし

## 出力（生成すべきファイル）

- `src/lib/infrastructure/encoding/shift-jis.ts` — sanitizeForCp932改修
- `src/__tests__/lib/infrastructure/encoding/shift-jis.test.ts` — 単体テスト修正・追加（※パスが異なる場合は既存テストファイルを探して修正）
- `features/step_definitions/specialist_browser_compat.steps.ts` — ステップ定義追加

## 完了条件

- [ ] CP932非対応文字（絵文字等）がHTML数値参照（`&#NNNNN;`）に変換される
- [ ] 異体字セレクタ(U+FE0F, U+FE0E)がDAT出力時に除去される（HTML数値参照にもしない）
- [ ] ZWJ(U+200D)がHTML数値参照(`&#8205;`)として保持される
- [ ] 全角？（U+FF1F）への置換は行われない
- [ ] 既存の単体テスト修正（全角？期待値→HTML数値参照期待値）
- [ ] 新規単体テスト追加（異体字セレクタ除去・ZWJ保持）
- [ ] BDDステップ定義追加（新規2シナリオ分）
- [ ] テストコマンド: `npx vitest run` && `npx cucumber-js`

## 補足・制約

### 変換ルール詳細

```
入力文字列のコードポイントを順に処理:
1. 異体字セレクタ (U+FE0F, U+FE0E) → 除去（出力しない）
2. CP932非対応文字 (U+10000以上のサロゲートペア、U+200D等) → HTML数値参照 (&#NNNNN;)
3. CP932対応文字 → そのまま出力
```

### 注意点

- `sanitizeForCp932()` は `encode()` 内部で呼ばれる。encode後はShift_JISバイト列になるため、HTML数値参照のASCII文字部分(`&`, `#`, `;`, 数字)がShift_JISでも同一バイトであることを確認すること
- BOT絵文字（🤖等）の `[BOT]` 置換は DatFormatter 側で行われる（sanitizeForCp932より前段）。この処理には影響しない
- BBS_UNICODE=pass との整合性: featureファイルのNOTEに記載あり。現状の「全角？に置換」が仕様と矛盾していた状態を解消する改修である

## スコープ外

- DatFormatterの変更（sanitizeForCp932内で完結させる）
- Web API側のレスポンス処理（専ブラDAT出力のみが対象）
- locked_files以外のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント・既存コード・既存テストを確認
- [方針確定] sanitizeForCp932をHTML数値参照変換方式に改修。異体字セレクタは除去、ZWJはHTML数値参照に保持
- [実装] src/lib/infrastructure/encoding/shift-jis.ts: sanitizeForCp932をHTML数値参照変換方式に改修。VARIATION_SELECTORSセットを追加
- [単体テスト修正] shift-jis.test.ts: 全角？期待値→HTML数値参照期待値に変更。異体字セレクタ除去・ZWJ保持テスト追加（53件→53件）
- [BDDステップ追加] specialist_browser_compat.steps.ts: 新規Givenステップ3件・Thenステップ3件を追加。`専ブラが当該DATファイルを取得する` をencode→decodeラウンドトリップ方式に改修
- [テスト確認] 全テスト PASS 確認

### テスト結果サマリー
- 単体テスト（npx vitest run）: 18ファイル 601テスト PASS
- BDDシナリオ（npx cucumber-js）: 98シナリオ PASS / 7件 undefined（既存のスコープ外シナリオ）
- 対象3シナリオ（Shift_JIS範囲外・異体字セレクタ・ZWJ）: すべて PASS
