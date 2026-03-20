---
task_id: TASK-134
sprint_id: Sprint-45
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T23:00:00+09:00
updated_at: 2026-03-17T23:00:00+09:00
locked_files:
  - docs/architecture/architecture.md
---

## タスク概要

Phase 5ドキュメントレビュー（TASK-130）で検出されたD-07の更新漏れ3件を修正する。D-08（正本）に合わせてD-07を同期する。

## 修正対象

### DOC-001 (HIGH): botsテーブル定義にカラム追記

`docs/architecture/architecture.md` SS 4.2 の bots テーブル定義に以下の v5 追加カラムを追記:
- `times_attacked` (INTEGER DEFAULT 0) — 攻撃された回数
- `bot_profile_key` (VARCHAR) — bot_profiles.yaml のプロフィールキー
- `daily_id_date` (DATE) — 日次ID最終更新日

**正本**: D-08 `docs/architecture/components/bot.md` SS 5.1

### DOC-002 (HIGH): BotService依存関係図の修正

`docs/architecture/architecture.md` SS 3.3 の BotService 依存先を修正:
- 削除: `PostRepository`（直接依存）, `CurrencyService`, `AuthService`
- 追加: `BotPostRepository`, `AttackRepository`
- `AiApiClient` は将来の拡張として注記付きに変更
- `createPostFn`（関数参照）としてPostService経由の間接依存であることを明記

**正本**: D-08 `docs/architecture/components/bot.md` SS 3.1/3.2

### DOC-005 (MEDIUM): ER図の更新

同じくSS 4.1 のER図内 bots テーブルに v5 追加カラムを反映。
ER図は概要レベルのため、主要カラム（`times_attacked`, `bot_profile_key`）のみ追記で可。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-doc-reviewer_TASK-130/doc_review_report.md` — レビュー指摘の詳細
2. [必須] `docs/architecture/components/bot.md` — 正本（SS 3.1, 3.2, 5.1）
3. [必須] `docs/architecture/architecture.md` — 修正対象

## 完了条件
- [ ] SS 4.2 bots テーブル定義に3カラム追記
- [ ] SS 3.3 BotService依存先をD-08と一致するよう修正
- [ ] SS 4.1 ER図にv5カラム反映
- [ ] D-07とD-08の記述に矛盾がないことを確認

## スコープ外
- D-04 (OpenAPI) の変更（DOC-003は人間確認事項）
- D-08 の変更（D-08は正本であり正確）
- ソースコードの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: DOC-001, DOC-002, DOC-005 すべて修正完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. タスク指示書・レビューレポート（TASK-130）・正本D-08（bot.md）・修正対象D-07（architecture.md）を読み込み、修正箇所を特定
2. DOC-002: SS 3.3 BotService依存関係を修正
   - 削除: `PostRepository`（直接依存）、`CurrencyService`、`AuthService`
   - 追加: `BotPostRepository`、`AttackRepository`
   - `AiApiClient`に「Phase 3以降の将来依存」注記を追加
   - `createPostFn`（PostService.createPost への関数参照として注入）を追記
3. DOC-001: SS 4.2 botsテーブル定義に3カラムを追記
   - `times_attacked` (INTEGER DEFAULT 0) — v5追加
   - `bot_profile_key` (VARCHAR) — v5追加
   - `daily_id_date`は元から定義済みのため追記不要（重複を防ぐため追加した行を削除）
4. DOC-005: SS 4.1 ER図のbotsテーブルに`times_attacked`、`bot_profile_key`を追記（概要レベルのため主要2カラムのみ）

### テスト結果サマリー

本タスクはドキュメント修正のみ。ソースコードの変更なし。単体テスト・BDDシナリオの実行対象外。
