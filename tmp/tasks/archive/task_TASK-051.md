---
task_id: TASK-051
sprint_id: Sprint-18
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T01:45:00+09:00
updated_at: 2026-03-15T01:45:00+09:00
locked_files:
  - src/app/(senbra)/test/bbs.cgi/route.ts
  - src/lib/infrastructure/encoding/shift-jis.ts
  - src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts
---

## タスク概要

bbs.cgi route の Shift-JIS デコード順序を修正する。

**根本原因**: 専ブラは Shift-JIS バイトを URL-エンコードして送信する（例: テスト → `%83e%83X%83g`）。現在のコードは `encoder.decode(bodyBuffer)` → `new URLSearchParams(decodedBody)` の順序でデコードしているが、これは**URL-エンコードされたASCII文字列にShift-JISデコードを適用しても何も変わらない**。その後 `URLSearchParams` がURL-デコード時に `%83` をUTF-8バイトとして解釈し、不正なUTF-8序列が置換文字（U+FFFD `�`）になる。

**正しいフロー**:
1. bodyBufferをASCII文字列として読み取る
2. URLSearchParamsでURLデコードする（この時点ではShift-JISバイトがバイナリ文字列になる）
3. 各パラメータ値のバイト列をShift-JISからUTF-8にデコードする

**または代替方式**: `ShiftJisEncoder` に `decodeUrlEncodedBody(bodyBuffer)` メソッドを追加し、URLデコード→Shift-JISデコードを正しい順序で一括処理する。

## 対象BDDシナリオ
- `features/constraints/specialist_browser_compat.feature` @専ブラからのPOSTデータがShift_JISとして正しくデコードされる

## 必読ドキュメント（優先度順）
1. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — 修正対象（L144-168のデコードフロー）
2. [必須] `src/lib/infrastructure/encoding/shift-jis.ts` — ShiftJisEncoder

## 出力（生成すべきファイル）
- `src/app/(senbra)/test/bbs.cgi/route.ts` — デコード順序修正
- `src/lib/infrastructure/encoding/shift-jis.ts` — 必要に応じて新メソッド追加
- `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts` — テスト追加

## 完了条件
- [x] 専ブラからのURL-エンコード済みShift-JISデータが正しくUTF-8にデコードされる
- [x] デコードフロー: bodyをASCII文字列として読み取り → URLデコードでrawバイト取得 → Shift-JISデコード
- [x] `npx vitest run` 全PASS
- [x] `npx cucumber-js` 全PASS

## スコープ外
- encode方向（UTF-8→Shift-JIS）の変更
- 既にDBに保存された文字化けデータの修正

## 補足・制約

### 実装方針の推奨

`ShiftJisEncoder` に以下のメソッドを追加する:

```typescript
/**
 * URL-エンコード済みShift-JISフォームデータをパースしてUTF-8のURLSearchParamsに変換する。
 *
 * 処理順序:
 * 1. bodyBufferをASCII文字列として読み取り（URLエンコード文字列はASCII範囲）
 * 2. '&' で分割して各key=valueペアを取得
 * 3. 各keyとvalueをURLデコードしてrawバイト列に戻す
 * 4. rawバイト列をShift-JIS→UTF-8にデコード
 * 5. UTF-8のURLSearchParamsを構築して返す
 */
decodeFormData(bodyBuffer: Buffer | Uint8Array): URLSearchParams
```

URLデコード→rawバイト変換のヘルパー:
```typescript
function urlDecodeToBytes(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '%' && i + 2 < str.length) {
      bytes.push(parseInt(str.substring(i + 1, i + 3), 16));
      i += 2;
    } else if (str[i] === '+') {
      bytes.push(0x20); // +はスペース（form encoding規約）
    } else {
      bytes.push(str.charCodeAt(i));
    }
  }
  return new Uint8Array(bytes);
}
```

bbs.cgi/route.ts の修正箇所:
```typescript
// 旧（誤り）:
// const decodedBody = encoder.decode(bodyBuffer);
// bodyParams = new URLSearchParams(decodedBody);

// 新（正しい）:
bodyParams = encoder.decodeFormData(bodyBuffer);
```

### 検証テスト追加

`shift-jis.test.ts` に以下のテストを追加:
- URL-エンコード済みShift-JISフォームデータ `MESSAGE=%83e%83X%83g` が `MESSAGE=テスト` にデコードされる
- ASCII文字のみのパラメータ（`bbs=battleboard`）が正常にデコードされる
- `+` がスペースに変換される
- 空のパラメータ値が正常に処理される

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `shift-jis.ts` に `urlDecodeToBytes()` ヘルパー関数を追加（モジュールスコープ）
2. `ShiftJisEncoder` に `decodeFormData()` メソッドを追加
3. `bbs.cgi/route.ts` のデコードフローを `encoder.decodeFormData(bodyBuffer)` に変更
4. `shift-jis.test.ts` に `decodeFormData()` のテスト10件を追加
5. `route-handlers.test.ts` の `makeShiftJisBody()` を専ブラの実際の動作（Shift-JISバイトのURLエンコード）に合わせて修正

### テスト結果サマリー

- `npx vitest run`: 587件全PASS（18テストファイル）
  - 新規追加テスト: `decodeFormData()` 10件（shift-jis.test.ts）
- `npx cucumber-js`: 95シナリオ全PASS（454ステップ）
