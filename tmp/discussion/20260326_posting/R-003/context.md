# R-003: 同時書き込み（データ整合性）

## 対象シナリオ

```gherkin
Scenario: 2人が同時に書き込みを行ってもデータ不整合が発生しない
  Given ユーザー "UserA" とユーザー "UserB" がスレッド "今日の雑談" を閲覧している
  When "UserA" と "UserB" が同時に書き込みを行う
  Then 両方のレスが正しくスレッドに追加される
  And レス番号が重複しない
```

## 実装ファイル
- `src/lib/services/post-service.ts` — createPost()（レス番号の採番ロジック）
- `src/lib/infrastructure/repositories/post-repository.ts` — create()（レス番号のDB採番）
- `src/__tests__/lib/services/post-service.test.ts` — 単体テスト

## ステップ定義
- `features/step_definitions/posting.steps.ts` L294-L424（同時書き込みGiven/When）
- `features/step_definitions/posting.steps.ts` L431-L465（同時書き込みThen）

## 注意点
- レス番号の重複防止は本番ではDB側のシーケンスまたはCOUNT+1で実現
- BDDテストはインメモリリポジトリを使用するため、本番のDB競合とは検証レイヤーが異なる
