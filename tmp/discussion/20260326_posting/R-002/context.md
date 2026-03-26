# R-002: バリデーション（空本文）

## 対象シナリオ

```gherkin
Scenario: 本文が空の場合は書き込みが行われない
  Given ユーザーがスレッド "今日の雑談" を閲覧している
  When 本文を空にして書き込みボタンを押す
  Then エラーメッセージが表示される
  And レスは追加されない
```

## 実装ファイル
- `src/lib/services/post-service.ts` — createPost() バリデーション部分
- `src/lib/infrastructure/repositories/post-repository.ts` — DB操作
- `src/__tests__/lib/services/post-service.test.ts` — 単体テスト

## ステップ定義
- `features/step_definitions/posting.steps.ts` L160-L228（Given + When空本文）
- `features/step_definitions/posting.steps.ts` L275-L283（Then レスは追加されない）
- `features/step_definitions/common.steps.ts` — エラーメッセージが表示されるステップ
