---
task_id: TASK-076
sprint_id: Sprint-26
status: completed
assigned_to: bdd-coding
depends_on: [TASK-075]
created_at: 2026-03-16T19:30:00+09:00
updated_at: 2026-03-16T19:30:00+09:00
locked_files:
  - src/lib/infrastructure/encoding/shift-jis.ts
  - src/app/(senbra)/test/bbs.cgi/route.ts
  - src/__tests__/lib/infrastructure/encoding/shift-jis.test.ts
---

## タスク概要

専ブラ書き込み時、ChMateがShift_JIS非対応文字（絵文字等）をHTML数値参照（`&#128512;`）で送信するが、サーバーがこれをUTF-8コードポイントに逆変換せずDBに保存している問題を修正する。

bbs.cgiの受信パスでHTML数値参照をUTF-8に逆変換する関数を追加し、DBには常にUTF-8ネイティブの文字が保存されるようにする。

## 修正方針（TASK-075分析に基づく方針1）

### 1. `decodeHtmlNumericReferences()` 関数を追加

場所: `src/lib/infrastructure/encoding/shift-jis.ts`

処理内容:
- `&#(\d+);` パターンを検出
- `String.fromCodePoint(N)` でUTF-8文字に変換
- 異体字セレクタ（U+FE0F, U+FE0E）は除去（空文字に変換）
- 無効なコードポイントはそのまま残す

### 2. bbs.cgi route でMESSAGE/subject/FROMに適用

場所: `src/app/(senbra)/test/bbs.cgi/route.ts`

`decodeFormData` 後、`PostService` 呼び出し前に逆変換を適用する。

### 変更不要ファイル

- `dat-formatter.ts` — escapeHtml/replaceBotEmoji/sanitizeForCp932 いずれも変更不要
- `post-service.ts` — DBにUTF-8が保存されるため変更不要
- `PostItem.tsx` — UTF-8絵文字はReactが正しく表示するため変更不要

## 必読ドキュメント

1. [必須] `tmp/workers/bdd-architect_TASK-075/analysis.md` — 根本原因分析（全セクション必読）
2. [必須] `src/lib/infrastructure/encoding/shift-jis.ts` — 既存のShift_JIS変換処理
3. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — 専ブラ書き込みエンドポイント
4. [参考] `features/constraints/specialist_browser_compat.feature` — 既存の絵文字関連BDDシナリオ

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature` の絵文字HTML数値参照関連シナリオ（存在する場合）

## 完了条件

- [ ] `decodeHtmlNumericReferences()` の単体テスト全PASS
  - 通常絵文字: `&#128512;` → `😀`
  - VS除去: `&#128371;&#65039;` → `🕳`（VSなし）
  - ZWJ保持: `&#128104;&#8205;&#128187;` → `👨‍💻`
  - 無効コードポイント: そのまま残す
  - 通常テキスト: 変化なし
  - 混在: `テスト&#128512;です` → `テスト😀です`
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 既存シナリオが壊れないこと
- [ ] テストコマンド: `npx vitest run && npx cucumber-js`

## スコープ外

- DatFormatter/PostService/PostItemの変更
- 既存DBデータのマイグレーション（別タスクで対応）
- BOT_EMOJI_REPLACEMENTSの変更（現行で適切と分析済み）

## 補足・制約

- 既存BDDシナリオに「絵文字がHTML数値参照として保存される」前提のシナリオがある場合、本修正で挙動が変わる可能性がある。その場合はエスカレーションすること。

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全実装・全テスト PASS
- 未解決の問題: なし

### 進捗ログ

- `src/lib/infrastructure/encoding/shift-jis.ts` に `decodeHtmlNumericReferences()` 関数を追加（export）
- `src/app/(senbra)/test/bbs.cgi/route.ts` で MESSAGE/name(FROM)/subject に逆変換を適用
- `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts` に `decodeHtmlNumericReferences()` の単体テスト18件を追加

### テスト結果サマリー

- `npx vitest run` : 689テスト / 20ファイル — 全PASS
  - shift-jis.test.ts: 70テスト PASS（うち新規18件）
- `npx cucumber-js` : 108シナリオ PASS（3 pending は本修正前から未実装のシナリオ）
  - 既存BDDシナリオが壊れていないことを確認済み
