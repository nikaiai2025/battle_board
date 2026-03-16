---
task_id: TASK-075
sprint_id: Sprint-26
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-075
depends_on: []
created_at: 2026-03-16T19:00:00+09:00
updated_at: 2026-03-16T19:00:00+09:00
locked_files: []
---

## タスク概要

専ブラ・Web間の絵文字ハンドリングに関するバグを網羅的に分析し、修正方針を策定する。

書き込み元（Web/専ブラ）× 閲覧先（Web/専ブラ）× フィールド（スレタイ/本文）× 絵文字種別（通常/末尾注意）の16パターンについて、コードベースの処理フローを追跡し、各パターンで何が起きるかを推定する。

## 分析スコープ

### 1. 書き込み経路の解析

**Web → サーバー:**
- Web UIの書き込みフォーム → API route → PostService/ThreadService → DB保存
- UTF-8ネイティブのはず。絵文字はどう保存されるか

**専ブラ → サーバー:**
- bbs.cgi POST（Shift_JIS） → Shift_JIS→UTF-8変換 → PostService/ThreadService → DB保存
- Shift_JISに存在しない絵文字がどう処理されるか
- スレタイと本文で処理が異なる可能性を調査
- 既知の問題: 本文の絵文字が `&#数値;` のHTML数値参照になる

### 2. 閲覧経路の解析

**サーバー → Web:**
- DB → PostService → JSON API → React UI
- HTML数値参照がHTMLとして解釈されるか、生テキスト表示されるか

**サーバー → 専ブラ:**
- DB → DatFormatter（UTF-8→Shift_JIS変換） → DAT形式レスポンス
- DatFormatterのescapeHtml/replaceBotEmojiの影響
- BOT_EMOJI_REPLACEMENTSの対象範囲
- Shift_JISに存在しない絵文字の変換時の挙動

### 3. 絵文字種別の分析

**通常の絵文字:**
- 単一コードポイント: 😀 (U+1F600), 🤖 (U+1F916)
- BMP外（サロゲートペア）だがVariation Selectorなし

**末尾注意の絵文字:**
- Variation Selector付き: 🕳️ (U+1F573 + U+FE0F)
- ZWJ Sequence: 👨‍💻 (U+1F468 + U+200D + U+1F4BB)
- その他複合コードポイント

### 4. 検証マトリクス（16パターン）

各パターンについて以下を出力すること:
- **処理フロー**: 書き込み→保存→取得→表示の全ステップ
- **期待動作**: 正しくはどうなるべきか
- **推定現状**: コードを読んで推定される実際の挙動
- **問題の有無**: ✅ or ❌ + 原因

| # | 書き込み元 | 閲覧先 | フィールド | 絵文字種別 |
|---|---|---|---|---|
| 1 | Web | Web | スレタイ | 通常 |
| 2 | Web | Web | スレタイ | 末尾注意 |
| 3 | Web | Web | 本文 | 通常 |
| 4 | Web | Web | 本文 | 末尾注意 |
| 5 | Web | 専ブラ | スレタイ | 通常 |
| 6 | Web | 専ブラ | スレタイ | 末尾注意 |
| 7 | Web | 専ブラ | 本文 | 通常 |
| 8 | Web | 専ブラ | 本文 | 末尾注意 |
| 9 | 専ブラ | Web | スレタイ | 通常 |
| 10 | 専ブラ | Web | スレタイ | 末尾注意 |
| 11 | 専ブラ | Web | 本文 | 通常 |
| 12 | 専ブラ | Web | 本文 | 末尾注意 |
| 13 | 専ブラ | 専ブラ | スレタイ | 通常 |
| 14 | 専ブラ | 専ブラ | スレタイ | 末尾注意 |
| 15 | 専ブラ | 専ブラ | 本文 | 通常 |
| 16 | 専ブラ | 専ブラ | 本文 | 末尾注意 |

### 5. BOT_EMOJI_REPLACEMENTSの設計見直し

現在はBOT系4絵文字のみ置換（🤖🦾🦿🧠→[BOT]）。Phase 2で追加されたinlineSystemInfo内の絵文字（💰🌿🗑️等）も含め:
- 置換対象を拡充すべきか
- 置換方式（個別マッピング vs 汎用的なUnicode→ASCII変換）
- 書き込み時（受信）と閲覧時（送信）のどちらで処理すべきか

