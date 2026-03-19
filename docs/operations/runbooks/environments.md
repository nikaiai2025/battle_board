# 環境一覧

## 本番環境

| 環境 | URL | ホスティング | 備考 |
|---|---|---|---|
| Cloudflare | https://battle-board.shika.workers.dev/ | Cloudflare Pages (Workers) | ChMate読み取り対応。メイン環境予定 |
| Vercel | https://battle-board-uma.vercel.app/ | Vercel | Siki対応。ChMateはHTTP:80→308で接続不可 |

共通バックエンド: Supabase（プロジェクトref: `mxegtoiwbhmugurbhmab`、リージョン: Northeast Asia Tokyo）

## ローカル開発環境

| サービス | URL | 起動方法 |
|---|---|---|
| Next.js | http://localhost:3000 | `npm run dev` |
| Supabase Local | http://127.0.0.1:54321 | `npx supabase start`（Docker必須） |
| Wrangler (CF Workers) | http://localhost:8788 | `npm run preview:cf`（ビルド後） |

## 環境変数の管理

| 環境 | 設定場所 | 備考 |
|---|---|---|
| ローカル | `.env.local` | gitignore済み。Supabase Localの接続情報 |
| 本番スモーク | `.env.prod.smoke` | gitignore済み。スモークテスト用シークレット（`seed-smoke-user.md` 参照） |
| Vercel | Vercel ダッシュボード > Settings > Environment Variables | Build/Runtime両方に設定 |
| Cloudflare | Cloudflare ダッシュボード > Workers & Pages > Settings > Variables | Build/Runtime両方に設定。`NEXT_PUBLIC_*` はBuild側にも必要 |

| GitHub Actions | リポジトリ Settings > Secrets and variables > Actions | 下表参照 |

### GitHub Actions Secrets 一覧

設定場所: リポジトリ Settings > Secrets and variables > Actions > New repository secret

| Secret名 | 取得先 | 使用ワークフロー |
|---|---|---|
| `BOT_API_KEY` | デプロイ先環境変数 `BOT_API_KEY` と同じ値 | bot-scheduler, daily-maintenance |
| `DEPLOY_URL` | デプロイURL（末尾スラッシュなし）※TDR-010によりVercelを指定 | bot-scheduler, daily-maintenance |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard > Account > Access Tokens | migrate |
| `SUPABASE_PROJECT_REF` | Supabase Dashboard > Project Settings > General > Reference ID | migrate |
| `SUPABASE_URL` | Supabase Dashboard > Project Settings > Data API > Project URL | seed-pinned-thread |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Project Settings > Data API > service_role (secret) | seed-pinned-thread |

## 専ブラ互換状況

| 専ブラ | Cloudflare | Vercel |
|---|---|---|
| Siki | 読み書き ✅ | 読み書き ✅ |
| ChMate | 読み取り ✅ / 書き込み ❌（認証問題） | 接続不可（HTTP:80→308） |

ChMate書き込み問題の詳細: `tmp/auth_spec_review_context.md` G5
