# タスク指示書: TASK-SMOKE-S84-FIX

## 概要

CF Workers Error 1101 の本番障害修正後のデプロイ確認スモークテスト。

## 背景

前回スモークテストでは23テスト全FAILだった（CF Workers Error 1101）。
修正内容: wrangler.toml の main を `.open-next/worker.js` に復元、build-cf.mjs に scheduled ハンドラ注入のビルド後処理を追加。

## 実行環境

- 本番URL: https://battle-board.nikai-ai.workers.dev/
- テスト設定: `playwright.prod.config.ts`

## 作業ログ

### デプロイ確認

最新デプロイ: 2026-03-21T01:05:20.877Z — 本日のGitプッシュ以降のデプロイを確認。

### テスト実行コマンド

```bash
npx playwright test --config=playwright.prod.config.ts
```

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/34（5スキップ） |
| 所要時間 | 約1分30秒 |
| スキップ理由 | ローカル限定テスト（isProduction=true でスキップ）: 認証UIフロー、撃破済みBOT表示×2、ポーリング×2 |

### スキップテスト一覧（正常スキップ）

- `auth-flow.spec.ts` — 認証UI連結フロー（ローカル限定）
- `bot-display.spec.ts` — 撃破済みBOT表示×2（ローカル限定）
- `polling.spec.ts` — ポーリング検証×2（ローカル限定）

## ステータス

completed
