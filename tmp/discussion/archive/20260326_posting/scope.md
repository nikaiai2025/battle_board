# 敵対的レビュー: posting.feature

## レビュー単位

| # | シナリオ | 主要実装ファイル |
|---|---------|----------------|
| R-001 | 無料ユーザーが書き込みを行う, 有料ユーザーがユーザーネーム付きで書き込みを行う | post-service.ts, posting.steps.ts |
| R-002 | 本文が空の場合は書き込みが行われない | post-service.ts, posting.steps.ts |
| R-003 | 2人が同時に書き込みを行ってもデータ不整合が発生しない | post-service.ts, post-repository.ts, posting.steps.ts |
