# タスク指示書: SMOKE-126

**タスクID:** SMOKE-126
**種別:** スモークテスト
**ステータス:** completed
**担当:** bdd-smoke

## 概要

Sprint-126 デプロイ後の本番スモークテスト。既存の全スモークテスト + !copipe コマンド機能の動作確認。

## 対象デプロイ

- Cloudflare Workers (battle-board): 2026-03-26T00:45:51.455Z（バージョン: 4ae91682-18ae-41f6-92f1-417d64d7f5d0）

## 作業ログ

### デプロイ確認

`wrangler deployments list --name battle-board` にて最新デプロイが本日（2026-03-26）00:45 であることを確認。

### テスト実行

```
npx playwright test --config=playwright.prod.config.ts
```

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/34（5 skipped） |
| 所要時間 | 49.5s |
| 失敗テスト | なし |

**スキップ内訳（ローカル限定テスト、本番では test.skip が適用）:**

- `auth-flow.spec.ts`: 認証UI連結フロー（ローカル限定）1件
- `bot-display.spec.ts`: 撃破済みBOT表示（ローカル限定）2件
- `polling.spec.ts`: ポーリング検証（ローカル限定）2件
