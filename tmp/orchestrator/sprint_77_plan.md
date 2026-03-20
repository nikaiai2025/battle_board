# Sprint-77 計画書

> 作成日: 2026-03-21

## 目標
`features/thread.feature` @image_preview 4シナリオの設計・実装

## 対象BDDシナリオ
- 画像URLがサムネイルとして展開表示される
- サムネイルをクリックすると原寸画像が表示される
- 画像以外のURLはサムネイル展開されない
- 複数の画像URLが1つのレスに含まれる場合すべて展開される

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 |
|---|---|---|---|
| TASK-212 | bdd-architect | @image_preview 設計 | なし |
| TASK-213 | bdd-coding | @image_preview 実装 | TASK-212 |
| TASK-214 | bdd-coding | kinou-handler TZ不具合修正 | TASK-213 |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-212 | completed | 設計書 `tmp/workers/bdd-architect_TASK-212/design.md` |
| TASK-213 | completed | 全4シナリオPASS、vitest +46件、ドキュメント更新 |
| TASK-214 | completed | kinou-handler getYesterdayJst→getYesterdayUtc修正（TZ不整合） |

## テスト結果
- vitest: 71ファイル / 1527テスト / 全PASS（+46: url-detector）
- cucumber-js: 271シナリオ (255 passed, 16 pending, 0 failed)（+4: @image_preview）
- tsc: 0エラー
