---
task_id: TASK-048
sprint_id: Sprint-18
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T01:00:00+09:00
updated_at: 2026-03-15T01:00:00+09:00
locked_files:
  - src/lib/infrastructure/encoding/shift-jis.ts
  - src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts
---

## タスク概要

`sanitizeForCp932()` の判定ロジックを「バイト値ベース判定」から「ラウンドトリップ方式」（encode→decodeして元文字と一致するか確認）に変更する。現在の `isCp932Unmappable()` が偽陽性を返し、本来CP932で表現できる文字まで全角？に置換してしまう問題を修正する。

## 対象BDDシナリオ
- `features/constraints/specialist_browser_compat.feature` @すべてのレスポンスがShift_JIS（CP932）でエンコードされる

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/infrastructure/encoding/shift-jis.ts` — 修正対象
2. [必須] `tmp/workers/bdd-architect_TASK-048/analysis.md` — アーキテクト分析（方針Aを採用）

## 出力（生成すべきファイル）
- `src/lib/infrastructure/encoding/shift-jis.ts` — sanitizeForCp932をラウンドトリップ方式に変更
- `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts` — CP932マッピング可能文字が置換されないことを検証するテスト追加

## 完了条件
- [ ] `sanitizeForCp932()` がラウンドトリップ方式（encode→decode→元文字との一致確認）で判定する
- [ ] `isCp932Unmappable()` メソッドを削除し、半角?の特別扱い（`char !== "?"`）も不要にする
- [ ] CP932でエンコード可能な日本語文字（ひらがな、カタカナ、漢字、全角記号【】「」、丸数字①②等）が置換されないことを単体テストで検証
- [ ] サロゲートペア文字（絵文字🤖等）とBMP内未マッピング文字（❤等）が全角？に置換されることを単体テストで検証
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外
- 認証フローのIPチェック削除（TASK-049で対応）
- BDDシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件クリア
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/lib/infrastructure/encoding/shift-jis.ts`: `sanitizeForCp932()` をラウンドトリップ方式に変更、`isCp932Unmappable()` を削除
- `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts`: CP932マッピング可能文字（丸数字①②、ローマ数字ⅠⅡ、単位記号㎜㎝、全角チルダ～、半角カタカナｱｲｳ）が置換されないことを検証するテスト5件追加

### 変更内容サマリー

**shift-jis.ts の変更:**
- `sanitizeForCp932()` の BMP 文字判定ロジックを「バイト値チェック（`encoded[0] === 0x3f`）」から「ラウンドトリップ検証（encode → decode して元文字と一致するか確認）」に変更
- `isCp932Unmappable()` プライベートメソッドを削除
- `char !== "?"` の特別扱いも不要になったため削除
- サロゲートペア文字（U+10000以上）の先行チェックは維持（iconv-liteに渡す前に弾く最適化）

### テスト結果サマリー

- Vitest: 18ファイル / 573テスト PASS（shift-jis: 28テスト PASS）
- Cucumber.js: 95シナリオ / 454ステップ PASS
