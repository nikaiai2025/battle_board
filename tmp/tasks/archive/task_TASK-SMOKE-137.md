# タスク指示書: TASK-SMOKE-137

## メタ情報

| 項目 | 内容 |
|---|---|
| タスクID | TASK-SMOKE-137 |
| タスク種別 | スモークテスト |
| ステータス | completed |
| 対象コミット | f8a75e6（認証ダイアログをページ上部固定に変更） |

## デプロイ確認

| 対象 | タイムスタンプ (JST) | 状態 |
|---|---|---|
| Vercel | 3分前 Ready | 確認済み |
| CF Workers | 2026-03-27T13:52:51Z（JST 22:52） | 確認済み（最新デプロイ一致） |

## 実行コマンド

```bash
npx playwright test e2e/smoke/ --config=playwright.prod.config.ts
```

## 作業ログ

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 17/17 |
| SKIP | 0 |
| 所要時間 | 26.3s |
| 失敗テスト | なし |
