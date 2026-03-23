---
task_id: TASK-257
sprint_id: Sprint-87
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T10:00:00+09:00
updated_at: 2026-03-22T10:00:00+09:00
locked_files:
  - ".gitignore"
  - ".env.prod.smoke.example"
  - "[NEW] .env.prod.example"
  - "playwright.prod.config.ts"
  - "e2e/fixtures/auth.fixture.ts"
  - "docs/operations/runbooks/seed-smoke-user.md"
  - "docs/operations/runbooks/environments.md"
  - "docs/architecture/bdd_test_strategy.md"
  - ".claude/agents/bdd-smoke.md"
  - "supabase/migrations/00017_seed_smoke_user.sql"
---

## タスク概要

`.env.prod.smoke` → `.env.prod` へのリネームに伴い、全参照箇所を一括更新する。
本番シークレット用envファイルの用途を「スモークテスト専用」から「本番環境全般」に拡張するためのリネーム。

## 対象BDDシナリオ

なし（インフラ設定変更のみ）

## 作業内容

### 1. ファイルリネーム

```bash
git mv .env.prod.smoke.example .env.prod.example
```

- `.env.prod.smoke` 自体は `.gitignore` 対象のため git mv 不可。手動リネーム（`mv`）する。
- リネーム後の `.env.prod` に以下の行を **末尾に追加** する:

```
# Cloudflare API (Global API Key)
CLOUDFLARE_API_KEY=
```

**注意: 値は空にすること。実際のキー値はファイルに書き出さない。人間が手動で入力する。**

### 2. `.env.prod.example` の更新

- リネーム元: `.env.prod.smoke.example`
- ファイル内コメントの `Copy to .env.prod.smoke` → `Copy to .env.prod` に更新
- 末尾に `CLOUDFLARE_API_KEY=` のプレースホルダ行を追加

### 3. `.gitignore` の更新

- `!.env.prod.smoke.example` → `!.env.prod.example`

### 4. ソースコード参照の更新

| ファイル | 変更内容 |
|---|---|
| `playwright.prod.config.ts` | コメント + `".env.prod.smoke"` → `".env.prod"` |
| `e2e/fixtures/auth.fixture.ts` | コメント・エラーメッセージ内の `.env.prod.smoke` → `.env.prod` |

### 5. ドキュメント参照の更新

以下のファイル内の `.env.prod.smoke` を `.env.prod` に、`.env.prod.smoke.example` を `.env.prod.example` に置換する:

- `docs/operations/runbooks/seed-smoke-user.md`
- `docs/operations/runbooks/environments.md`
- `docs/architecture/bdd_test_strategy.md`
- `.claude/agents/bdd-smoke.md`
- `supabase/migrations/00017_seed_smoke_user.sql`（コメントのみ）

### 6. tmp/ 配下

tmp/ 配下のアーカイブファイルは歴史的記録のため **変更しない**。

## セキュリティ制約

IMPORTANT:
- `.env.prod` の中身（APIキー、パスワード等）をタスク指示書・作業ログ・任意のファイルに書き出さないこと
- `CLOUDFLARE_API_KEY=` の値は空のままにすること（人間が手動入力する）

## 完了条件

- [x] `.env.prod.smoke.example` が `.env.prod.example` にリネームされている
- [x] `.env.prod.smoke` が `.env.prod` にリネームされている
- [x] `.env.prod` に `CLOUDFLARE_API_KEY=` 行が追加されている（値は空）
- [x] `.gitignore` の参照が更新されている
- [x] `playwright.prod.config.ts` の参照が更新されている
- [x] `e2e/fixtures/auth.fixture.ts` の参照が更新されている
- [x] ドキュメント5ファイルの参照が更新されている
- [x] `npx vitest run` が全PASS
- [x] Grep で `.env.prod.smoke` がソース・ドキュメントに残っていないことを確認（tmp/ 配下は除く）

## スコープ外

- tmp/ 配下のアーカイブファイル
- `.env.prod` への実際のキー値の記入
- locked_files 以外のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ステップ完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- ステップ1: `git mv .env.prod.smoke.example .env.prod.example` + `mv .env.prod.smoke .env.prod` 実行
- ステップ1続き: `.env.prod` 末尾に `CLOUDFLARE_API_KEY=`（値空）を追加
- ステップ2: `.env.prod.example` 内コメント更新 + `CLOUDFLARE_API_KEY=` プレースホルダ追加
- ステップ3: `.gitignore` の `!.env.prod.smoke.example` → `!.env.prod.example` に更新
- ステップ4: `playwright.prod.config.ts`、`e2e/fixtures/auth.fixture.ts` の参照更新
- ステップ5: ドキュメント5ファイル（seed-smoke-user.md、environments.md、bdd_test_strategy.md、bdd-smoke.md、00017_seed_smoke_user.sql）の参照更新
- 最終確認: tmp/ 配下を除くソース・ドキュメントに `.env.prod.smoke` 参照が残っていないことを Grep で確認

### テスト結果サマリー

- `npx vitest run`: 78ファイル / 1635テスト 全PASS
- `.env.prod.smoke` 残存参照: ソース・ドキュメントに0件（tmp/ 配下のアーカイブのみ、変更対象外）
