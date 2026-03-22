# タスク指示書: SMOKE-S93

## メタデータ

| 項目 | 内容 |
|---|---|
| タスクID | SMOKE-S93 |
| タスク種別 | 本番スモークテスト |
| 担当エージェント | bdd-smoke |
| ステータス | completed |
| スプリント | Sprint-93（!omikuji実装 + cron 500修正） |
| 作成日時 | 2026-03-22 |

## 目的

Sprint-93（!omikujiコマンド実装 + cron 500エラー修正）のデプロイ完了後、本番環境に対してPlaywrightスモークテストを実行し、主要機能の正常動作を確認する。

## 作業ログ

### デプロイ確認

- Vercel: 完了済み（人間より確認済み）
- Cloudflare Workers: 最新デプロイ `2026-03-22T02:15:10.379Z`（Sprint-93コミット `c67e7dd` に対応）

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 30/35（5 skipped = ローカル限定テスト） |
| 所要時間 | 51.8s |
| 失敗テスト | なし |

#### スキップテスト（ローカル限定 `test.skip` 対象）

- `[prod-flows] auth-flow.spec.ts` — 認証UI連結フロー（ローカル限定）
- `[prod-flows] bot-display.spec.ts` × 2 — 撃破済みBOT表示（ローカル限定）
- `[prod-flows] polling.spec.ts` × 2 — ポーリング検証（ローカル限定）
