# !copipe コマンド — オーケストレーター向け引継ぎメモ

> 作成: 2026-03-26 アーキテクトセッション
> ステータス: **feature 承認済み — タスク発行可能**

## 概要

過去のコピペ（AA）をコマンドで再現する無料コマンド `!copipe`。
引数なしでランダム、名前指定で特定のAAをレス内マージ表示する。

## 承認待ちドキュメント

| ファイル | ステータス |
|---|---|
| `features/command_copipe.feature` | **承認済み v1** |

## 設計決定済み事項（再議論不要）

### 1. データストレージ: DB

AA本文にあらゆる特殊文字（`` ` " ' \ | : , < > $`` 等）が含まれるため、
ファイル形式（YAML/TS/JSON）はすべて不適。DBのTEXTカラムに格納する。

- テーブル: `copipe_entries (id SERIAL PK, name TEXT UNIQUE, content TEXT, created_at TIMESTAMPTZ)`
- 検証済み: YAML は半角スペース字下げで構文エラー、TS はバッククォート要エスケープ

### 2. seed データ入稿フォーマット

`config/copipe-seed.txt` に区切り文字ベースで記述。AA本文のエスケープは一切不要。

```
====COPIPE:タイトル====
AAをそのまま貼る
====COPIPE:次のタイトル====
...
====END====
```

- バリデーションスクリプト **作成済み**: `scripts/validate-copipe-seed.mjs`
- seed ファイル **作成済み**（テンプレート + ユーザーが初期データ投入中）: `config/copipe-seed.txt`

### 3. 検索ロジック（完全一致優先）

1. 引数なし → ランダム1件
2. 引数あり → 完全一致あれば即表示
3. 完全一致なし → 部分一致1件なら表示
4. 部分一致2件以上 → エラー「曖昧です」
5. 一致なし → エラー「見つかりません」

### 4. コマンド設定

```yaml
# config/commands.yaml に追加
copipe:
  description: "コピペAAを再現する"
  cost: 0
  targetFormat: null
  enabled: true
  stealth: false
```

### 5. 運用: GitHub Actions 自動デプロイ

`config/copipe-seed.txt` を main に push → GHA が自動で本番DBに反映。
既存の `seed-pinned-thread.yml` と同一パターン。追加の GitHub Secrets は不要。

## 実装タスク一覧

依存順に記載。

| # | タスク | 成果物 | 参考パターン |
|---|---|---|---|
| 1 | DB マイグレーション | `supabase/migrations/00032_copipe_entries.sql` | `00001_create_tables.sql` |
| 2 | seed スクリプト | `scripts/seed-copipe.ts` | `scripts/upsert-pinned-thread.ts` |
| 3 | コマンドハンドラ | `src/lib/domain/handlers/copipe.ts` | `handlers/omikuji.ts` |
| 4 | commands.yaml 追記 | `config/commands.yaml` | 既存エントリ |
| 5 | GHA ワークフロー | `.github/workflows/seed-copipe.yml` | `seed-pinned-thread.yml` |
| 6 | ci-failure-notifier 更新 | `.github/workflows/ci-failure-notifier.yml` に `"Seed Copipe Entries"` 追加 | — |

### タスク間の依存関係

```
1 (migration) → 2 (seed script) → 5 (GHA workflow)
1 (migration) → 3 (handler)
3 (handler) + 4 (commands.yaml) は並行可能
5 + 6 は並行可能
```

## 既存成果物（作成済み）

- `features/command_copipe.feature` — BDDシナリオ（承認済み v1）
- `config/copipe-seed.txt` — seed データファイル（ユーザーがAA追記中）
- `scripts/validate-copipe-seed.mjs` — seed ファイルのバリデーション
