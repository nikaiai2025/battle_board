---
escalation_id: ESC-TASK-097-1
task_id: TASK-097
status: open
created_at: 2026-03-16T23:00:00+09:00
---

## 問題の内容

`user_registration.feature` の以下シナリオが通らない:

```gherkin
Scenario: 仮ユーザーは課金できない
  Given 仮ユーザーがマイページを表示している
  Then 課金ボタンは無効化されている
  And 本登録が必要である旨のメッセージが表示される
```

`課金ボタンは無効化されている` ステップ（`mypage.steps.ts:550`）は `upgradeToPremium()` を呼び出し、`{success: false, code: "ALREADY_PREMIUM"}` を期待する。
しかし仮ユーザー（`registrationType: null`）は `isPremium: false` のため、`upgradeToPremium()` が `{success: true}` を返し、テストが FAIL する。

## 仕様上の矛盾

`user_registration.feature` には以下のコメントがある:
> `# mypage.feature の「課金ボタン」シナリオに対する追加制約。`
> `# 本登録ユーザーのみ課金（有料ステータス切り替え）が可能。`

一方 `mypage.feature` には:
```gherkin
Scenario: 無料ユーザーが課金ボタンで有料ステータスに切り替わる
  Given 無料ユーザーがマイページを表示している
  When 課金ボタンを押す
  Then 有料ユーザーステータスに切り替わる
```

`mypage.steps.ts` の `無料ユーザーがマイページを表示している` ステップは `AuthService.issueEdgeToken()` で仮ユーザーを作成する（`registrationType: null`）。
つまり現在の実装では「無料ユーザー＝仮ユーザー」と同義になっており、`user_registration.feature` の追加制約と矛盾している。

## 選択肢と影響

### 選択肢A: mypage-service.ts の upgradeToPremium に「本登録必須チェック」を追加する
- `upgradeToPremium()` で `registrationType === null` の場合 `{success: false, code: "NOT_REGISTERED"}` を返す
- `mypage.steps.ts` の `課金ボタンは無効化されている` を `ALREADY_PREMIUM` または `NOT_REGISTERED` を受け入れるよう修正
- `mypage.steps.ts` の `無料ユーザーがマイページを表示している` で作成するユーザーに `registrationType: 'email'` を設定する必要がある（さもないと `無料ユーザーが課金ボタンで有料ステータスに切り替わる` が FAIL する）
- **影響**: `mypage.feature` の `無料ユーザーが課金ボタンで有料ステータスに切り替わる` シナリオも修正が必要（対象ユーザーを本登録済みにする）
- **メリット**: 仕様の意図に最も忠実

### 選択肢B: mypage.feature の「無料ユーザー」を「本登録済み無料ユーザー」に変更する
- `mypage.feature` の `Scenario: 無料ユーザーが課金ボタンで有料ステータスに切り替わる` を `本登録済みの無料ユーザーが課金ボタンで有料ステータスに切り替わる` に変更
- `mypage.steps.ts` の対応 Given ステップを本登録済みユーザーを作成するよう修正
- **影響**: BDD シナリオの変更は人間の承認が必要（CLAUDE.md 禁止事項）
- **このオプションはエスカレーションが必要**

### 選択肢C: 現状を受け入れ、仮ユーザーは課金できないシナリオを pending にする
- `仮ユーザーは課金できない` シナリオのステップ定義を修正して pending を返す
- **影響**: BDD 受け入れ基準の未達
- **デメリット**: 仕様が実装されないまま残る

## 推奨

選択肢Aを推奨。必要な変更範囲:
1. `src/lib/services/mypage-service.ts` — `upgradeToPremium()` に `NOT_REGISTERED` チェック追加
2. `features/step_definitions/mypage.steps.ts` — `課金ボタンは無効化されている` ステップを `ALREADY_PREMIUM` または `NOT_REGISTERED` を受け入れるよう修正
3. `features/step_definitions/mypage.steps.ts` — `無料ユーザーがマイページを表示している` ステップで `registrationType: 'email'` を設定

これらは全て TASK-097 の `locked_files` 外のファイルのため、エスカレーションとする。

## 関連するfeatureファイル・シナリオタグ

- `features/user_registration.feature` — `仮ユーザーは課金できない` （Line 208）
- `features/user_registration.feature` — `本登録済みの無料ユーザーは課金できる` （Line 213）
- `features/mypage.feature` — `無料ユーザーが課金ボタンで有料ステータスに切り替わる`
