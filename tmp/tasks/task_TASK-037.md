---
task_id: TASK-037
sprint_id: Sprint-15
status: completed
assigned_to: bdd-coding
depends_on: [TASK-036]
created_at: 2026-03-14T23:30:00+09:00
updated_at: 2026-03-14T23:30:00+09:00
locked_files:
  - "package.json"
  - "[NEW] wrangler.toml"
  - "next.config.ts"
  - "src/lib/infrastructure/encoding/shift-jis.ts"
  - "src/app/(senbra)/test/bbs.cgi/route.ts"
---

## タスク概要

Cloudflare Pages移行の技術的準備を行う。パッケージ追加・設定ファイル作成・ローカル互換性検証を実施し、`nodejs_compat` で動作しない箇所があればコード修正を行う。最終的に `wrangler pages dev` でローカル動作確認が取れる状態にする。

## 移行手順書

必ず以下の手順書を最初に読み、手順に従って作業を進めること:
- `tmp/workers/bdd-architect_TASK-036/migration_guide.md` — 移行手順書
- `tmp/workers/bdd-architect_TASK-036/migration_feasibility.md` — フィージビリティ調査結果

## 作業手順

### Phase 1: セットアップ（手順書 §1.1〜§1.2）

1. `@opennextjs/cloudflare` と `wrangler` をdevDependenciesに追加
2. `wrangler.toml` を作成（`nodejs_compat` フラグ必須）
3. `package.json` にCF用スクリプト追加（`build:cf`, `preview:cf`）

### Phase 2: ローカル互換性検証（手順書 §1.3〜§1.4）

1. `npm run build` でNext.jsビルド
2. `npx opennextjs-cloudflare build` でアダプター変換
3. `npx wrangler pages dev` でローカルWorkers起動
4. 検証チェックリスト（手順書 §1.4）をcurlで確認

**@opennextjs/cloudflare が動作しない場合**: `@cloudflare/next-on-pages` にフォールバック（手順書 §1.1参照）

### Phase 3: コード修正（必要な場合のみ — 手順書 §2〜§5）

Phase 2の検証で問題が出た場合、以下を対応:

- **iconv-lite非互換**: `encoding-japanese` パッケージに切替え、`shift-jis.ts` を書き換え（手順書 §2）
- **crypto非互換**: Web Crypto APIに書き換え（手順書 §3）。`generateDailyId` が async になる場合は呼び出し元も修正
- **Buffer非互換**: `Uint8Array` に置換（手順書 §4）
- **rewrites非互換**: `middleware.ts` でrewrite実装（手順書 §5）

### Phase 4: テスト確認

コード修正を行った場合、既存テストが全てPASSすることを確認:
- `npx vitest run`
- `npx cucumber-js`

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_TASK-036/migration_guide.md` — 移行手順書
2. [必須] `tmp/workers/bdd-architect_TASK-036/migration_feasibility.md` — リスク一覧
3. [必須] `src/lib/infrastructure/encoding/shift-jis.ts` — Shift_JISエンコード実装
4. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — Buffer使用箇所
5. [参考] `src/lib/domain/rules/daily-id.ts` — crypto使用箇所
6. [参考] `src/lib/services/auth-service.ts` — crypto使用箇所

## 出力（生成すべきファイル）

- `wrangler.toml` — Cloudflare Workers設定
- `package.json` — パッケージ追加・スクリプト追加
- 必要に応じて修正されたソースファイル

## 完了条件

- [ ] `wrangler.toml` が存在し `nodejs_compat` が設定されている
- [ ] `npx opennextjs-cloudflare build`（または `@cloudflare/next-on-pages`）が成功する
- [ ] `npx wrangler pages dev` でローカルWorkers環境が起動する
- [ ] ローカルWorkers環境で以下が動作する:
  - subject.txt がShift_JISで返る
  - bbsmenu.html がShift_JISで返る
  - bbsmenu.json がJSONで返る
  - SETTING.TXT がShift_JISで返る
- [ ] コード修正を行った場合: `npx vitest run` 全PASS
- [ ] コード修正を行った場合: `npx cucumber-js` 全PASS

## スコープ外

- Cloudflareダッシュボードでの設定（人間が実施）
- カスタムドメイン取得・DNS設定（人間が実施）
- Vercelからの切り替え（デプロイ確認後に人間が実施）
- CLAUDE.md・architecture.md の更新（移行完了後に別タスク）
- 認証バイパス修正（別スプリント）

## 補足・制約

- `@opennextjs/cloudflare` を第一候補とする。動作しない場合のみ `@cloudflare/next-on-pages` にフォールバック
- `nodejs_compat` フラグは必須。これがないとBuffer/crypto等が全く動作しない
- コード修正が発生した場合でも、Vercel環境での動作に影響を与えないこと（両環境互換を維持）
- ローカルWorkers環境の起動にはSupabase Localが必要な可能性がある（DBアクセスが発生するエンドポイント）
- Phase 2の検証でアダプター自体が動作しない場合（Next.js 16.x非対応等）は、エスカレーションを起票すること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### escalation_resolution
- 問題: `.open-next` ディレクトリ内の `next-env.mjs` にエクスポートが重複追記され `wrangler dev` がエラー。`rm -rf` がフックでブロック
- 解決: 人間が `.open-next`, `.open-next-test`, `.test-copy-static`, `.test-copy-static2`, `.wrangler` を手動削除済み
- 方針: クリーンな状態から `.open-next` を再ビルドして `wrangler dev` を起動する。ビルドスクリプト `scripts/build-cf.mjs` の冒頭で `.open-next` を削除するロジックを追加し、重複問題の再発を防止すること

### チェックポイント
- 状態: completed
- 全フェーズ完了

### 進捗ログ
- [開始] CLAUDE.md、タスク指示書、移行手順書、フィージビリティ調査結果を読了
- [調査] shift-jis.ts（iconv-lite使用）、bbs.cgi/route.ts（Buffer.from使用）、daily-id.ts（createHash使用）、auth-service.ts（createHash/randomInt使用）を確認
- [Phase 1 開始] パッケージインストール・設定ファイル作成
- [再開] エスカレーション解決後、クリーンビルドから再開
- [問題1] next-env.mjs 重複エクスポート問題が再発 → build-cf.mjs にビルド後の重複行除去ロジックを追加して解決
- [問題2] ChunkLoadError: @opennextjs/cloudflare 1.17.1 が Turbopack のチャンクロードランタイムを正しくバンドルできない（requireChunkがスタブのまま残る）→ open-next.config.ts で buildCommand を `npx next build --webpack` に設定して Webpack ビルドに切り替え、解決
- [Phase 2 完了] wrangler dev で全4エンドポイント検証OK
- [Phase 4 完了] 既存テスト全PASS確認

### テスト結果サマリー
- ユニットテスト: 15ファイル, 476テスト全PASS
- BDDシナリオ: 88シナリオ, 424ステップ全PASS
- Cloudflare Workers ローカル検証:
  - GET /test/subject.txt → 200 OK (Content-Type: text/plain; charset=Shift_JIS)
  - GET /bbsmenu.html → 200 OK (Shift_JIS HTML)
  - GET /bbsmenu.json → 200 OK (application/json)
  - GET /test/SETTING.TXT → 200 OK (Shift_JIS text)
