---
task_id: TASK-047
sprint_id: Sprint-18
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T00:00:00+09:00
updated_at: 2026-03-15T00:00:00+09:00
locked_files:
  - src/lib/infrastructure/encoding/shift-jis.ts
  - src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts
  - src/lib/infrastructure/adapters/dat-formatter.ts
---

## タスク概要

専ブラ（Siki）で書き込み・閲覧時にShift-JIS（CP932）変換で `???` が表示される問題を調査・修正する。`iconv-lite` によるCP932エンコードで一部のUnicode文字がマッピングできず `?` に置換されている可能性がある。

## 対象BDDシナリオ
- `features/constraints/specialist_browser_compat.feature` @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
- `features/constraints/specialist_browser_compat.feature` @専ブラからのPOSTデータがShift_JISとして正しくデコードされる

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/infrastructure/encoding/shift-jis.ts` — ShiftJisEncoder
2. [必須] `src/lib/infrastructure/adapters/dat-formatter.ts` — DAT形式生成（BOT絵文字→[BOT]置換パターンあり）
3. [必須] `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — bbs.cgiレスポンスHTML生成
4. [参考] `src/app/(senbra)/test/bbs.cgi/route.ts` — Shift-JISエンコード処理の呼び出し箇所

## 入力（前工程の成果物）
- なし

## 出力（生成すべきファイル）
- `src/lib/infrastructure/encoding/shift-jis.ts` — 必要に応じて修正
- `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts` — CP932変換の網羅テスト追加
- `src/lib/infrastructure/adapters/dat-formatter.ts` — 必要に応じて修正

## 完了条件
- [x] ??? が発生する根本原因を特定し、作業ログに記録する
- [x] 修正を実施し、単体テストで再発防止を検証する
- [x] `npx vitest run` 全PASS
- [x] `npx cucumber-js` 全PASS

## スコープ外
- 認証URL絶対URL化（TASK-046で対応）
- BDDシナリオの変更

## 補足・制約

### 調査方針

1. **iconv-lite CP932変換のフォールバック動作を確認**: `iconv.encode()` でCP932にマッピングできない文字がどう処理されるか（デフォルトは `?` に置換）
2. **レスポンスHTML中のCP932非対応文字を洗い出し**: `buildAuthRequired`、`buildSuccess`、`buildError` の固定テキストにCP932範囲外の文字がないか確認
3. **DAT出力の問題か、bbs.cgiレスポンスの問題か**: ??? が出るのがスレッド閲覧時（DAT）か書き込みレスポンス時（bbs.cgi HTML）かで原因が異なる
4. **ユーザー入力起因の可能性**: ユーザーが投稿した本文に絵文字・特殊文字があり、BOT_EMOJI_REPLACEMENTS に含まれない文字がCP932変換で ??? になる可能性

### 対応パターン

- **固定テキスト起因**: 該当文字をCP932互換文字に置換
- **ユーザー入力起因**: `encode()` メソッドに、未マッピング文字を全角 `？` 等に置換するフォールバック処理を追加
- **iconv-lite環境依存**: Cloudflare Workers環境でのiconv-lite動作を検証（`nodejs_compat` フラグとの相互作用）

### 検証用テスト

以下の文字がCP932変換で正しく処理されることをテストで確認すること:
- 基本的な日本語（ひらがな、カタカナ、漢字）
- 全角記号: 【】「」（）
- 全角英数: ＡＢＣＤ、０１２３
- CP932範囲外: 絵文字（🤖）、一部のCJK統合漢字拡張

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 根本原因の特定、shift-jis.ts への sanitizeForCp932 追加、テスト追加、全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

#### 根本原因特定
- `ShiftJisEncoder.encode()` が iconv-lite の CP932 エンコードで未マッピング文字（絵文字・サロゲートペア文字・一部BMP文字）を `0x3F`（半角 `?`）に変換する
- `DatFormatter.BOT_EMOJI_REPLACEMENTS` は主要BOT絵文字（🤖🦾🦿🧠）のみ置換。ユーザーが投稿した任意の絵文字（😀❤等）は未置換のまま `encode()` に渡る
- bbs-cgi-response.ts の固定テキスト（【】ＥＲＲＯＲ等）はすべてCP932互換済みで問題なし

#### 対処方針
- `ShiftJisEncoder.encode()` の前処理として `sanitizeForCp932()` メソッドを追加
  - サロゲートペア文字（codePoint > 0xFFFF）は必ず全角 `？` に置換
  - BMP内でも CP932 未マッピング（1バイト 0x3F に変換、かつ元文字が `?` でない）文字は全角 `？` に置換
  - パフォーマンス: 1150文字で約1ms（実用上問題なし）
- `encode()` メソッド内で `sanitizeForCp932()` を自動適用する

### テスト結果サマリー

#### 単体テスト (npx vitest run)
- 全18ファイル PASS
- 全568テスト PASS（うち shift-jis.test.ts: 23テスト、新規追加14テスト）

#### BDDテスト (npx cucumber-js)
- 95シナリオ PASS、454ステップ PASS
