---
paths:
  - "src/app/api/internal/**"
  - "src/lib/services/*-service.ts"
  - "src/lib/infrastructure/adapters/*-adapter.ts"
  - ".github/workflows/*.yml"
---

## 非同期処理と AI API の実行環境制約

AI API 呼び出し（Gemini等）を伴う非同期処理は、Vercel/CF Workers 内で実行しない。
GitHub Actions ワークフロー内で AI API を直接呼び出し、生成済みの結果のみを Vercel API Route に送信すること。

- Vercel Hobby: 10秒タイムアウト
- CF Workers: 30秒タイムアウト（Paid）
- AI API（Search Grounding等）: 単発で5〜15秒、リトライ込みで確実に超過

各処理の実行場所・API向き先・秘密情報の配置先は D-07 §12.2「非同期処理の実行トポロジ」表を参照すること。