---
task_id: TASK-036
sprint_id: Sprint-15
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-036
depends_on: []
created_at: 2026-03-14T22:00:00+09:00
updated_at: 2026-03-14T22:00:00+09:00
locked_files: []
---

## タスク概要

Next.jsアプリのホスティングをVercelからCloudflare Pagesに移行するためのフィージビリティ調査を行い、移行手順書を作成する。ChMateのHTTP:80接続問題を解決することが主目的。

## 調査項目

### 1. Next.js互換性

現在のプロジェクト構成:
- Next.js 16.1.6 (App Router)
- React 19.2.3
- 依存: @supabase/supabase-js, iconv-lite

以下を調査:
- `@cloudflare/next-on-pages` または後継パッケージがNext.js 16.x App Routerをサポートするか
- App Routerの以下の機能が動作するか:
  - `route.ts` によるAPIルートハンドラ
  - 動的ルート `[boardId]`, `[threadKey]` 等
  - `next.config.ts` の `rewrites`
  - `NextResponse` のバイナリレスポンス（Shift_JISエンコード済みBuffer）
  - `export const dynamic = 'force-dynamic'`
  - `headers()` による リクエストヘッダ読み取り

### 2. Supabase接続

- Cloudflare Workers/Pages環境からSupabase JS Client（HTTP API経由）の接続可否
- Edge Runtime制約（Node.js APIの利用制限）による影響
- 環境変数の設定方法（SUPABASE_URL, SUPABASE_ANON_KEY等）

### 3. HTTP:80制御

- Cloudflare Pagesでカスタムドメインを使用した場合のHTTP:80リクエスト処理
- 「Always Use HTTPS」OFF設定の影響範囲
- Flexible SSL / Full SSL の選択がHTTP:80に与える影響
- ChMateからのHTTP:80リクエストがアプリケーションに到達する経路の確認

### 4. ビルド・デプロイ

- Cloudflare Pagesのビルド設定（ビルドコマンド、出力ディレクトリ）
- GitHub連携（現在Vercelで使用中のGitHubリポジトリとの接続）
- ビルドサイズ制限（Workers 1MB制約の適用有無）
- 環境変数・シークレットの設定方法

### 5. 既知の制約・非互換

- Cloudflare Pages/Workersで使用できないNode.js API
- `iconv-lite` のWorkers環境での動作可否（Shift_JISエンコードに使用）
- ファイルシステムAPIの制限
- Turnstile（Cloudflare自社サービス）との統合への影響

## 必読ドキュメント（優先度順）

1. [必須] `docs/research/chmate_debug_report_2026-03-14.md` — 移行の動機・根本原因
2. [必須] `next.config.ts` — 現在のrewrites設定
3. [必須] `package.json` — 依存パッケージ一覧
4. [必須] `src/app/(senbra)/` — 専ブラ互換ルート一覧（Shift_JISバイナリレスポンス）
5. [参考] `docs/architecture/architecture.md` — §インフラ構成
6. [参考] `src/lib/infrastructure/` — Supabase接続・外部サービス連携

## 出力（生成すべきファイル）

- `tmp/workers/bdd-architect_TASK-036/migration_feasibility.md` — フィージビリティ調査結果
- `tmp/workers/bdd-architect_TASK-036/migration_guide.md` — 移行手順書（TASK-037で使用）

### migration_feasibility.md に含めるべき内容

1. Go/No-Go判定（移行可否）と理由
2. 互換性リスク一覧（影響度: High/Medium/Low）
3. 移行不可の場合の代替案
4. カスタムドメイン要否と設定方針

### migration_guide.md に含めるべき内容（Go判定の場合）

1. 事前準備（必要なアカウント・ドメイン等）
2. パッケージ追加・設定変更の手順
3. `wrangler.toml` / `wrangler.json` の設定内容
4. ビルド・デプロイ手順
5. DNS設定・HTTP:80有効化手順
6. 動作確認チェックリスト
7. Vercel→Cloudflare切り替え手順（ダウンタイム最小化）

## 完了条件

- [ ] 調査項目1〜5の全項目について調査結果が記載されている
- [ ] Go/No-Go判定が明確に示されている
- [ ] Go判定の場合、TASK-037で作業可能な具体的手順書が作成されている

## スコープ外

- 実際の移行作業（TASK-037で実施）
- カスタムドメインの取得（人間が実施）
- 認証バイパス修正（別スプリント）

## 補足・制約

- Web検索を活用し、`@cloudflare/next-on-pages` の最新の互換性情報を確認すること
- Next.js 16.x は比較的新しいバージョンのため、公式ドキュメントだけでなくGitHub Issues等も調査すること
- iconv-liteのWorkers互換性は特に重要（専ブラ互換の根幹）。非互換の場合はpolyfillや代替手段を調査すること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 調査項目1〜5 + 追加項目(crypto, Buffer)の全調査、Go/No-Go判定、移行手順書作成
- 次にすべきこと: TASK-037で実装作業を実施
- 未解決の問題: なし

### 進捗ログ
- 2026-03-14 22:30 ソースコード調査完了。専ブラルート6ファイル、encoding層、supabaseクライアント、auth-service、daily-id を精査
- 2026-03-14 23:00 migration_feasibility.md 作成完了。判定: Conditional Go
- 2026-03-14 23:15 migration_guide.md 作成完了。11セクションの移行手順書
