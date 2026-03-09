# BattleBoard AI API 無料枠PoC 実行計画書（HelloWorld）

作成日: 2026-03-09（JST）  
対象: `battle_board` ローカル環境（Vercelデプロイなし）

## 1. 目的

- 無料利用可能なAI APIを対象に、`HelloWorld` 応答の疎通確認を行う。
- プロジェクトへ共通PoC実装を追加し、プロバイダ切替で再利用可能にする。
- 実行結果を記録し、後続のモデル選定に使える比較材料を残す。

## 2. ゴール定義

- ゴール1: 無料枠がある各APIに対して、少なくとも1回実行を試行する。
- ゴール2: 1つ以上のAPIで `HelloWorld` 表示成功を確認する。
- ゴール3: 成功/失敗の結果と原因をレポート化する。

## 3. 対象API（無料利用可能枠）

以下を「無料利用可能な対象」として試行する（無料クレジット含む）。

1. Gemini Free Tier
2. Groq Free Tier
3. OpenRouter Free
4. Mistral Experiment
5. Cohere Trial
6. Hugging Face Inference Providers（無料クレジット）
7. GitHub Models（無料・rate-limited）
8. Cerebras Free Tier
9. SambaNova（初期無料クレジット）
10. Fireworks（新規無料クレジット）

## 4. 人間が対応する環境準備

## 4.1 アカウント・キー準備（人間作業）

下記サービスでAPIキー（またはトークン）を発行する。  
最初は2〜3サービスから開始してもよい。

1. `GOOGLE_GENERATIVE_AI_API_KEY`（Gemini）
2. `GROQ_API_KEY`
3. `OPENROUTER_API_KEY`
4. `MISTRAL_API_KEY`
5. `COHERE_API_KEY`
6. `HF_TOKEN`
7. `GITHUB_MODELS_TOKEN`（PAT等、`models:read` 権限）
8. `CEREBRAS_API_KEY`
9. `SAMBANOVA_API_KEY`
10. `FIREWORKS_API_KEY`

## 4.2 ローカル環境準備（人間作業）

1. Node.js LTS（推奨 20系以上）を用意
2. プロジェクトルートで依存インストール
3. `.env.local` を作成し、発行したキーを設定
4. APIキーをGit管理へ含めない（`.gitignore`で除外確認）

