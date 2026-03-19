---
esc_id: ESC-TASK-194-1
task_id: TASK-194
status: open
created_at: 2026-03-20T04:10:00+09:00
---

# エスカレーション: build:cf ローカル実行禁止フックと完了条件の矛盾

## 問題の内容

TASK-194 の完了条件に `npm run build:cf` が成功（OpenNextビルド）とあるが、
`.claude/hooks/block-manual-deploy.sh` によりローカル実行が明示的にブロックされている。

```
# build:cf（Cloudflare用ビルド。ローカルの wrangler.toml [vars] が焼き込まれる）
if echo "$FIRST_LINE" | grep -qE 'build:cf|build-cf'; then
  permissionDecision: "deny"
```

ブロック理由: 「Cloudflare用ビルド(build:cf)はローカル実行禁止。デプロイは git push → Cloudflare自動ビルドで行う。」

## 完了済みの作業

以下は全て完了・確認済み:

- [x] `package.json` の `"next"` を `"~16.1.6"` に変更（実際にインストールされるのは 16.1.7）
- [x] `npm install` が正常完了（3パッケージ変更）
- [x] `npx next build` が成功（Next.js 16.1.7 でビルド成功）
- [x] `npx vitest run` が全件PASS（65テストファイル、1386テスト全件PASS）
- [ ] `npm run build:cf` — フックによりローカル実行不可

## 選択肢と各選択肢の影響

### 選択肢A: `build:cf` の完了条件を「git push 後の Cloudflare 自動ビルドで確認」に読み替えてタスク完了とする

- **影響**: タスクを即時完了扱いにできる。`build:cf` の検証は Cloudflare のビルドログで確認する。
- **根拠**: タスク指示書の「スコープ外」セクションに「Cloudflareへのデプロイ（コミット・プッシュ後の自動デプロイで実施）」とある。フック設計の意図とも整合する。
- **リスク**: ローカルで OpenNext ビルドが通るかの事前確認ができない（ただし 16.1.6 系は動作実績あり）。

### 選択肢B: フック対象外のコマンドで代替確認する（例: `node scripts/build-cf.mjs` を直接実行）

- **影響**: フックは `build:cf` キーワードを検知するため、直接 `node scripts/build-cf.mjs` を実行すると通過する可能性がある。
- **リスク**: フックの意図（ローカルの `wrangler.toml [vars]` 焼き込み防止）を迂回することになり、運用ポリシー違反になる可能性がある。人間の承認なしに実行すべきではない。

### 選択肢C: タスク指示書の完了条件から `npm run build:cf` を削除する

- **影響**: タスク指示書を修正する必要がある（オーケストレーターの作業）。
- **根拠**: 選択肢Aと実質同じだが、ドキュメントの整合性が保たれる。

## 推奨

**選択肢A**を推奨する。

理由:
1. フックの設計意図（ローカル vars 焼き込み防止）は CI/CD のセキュリティのためであり、迂回すべきではない
2. Next.js 16.1.7 は 16.1.6 系であり、16.1.6 で動作実績のある OpenNext ビルドが通らない理由はない
3. タスク指示書の「スコープ外」記述と整合する

## 関連ファイル

- `.claude/hooks/block-manual-deploy.sh` — ブロックフックの実装
- `tmp/tasks/task_TASK-194.md` — タスク指示書（完了条件）
- `scripts/build-cf.mjs` — build:cf の実体スクリプト
