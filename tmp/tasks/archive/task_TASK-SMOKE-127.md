# タスク指示書: SMOKE-127

| 項目 | 内容 |
|---|---|
| タスクID | SMOKE-127 |
| スプリント | Sprint-127 |
| 担当 | bdd-smoke |
| ステータス | completed |

## 概要

Sprint-127 デプロイ後の本番スモークテスト実行。

## 作業ログ

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/34 |
| スキップ | 5（ローカル限定テスト） |
| 所要時間 | 52.0s |
| 失敗テスト | なし |

### 詳細

**デプロイ確認:**
- 最新デプロイ: `2026-03-26T03:14:20Z`（本日付け）
- デプロイ完了確認済み

**実行設定:**
- 設定ファイル: `playwright.prod.config.ts`
- baseURL: `https://battle-board.shika.workers.dev`（`.env.prod`の`PROD_BASE_URL`で上書き可能）

**スキップされたテスト（5件）:**

ローカル限定テストのため `test.skip` により除外（正常動作）:
- `auth-flow.spec.ts`: 認証UI連結フロー（ローカル限定）
- `bot-display.spec.ts`: 撃破済みBOT表示（ローカル限定）× 2件
- `polling.spec.ts`: ポーリング検証（ローカル限定）× 2件

**PASSしたテスト（29件）:**

prod-smoke（ナビゲーションテスト）: 17件全PASSd
prod-flows（ベーシックフロー）: 12件中12件PASS（スキップ除く）
