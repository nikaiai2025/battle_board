# Sprint-49 計画書: command-parser 前方引数・全角スペース対応

> 作成日: 2026-03-18
> ステータス: completed

## 背景

人間がBDDシナリオ7件とコンポーネント設計（command.md 解析ルール6,7,8）を追加。
`>>N !cmd`（前方引数）パターンと全角スペース区切りの対応が必要。

## 変更概要

command-parserの解析ロジック拡張:
- 前方引数: `>>N !cmd` を `!cmd >>N` と等価に認識
- 後方優先: `>>3 !tell >>5` → 対象は `>>5`
- 全角スペース: 前方・後方とも半角/全角スペースを区切りとして許容
- 非認識条件: アンカーとコマンドの間にテキストや改行がある場合は前方引数として認識しない

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-140 | bdd-coding | command-parser拡張（前方引数・全角スペース対応）+ 単体テスト + BDDステップ定義 | なし | completed |
| TASK-141 | bdd-coding | E2Eテスト追加: コマンド実行（!w）フロー + inlineSystemInfo UI実装 | なし | completed |

## 結果

### TASK-140 (bdd-coding) — completed

- `command-parser.ts`: 前方引数検出（`buildForwardArgMap`）、後方優先ロジック、全角スペース対応を追加
- `command-parser.test.ts`: 新規11件追加（全角スペース後方3件、前方引数6件、非認識条件2件）。既存34件リグレッションなし
- `command_system.steps.ts`: DocString形式投稿ステップ + ターゲット未指定エラーステップ追加
- vitest: 45ファイル / 全PASS
- cucumber-js: 234シナリオ（227 passed / 7 pending / 0 failed）— 以前の undefined 2件も解消

### TASK-141 (bdd-coding) — completed

- `PostItem.tsx`: Post型に `inlineSystemInfo: string | null` 追加、本文下に区切り線+結果表示JSX追加
- `page.tsx`: fetchThreadDetailのPost型変換に `inlineSystemInfo` マッピング追加
- `basic-flow.spec.ts`: コマンド書き込み+inlineSystemInfo表示のE2Eテスト追加
- E2E: 2テスト全PASS / vitest: 45ファイル 1152テスト全PASS
- エスカレーション1件（locked_files拡張）→ 自律解決（BDD既承認のUI実装漏れ修正）

### 発見バグ: >>N → UUID変換未実装

`!w >>1` 等のコマンドで、`>>N`形式のpostNumber引数がUUIDに変換されずにハンドラに渡される。
PostRepository.findById(">>1") → 対象レス未発見 → サイレント失敗。
BDDテストはInMemoryモックで通過するため検出されていなかった。次スプリントで対応要。

## 判定

全タスク completed。新規BDDシナリオ7件全PASS、既存テストにリグレッションなし。
inlineSystemInfo UI実装漏れを修正し、E2Eテストで書き込み+コマンド結果表示を検証。
`>>N → UUID`変換バグは次スプリントで対応。
