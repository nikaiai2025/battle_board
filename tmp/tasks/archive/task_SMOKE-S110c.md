---
task_id: SMOKE-S110c
sprint_id: Sprint-110
status: done
assigned_to: bdd-smoke
created_at: 2026-03-24T00:00:00+09:00
updated_at: 2026-03-24T00:00:00+09:00
locked_files: []
---

## タスク概要

Sprint-110 セレクタ修正後のスモークテスト3回目。
`#cf-turnstile` → `#turnstile-widget` セレクタ修正後の確認。

## 対象環境

- Cloudflare Workers: https://battle-board.shika.workers.dev
- Vercel: https://battle-board-uma.vercel.app
- 最新デプロイ: 2026-03-23T18:45:26.391Z

## テスト実行

`npx playwright test --config=playwright.prod.config.ts` を実行。

## 完了条件

- [x] スモークテスト実行完了
- [x] 結果サマリーを作業ログに記載

## 作業ログ

### チェックポイント

- 状態: 完了
- デプロイ確認: 最新デプロイ 2026-03-23T18:45:26Z を確認済み

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/34（5 skipped） |
| 所要時間 | 44.7s |
| 失敗テスト | なし |

**スキップされたテスト（ローカル限定のため本番では test.skip）:**

- `auth-flow.spec.ts`: 未認証→AuthModal認証→作成成功フロー（1件）
- `bot-display.spec.ts`: 撃破済みBOT表示系（2件）
- `polling.spec.ts`: ポーリング検証系（2件）

以上5件はすべて設計上の本番スキップ対象であり、テスト失敗ではない。
