# R-011: 日次リセットID（同一ID/リセット/Cookie再認証/日付境界）

## 対象シナリオ

```gherkin
Scenario: 同日中は異なるスレッドでも同一の日次リセットIDが表示される
  Given ユーザーが書き込み可能状態である
  When スレッド "A" とスレッド "B" にそれぞれ書き込む
  Then 両方の書き込みに同一の日次リセットIDが表示される

Scenario: 翌日になると日次リセットIDがリセットされる
  Given ユーザーが昨日の日次リセットIDで書き込みを行っている
  When 日付が変更された後に書き込みを行う
  Then 昨日とは異なる新しい日次リセットIDが表示される

Scenario: Cookie削除後に再認証しても同日・同一回線では同じIDになる
  Given ユーザーが同日中に同一回線から書き込みを行っている
  And ユーザーが edge-token Cookie を削除する
  And ユーザーがTurnstileで再認証する
  When 同じスレッドに再度書き込む
  Then 再認証前と同一の日次リセットIDが表示される

Scenario: 日付変更のタイミングでIDが混在しない
  Given ユーザーが書き込み可能状態である
  And 現在時刻が日付変更直前である
  When 日付変更をまたいで書き込みを行う
  Then 日付変更後の書き込みには新しいIDが適用される
  And 日付変更前の書き込みのIDは変更されない
```

## 実装ファイル
- `src/lib/services/auth-service.ts` — AuthService（日次リセットID生成）
- `src/lib/services/post-service.ts` — PostService（書き込み時のID割当）
- `features/step_definitions/authentication.steps.ts` — BDDステップ定義