例: `.env.local`

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
MISTRAL_API_KEY=...
COHERE_API_KEY=...
HF_TOKEN=...
GITHUB_MODELS_TOKEN=...
CEREBRAS_API_KEY=...
SAMBANOVA_API_KEY=...
FIREWORKS_API_KEY=...
```

## 4.3 注意事項（人間確認）

1. 無料枠はレート制限や日次上限があるため、短時間連続実行を避ける
2. 利用規約上、地域制限や電話番号認証が必要な場合がある
3. クレジット系無料枠は失効期限があるため、発行日を記録する

## 4.4 公式ドキュメント準拠: サービス別 環境構築ガイド（対象全モデル）

このセクションは「人間が実施する作業」を、対象APIごとに同じ形式で整理したもの。  
各サービスで `アカウント作成 → APIキー発行 → .env.local設定 → 単体疎通` を実施する。

共通の単体疎通コマンド（PoC実装後に使用）:

```powershell
curl "http://localhost:3000/api/ai/hello?provider=<provider>"
```

## 4.4.1 Gemini Free Tier（model: `gemini-2.0-flash`）

- 公式:
  - Quickstart: https://ai.google.dev/gemini-api/docs/quickstart
  - Pricing: https://ai.google.dev/pricing
  - Quota (Free Tier): https://ai.google.dev/gemini-api/docs/quota
- 人間作業:
  1. Google AI StudioでAPIキーを作成
  2. 無料枠のレート制限を確認
  3. `.env.local` に `GOOGLE_GENERATIVE_AI_API_KEY` を設定
- 確認:
  - `provider=gemini` で実行し、`HelloWorld` 返却を確認

## 4.4.2 Groq Free Tier（model: `llama-3.1-8b-instant`）

- 公式:
  - Quickstart: https://console.groq.com/docs/quickstart
  - Models: https://console.groq.com/docs/models
  - Rate limits: https://console.groq.com/docs/rate-limits
- 人間作業:
  1. Groq Consoleでアカウント作成
  2. APIキーを発行
  3. Freeプランの上限を確認
  4. `.env.local` に `GROQ_API_KEY` を設定
- 確認:
  - `provider=groq` で疎通

## 4.4.3 OpenRouter Free（model: `openrouter/free`）

- 公式:
  - Quickstart: https://openrouter.ai/docs/quick-start
  - API keys: https://openrouter.ai/docs/api-keys
  - Pricing/Free plans: https://openrouter.ai/pricing
  - Free router: https://openrouter.ai/openrouter/free
- 人間作業:
  1. OpenRouterでAPIキー発行
  2. 無料プラン制限（req/day等）を確認
  3. `.env.local` に `OPENROUTER_API_KEY` を設定
- 確認:
  - `provider=openrouter` で疎通

## 4.4.4 Mistral Experiment（model: `mistral-small-latest`）

- 公式:
  - Quickstart: https://docs.mistral.ai/getting-started/quickstart/
  - Pricing: https://docs.mistral.ai/getting-started/pricing/
  - Experiment plan: https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan
- 人間作業:
  1. Mistralアカウント作成
  2. Experimentプラン条件（認証要件）を満たす
  3. APIキーを発行
  4. `.env.local` に `MISTRAL_API_KEY` を設定
- 確認:
  - `provider=mistral` で疎通

## 4.4.5 Cohere Trial（model: `command-a`）

- 公式:
  - Getting started: https://docs.cohere.com/docs/get-started
  - Rate limits / key種別: https://docs.cohere.com/docs/rate-limits
  - Pricing: https://cohere.com/pricing
- 人間作業:
  1. Cohere DashboardでAPIキー作成
  2. Trial key と Production key の違いを確認
  3. `.env.local` に `COHERE_API_KEY` を設定
- 確認:
  - `provider=cohere` で疎通

## 4.4.6 Hugging Face Inference Providers（model例: `openai/gpt-oss-120b`）

- 公式:
  - Inference Providers overview: https://huggingface.co/docs/inference-providers/en/index
  - Pricing & billing: https://huggingface.co/docs/inference-providers/pricing
  - User access tokens: https://huggingface.co/docs/hub/security-tokens
- 人間作業:
  1. Hugging Faceでアカウント作成
  2. Fine-grained tokenを作成（推論利用権限）
  3. 無料クレジット枠と超過時課金条件を確認
  4. `.env.local` に `HF_TOKEN` を設定
- 確認:
  - `provider=hf` で疎通

## 4.4.7 GitHub Models（model例: `openai/gpt-4o`）

- 公式:
  - Quickstart: https://docs.github.com/en/enterprise-cloud@latest/github-models/quickstart
  - Inference API: https://docs.github.com/en/rest/models/inference
  - Billing: https://docs.github.com/en/billing/concepts/product-billing/github-models
- 人間作業:
  1. GitHub Modelsを有効化
  2. Fine-grained PAT（`models:read`）またはGitHub Appを作成
  3. 無料枠（rate-limited）と有料opt-in条件を確認
  4. `.env.local` に `GITHUB_MODELS_TOKEN` を設定
- 確認:
  - `provider=github_models` で疎通

## 4.4.8 Cerebras Free Tier（model: `llama3.1-8b`）

- 公式:
  - Quickstart: https://inference-docs.cerebras.ai/quickstart
  - Pricing (Free/Developer): https://www.cerebras.ai/pricing
  - Rate limits: https://inference-docs.cerebras.ai/support/rate-limits
- 人間作業:
  1. Cerebrasアカウント作成
  2. APIキーを発行
  3. Free Tierの制限を確認
  4. `.env.local` に `CEREBRAS_API_KEY` を設定
- 確認:
  - `provider=cerebras` で疎通

## 4.4.9 SambaNova（model: `Meta-Llama-3.3-70B-Instruct`）

- 公式:
  - Quickstart: https://docs.sambanova.ai/cloud/docs/get-started/quickstart
  - Models: https://docs.sambanova.ai/cloud/docs/models
  - Plans: https://cloud.sambanova.ai/plans
- 人間作業:
  1. SambaNova Cloudアカウント作成
  2. APIキーを作成
  3. 無料クレジットの条件・期限を確認
  4. `.env.local` に `SAMBANOVA_API_KEY` を設定
- 確認:
  - `provider=sambanova` で疎通

## 4.4.10 Fireworks（model例: `accounts/fireworks/models/llama-v3p1-8b-instruct`）

- 公式:
  - API keys: https://docs.fireworks.ai/api-reference/post-api-keys
  - Pricing/cost structure: https://docs.fireworks.ai/faq/billing-pricing-usage/pricing/cost-structure
  - Billing overview: https://docs.fireworks.ai/faq/billing-pricing-usage
- 人間作業:
  1. Fireworksアカウント作成
  2. APIキー発行
  3. 無料クレジット付与の有無と失効条件を確認
  4. `.env.local` に `FIREWORKS_API_KEY` を設定
- 確認:
  - `provider=fireworks` で疎通

## 4.4.11 混同防止チェック（作業者向け）

1. `.env.local` の変数名が計画書と一致している
2. 1サービスずつ設定し、設定直後に疎通確認してから次へ進む
3. モデルIDは固定文字列を使い、推測入力しない
4. エラー発生時はキー再発行ではなく、まず権限・無料枠上限・モデルIDを確認する
5. 検証ログに「日時・provider・model・結果・エラー分類」を必ず残す

## 5. 実装方針（共通PoC）

## 5.1 追加する実装

1. APIルートを1本追加  
   - `src/app/api/ai/hello/route.ts`
2. クエリ `provider` で対象APIを切替
3. 入力プロンプトは固定  
   - `Return exactly: HelloWorld`
4. 出力を統一JSONで返す  
   - `provider`, `model`, `ok`, `output`, `error`

## 5.2 実装要件

1. APIキーは必ずサーバーサイドで利用（クライアント露出禁止）
2. 既存制約に従い、PoCでも機密情報をログ出力しない
3. 失敗時は `error` に原因分類（認証/クオータ/モデル不一致/通信）

## 6. 実行手順（ローカル）

## 6.1 初回セットアップ

1. 依存追加（必要分）
```bash
npm i ai @ai-sdk/google @ai-sdk/groq @ai-sdk/openai-compatible
```

2. 開発サーバ起動
```bash
npm run dev
```

## 6.2 API試験コマンド

PowerShell例（`provider` を切替して順次実行）:

```powershell
curl "http://localhost:3000/api/ai/hello?provider=gemini"
curl "http://localhost:3000/api/ai/hello?provider=groq"
curl "http://localhost:3000/api/ai/hello?provider=openrouter"
curl "http://localhost:3000/api/ai/hello?provider=mistral"
curl "http://localhost:3000/api/ai/hello?provider=cohere"
curl "http://localhost:3000/api/ai/hello?provider=hf"
curl "http://localhost:3000/api/ai/hello?provider=github_models"
curl "http://localhost:3000/api/ai/hello?provider=cerebras"
curl "http://localhost:3000/api/ai/hello?provider=sambanova"
curl "http://localhost:3000/api/ai/hello?provider=fireworks"
```

## 6.3 成功判定

以下を満たせばそのAPIは成功:

1. HTTP 200
2. `ok: true`
3. `output` が `HelloWorld` と一致

## 7. 結果記録手順

結果記録ファイルを作成:

- `docs/research/ai_api_poc_helloworld_result_YYYY-MM-DD.md`

記録テンプレート:

```md
## <provider>
- model:
- free_tier_type: (恒久無料 / 無料クレジット / trial)
- status: success | failed
- response_excerpt:
- error_category: auth | quota | model | network | other
- notes:
```

## 8. リスクと対策

1. 無料枠上限超過でテストが不安定  
   - 対策: リクエスト間隔を空ける、日次で再試行
2. API仕様変更で一部プロバイダが即時非互換  
   - 対策: OpenAI互換層を使い、失敗時は個別分岐で吸収
3. モデルID変更・廃止  
   - 対策: モデルIDを設定ファイル化し、差し替え可能にする

## 9. 実施順序（推奨オペレーション）

1. Gemini / Groq / OpenRouter で先に疎通
2. Mistral / Cohere / Hugging Face / GitHub Models を追加試験
3. Cerebras / SambaNova / Fireworks を試験
4. 全結果を記録して完了判定

## 10. 完了条件チェックリスト

- [ ] `.env.local` に対象APIキーを設定した
- [ ] `api/ai/hello` ルートが動作する
- [ ] 無料利用対象APIを全件試行した
- [ ] 1件以上 `HelloWorld` 成功を確認した
- [ ] 結果記録ファイルを作成した
