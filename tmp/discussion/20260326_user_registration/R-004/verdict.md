# R-004 判定

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-R004-1 | CRITICAL | ACCEPT | **採用** | PAT平文がJSON APIレスポンスに含まれる。authToken除去方針と矛盾 |
| ATK-R004-2 | CRITICAL | REJECT | 却下 | フロントエンドは!res.okで一律エラー処理。仮ユーザーはボタンdisabled |
| ATK-R004-3 | HIGH | ACCEPT | **採用** | NOT_REGISTERED分岐の単体テスト欠落。CIでの回帰検出不可 |