## 必読ドキュメント

1. [必須] `src/lib/infrastructure/encoding/shift-jis.ts` — Shift_JIS変換処理
2. [必須] `src/lib/infrastructure/adapters/dat-formatter.ts` — DAT形式構築（BOT_EMOJI_REPLACEMENTS含む）
3. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — 専ブラ書き込みエンドポイント
4. [必須] `src/lib/services/post-service.ts` — PostService（書き込み時の処理）
5. [必須] `src/lib/services/thread-service.ts` — ThreadService（スレッド作成時の処理）
6. [参考] `features/constraints/specialist_browser_compat.feature` — 専ブラ互換BDDシナリオ
7. [参考] `docs/architecture/components/senbra-adapter.md` — 専ブラアダプタ設計
8. [参考] `features/step_definitions/specialist_browser_compat.steps.ts` — 既存テスト内容

## 既知のユーザー報告

- パターン9（専ブラ→Web、スレタイ、通常）: ✅ 正常
- パターン10（専ブラ→Web、スレタイ、末尾注意）: ❌ `&#128371;` が生テキスト表示
- パターン11（専ブラ→Web、本文、通常）: ❌ `&#....` になる
- パターン13（専ブラ→専ブラ、スレタイ、通常）: ✅ 正常
- パターン14（専ブラ→専ブラ、スレタイ、末尾注意）: ❌ 絵文字+`�`付着
- パターン15（専ブラ→専ブラ、本文、通常）: ❌ `&#....` になる

## 出力（artifacts_dir に配置）

- `analysis.md` — 全16パターンの分析結果 + 修正方針（後続の実装タスクへの入力）

## 完了条件

- [x] 16パターン全ての処理フロー・推定挙動・問題有無を記載
- [x] 問題の根本原因を特定（書き込み時/閲覧時/DB保存時のどこか）
- [x] 修正方針を具体的に記述（変更ファイル・方法）
- [x] BOT_EMOJI_REPLACEMENTS見直し方針を記述

## スコープ外

- コード修正（分析・方針策定のみ）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 16パターン全分析、根本原因特定、修正方針策定、BOT_EMOJI_REPLACEMENTS見直し
- 次にすべきこと: 後続の実装タスクで方針1を実装
- 未解決の問題: パターン9のユーザー報告とコード分析の矛盾（実機検証が必要）

### 進捗ログ

#### 2026-03-16 分析完了

**読んだファイル**:
- `src/lib/infrastructure/encoding/shift-jis.ts` — Shift_JIS変換（sanitizeForCp932, decodeFormData）
- `src/lib/infrastructure/adapters/dat-formatter.ts` — DAT形式構築（escapeHtml, replaceBotEmoji, formatBody）
- `src/app/(senbra)/test/bbs.cgi/route.ts` — 専ブラ書き込みエンドポイント
- `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` — DAT配信エンドポイント
- `src/lib/services/post-service.ts` — PostService（createPost, createThread）
- `src/app/api/threads/[threadId]/posts/route.ts` — Web書き込みAPI
- `src/app/(web)/threads/[threadId]/page.tsx` — Web閲覧ページ
- `src/app/(web)/_components/PostItem.tsx` — レス表示コンポーネント
- `src/lib/infrastructure/adapters/bbs-cgi-parser.ts` — bbs.cgiパーサー
- `src/lib/domain/models/post.ts` — Postエンティティ型
- `features/constraints/specialist_browser_compat.feature` — BDDシナリオ

**根本原因**: 専ブラ書き込み時、ChMateがShift_JIS非対応文字をHTML数値参照で送信するが、サーバーがこれをUTF-8コードポイントに逆変換せずDB保存している。これにより:
- Web閲覧: Reactが `&#NNNNN;` を生テキスト表示（原因A+C）
- 専ブラ閲覧(本文): escapeHtmlが `&` → `&amp;` に二重エスケープ（原因A+B）
- 専ブラ閲覧(スレタイ): escapeHtml非経由のため偶然正常（パターン13）

**修正方針**: bbs.cgi受信時にHTML数値参照をUTF-8に逆変換する関数を追加。変更は2ファイルのみ。

**成果物**: `tmp/workers/bdd-architect_TASK-075/analysis.md`

### テスト結果サマリー
N/A（分析タスクのため）
