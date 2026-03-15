---
task_id: TASK-050
sprint_id: Sprint-18
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T01:30:00+09:00
updated_at: 2026-03-15T01:30:00+09:00
locked_files:
  - src/lib/infrastructure/encoding/shift-jis.ts
  - src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts
---

## タスク概要

`ShiftJisEncoder.decode()` をiconv-liteからWeb API `TextDecoder('shift_jis')` に置き換える。

**背景**: 本番環境（Cloudflare Workers）で専ブラからのShift-JISエンコードされたPOSTデータが正しくUTF-8にデコードされず、DBに文字化けしたテキストが保存されている。`iconv-lite`のデコード処理がCloudflare Workers環境（`nodejs_compat`フラグ有効）で正常動作していない。

**証拠**:
- Web UIから投稿された「これは本番環境だよ」はDB上で正常（UTF-8）
- 専ブラから投稿されたテキストはDB上で `����` や `���Ⴀ���I` のように文字化け（Shift-JISバイトがUTF-8として解釈された結果）
- ローカルNode.jsではiconv-liteのdecodeは正常動作

**修正方針**:
- `decode()`: `iconv.decode(buffer, "CP932")` → `new TextDecoder('shift_jis').decode(buffer)` に置き換え
- `encode()`: iconv-liteの`encode`はそのまま維持（`TextEncoder`はUTF-8のみ対応のため）
- `sanitizeForCp932()`: ラウンドトリップ方式をそのまま維持

TextDecoder('shift_jis')はWeb API標準で、Cloudflare Workersでネイティブサポートされている。

## 対象BDDシナリオ
- `features/constraints/specialist_browser_compat.feature` @専ブラからのPOSTデータがShift_JISとして正しくデコードされる

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/infrastructure/encoding/shift-jis.ts` — 修正対象

## 出力（生成すべきファイル）
- `src/lib/infrastructure/encoding/shift-jis.ts` — decode()をTextDecoderに置き換え
- `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts` — TextDecoder使用のテスト確認

## 完了条件
- [ ] `decode()` が `new TextDecoder('shift_jis').decode()` を使用する
- [ ] `encode()` は引き続き `iconv.encode()` を使用する（変更なし）
- [ ] `decode()` で `Buffer` と `Uint8Array` の両方を受け付ける（Cloudflare WorkersではUint8Arrayが使われる場合がある）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外
- encode方向の修正
- sanitizeForCp932の変更
- BDDシナリオの変更

## 補足・制約
- `TextDecoder('shift_jis')` はNode.js (ICU full) およびCloudflare Workersの両方でサポートされている
- iconv-liteのimportはencode方向で引き続き必要なので削除しない
- `decode()` のシグネチャは `(buffer: Buffer): string` だが、Uint8Arrayも受け付けるよう `Buffer | Uint8Array` に拡張すること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/infrastructure/encoding/shift-jis.ts` の `decode()` メソッドを修正
   - シグネチャを `Buffer` から `Buffer | Uint8Array` に拡張
   - 実装を `iconv.decode(buffer, "CP932")` から `new TextDecoder('shift_jis').decode(buffer)` に置き換え
   - `TEXT_DECODER_ENCODING = "shift_jis"` の定数を追加

2. `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts` にテストケース3件追加
   - Uint8Array形式のShift_JISデータをUTF-8文字列に変換するテスト
   - 空のUint8Arrayを空文字列に変換するテスト
   - Uint8Arrayでのバイオフセット指定デコードテスト

### テスト結果サマリー

- Vitest: 577テスト PASS / 0 FAIL（18ファイル）
- Cucumber.js: 95シナリオ PASS / 0 FAIL（454ステップ）
