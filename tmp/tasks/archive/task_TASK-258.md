---
task_id: TASK-258
sprint_id: Sprint-87
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T10:15:00+09:00
updated_at: 2026-03-22T10:15:00+09:00
locked_files:
  - ".env.example"
  - "[NEW] .env.local.example"
  - ".gitignore"
---

## タスク概要

`.env.example` → `.env.local.example` へのリネーム。
このファイルは `.env.local` のテンプレートであり、ファイル名をNext.jsの慣例に合わせる。

## 対象BDDシナリオ

なし（ファイルリネームのみ）

## 作業内容

### 1. ファイルリネーム

```bash
git mv .env.example .env.local.example
```

### 2. `.gitignore` の更新

`!.env.example` の行があれば `!.env.local.example` に変更する。

### 3. 参照箇所の更新

ソースコード・ドキュメント内で `.env.example` を参照している箇所を `.env.local.example` に更新する。
ただし tmp/ 配下のアーカイブは変更しない。

Grepで `.env.example` を検索し、該当箇所を全て更新すること（`.env.prod.example` は別ファイルなので対象外）。

## 完了条件

- [ ] `.env.example` が `.env.local.example` にリネームされている
- [ ] `.gitignore` の参照が更新されている
- [ ] ソース・ドキュメント内の参照が更新されている（tmp/ 配下除く）
- [ ] `npx vitest run` が全PASS

## スコープ外

- tmp/ 配下のアーカイブファイル
- `.env.prod.example`（これは正しいのでそのまま）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `git mv .env.example .env.local.example` 実行（ステージ済み）
2. `.gitignore`: `!.env.example` → `!.env.local.example` に更新
3. `.claude/agents/bdd-code-reviewer.md`: 文言内の参照を更新
4. `docs/old/human_setup_checklist.md`: チェックリスト項目を更新
5. `docs/poc/5chbrowser_and_githubactions/poc_execution_plan.md`: PoC固有の独立したサブディレクトリ構成の記述のため変更不要と判断

### テスト結果サマリー

- 単体テスト: 78ファイル / 1635テスト 全PASS（`npx vitest run`）
- BDDシナリオ: 対象なし（ファイルリネームのみのタスク）
