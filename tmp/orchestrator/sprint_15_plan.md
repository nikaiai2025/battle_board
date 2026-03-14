# Sprint-15 計画書

## 概要

Vercel → Cloudflare Pages移行。ChMateのHTTP:80接続問題を解決し、商用利用可能なホスティングに移行する。

## 背景

- ChMateはHTTP:80で5chプロトコルリクエストを送信するが、Vercelは308でHTTPS強制リダイレクトするため接続不可
- Cloudflare Pagesはカスタムドメイン + DNS設定でHTTP:80制御が可能
- Cloudflare Pagesは商用利用可能（Vercelは個人プランの商用利用に制約あり）
- 詳細: `docs/research/chmate_debug_report_2026-03-14.md`

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | 依存 |
|---|---|---|---|---|
| TASK-036 | Cloudflare Pages移行フィージビリティ調査 + 移行手順書作成 | bdd-architect | completed | なし |
| TASK-037 | Cloudflare Pages移行: パッケージ追加・wrangler設定・ローカル互換性検証 | bdd-coding | completed | TASK-036 |

## 注意事項

- CLAUDE.mdの横断的制約: 「インフラは Vercel + Supabase + GitHub Actions に固定する（他のクラウドサービスを追加する場合はエスカレーション必須）」
  → 本移行は人間（ユーザー）から明示的に指示されたものであり、エスカレーション済みと判断
- Supabase・GitHub Actionsは変更なし（ホスティングのみVercel→Cloudflare Pages）
- カスタムドメインの用意は人間側の作業

## 結果

### TASK-036: completed
- Conditional Go判定。`nodejs_compat` フラグ前提で移行可能
- 主要リスク: iconv-lite互換性(High), crypto互換性(High), Next.js 16.xアダプター(High)
- 移行手順書・フィージビリティ調査書を作成

### TASK-037: completed
- `@opennextjs/cloudflare` + `wrangler` セットアップ完了
- 発見した問題と解決:
  1. **Turbopack非互換**: `@opennextjs/cloudflare` 1.17.1がTurbopackのチャンクロードランタイムをバンドルできない → `open-next.config.ts` で `buildCommand: "npx next build --webpack"` に切替えて解決
  2. **next-env.mjs重複エクスポート**: Windows環境でビルド時にエクスポートが重複追記される → `scripts/build-cf.mjs` に重複行除去ロジック追加
- iconv-lite, crypto, Buffer は全て `nodejs_compat` フラグで正常動作（コード修正不要）
- ローカルWorkers検証: 4エンドポイント全て200 OK
- 既存テスト: vitest 476件 + cucumber 88シナリオ 全PASS

### 残タスク（人間が実施）
1. Cloudflareアカウント作成・Pagesプロジェクト作成
2. カスタムドメイン取得・DNS設定
3. 環境変数設定（Supabase, Turnstile等）
4. GitHub連携デプロイ
5. HTTP:80有効化（Always Use HTTPS = OFF）
6. 専ブラ実機テスト（ChMate, Siki）
7. 動作確認後、Vercelからの切り替え

手順詳細: `tmp/workers/bdd-architect_TASK-036/migration_guide.md` §6〜§9
