---
task_id: TASK-SMOKE-135
sprint_id: Sprint-135
status: done
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-27T23:00:00+09:00
updated_at: 2026-03-27T21:36:00+09:00
---

## タスク概要

伝統的テーマ追加 + スレッドタイトル改善 + フローティング書き込みパネル改善のデプロイ後スモークテストを実行する。

## デプロイ済みコミット

- `8e442ce` — 伝統的テーマ追加 + スレッドタイトル改善 + フローティングパネル改善
  - Vercel: 3分前 Ready
  - CF Workers: JST 20:33

## テスト実行コマンド

```bash
npx playwright test e2e/smoke/
```

## 完了条件

- [x] スモークテスト実行完了
- [x] PASS/FAIL/SKIP の件数を報告

## 作業ログ

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 16/17 |
| SKIP | 0 |
| 所要時間 | 49.9s |
| 失敗テスト | 認証ページ /auth/verify › HTTPステータス200で応答し、認証フォームとTurnstileウィジェットが表示される |

**失敗詳細:**

- テストファイル: `e2e/smoke/navigation.spec.ts:309`
- エラー: `expect(locator).toBeVisible()` が失敗
  - Locator: `#turnstile-widget`
  - Expected: visible
  - Received: hidden (タイムアウト 15000ms)
  - 要素自体は DOM に存在するが `hidden` 状態のまま
- スクリーンショット: `ゴミ箱\test-results\navigation-認証ページ-auth-veri-e2b9d-証フォームとTurnstileウィジェットが表示される-smoke\test-failed-1.png`
- エラーコンテキスト: `ゴミ箱\test-results\navigation-認証ページ-auth-veri-e2b9d-証フォームとTurnstileウィジェットが表示される-smoke\error-context.md`

### テスト結果サマリー（再実行: コミット ff4ac62）

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 17/17 |
| SKIP | 0 |
| 所要時間 | 17.8s |
| 失敗テスト | なし |

コミット ff4ac62（Turnstileウィジェット `min-h-[65px]` 追加）のデプロイ後、`#turnstile-widget` の visibility 問題は解消。全テストPASS。

### チェックポイント
- 状態: done
- 完了済み: スモークテスト再実行（全17テストPASS）
- 未解決の問題: なし
