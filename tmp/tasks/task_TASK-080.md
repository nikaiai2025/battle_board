---
task_id: TASK-080
sprint_id: Sprint-28
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T14:00:00+09:00
updated_at: 2026-03-16T14:00:00+09:00
locked_files:
  - "features/ai_accusation.feature"
  - "features/step_definitions/ai_accusation.steps.ts"
  - "features/step_definitions/command_system.steps.ts"
  - "features/command_system.feature"
  - "features/support/hooks.ts"
  - "config/commands.yaml"
  - "src/lib/domain/rules/accusation-rules.ts"
  - "src/__tests__/lib/domain/rules/accusation-rules.test.ts"
  - "src/lib/services/accusation-service.ts"
  - "src/__tests__/lib/services/accusation-service.test.ts"
  - "src/lib/services/command-service.ts"
  - "src/lib/services/__tests__/command-service.test.ts"
  - "src/lib/services/handlers/tell-handler.ts"
---

## タスク概要

ai_accusation.feature を具体的数値入りに書き換え、告発経済パラメータをcommands.yamlに集約する。ハードコード定数を削除し、YAML設定値を各サービスに伝播させる。ステップ定義とテストを全て更新してPASSさせる。

## 対象BDDシナリオ
- `features/ai_accusation.feature` — 全シナリオ（BOTマーク2件はcucumber.js除外のまま）
- `features/command_system.feature` — 回帰確認

## 必読ドキュメント（優先度順）
1. [必須] 本タスク指示書の「featureファイル全文」セクション — 書き換え後のfeature全文
2. [必須] `src/lib/domain/rules/accusation-rules.ts` — 現在のハードコード定数
3. [必須] `src/lib/services/accusation-service.ts` — AccusationService
4. [必須] `src/lib/services/command-service.ts` — CommandService（YAML読み込み）
5. [必須] `config/commands.yaml` — 現在のコマンド設定
6. [参考] `features/step_definitions/ai_accusation.steps.ts` — 現在のステップ定義
7. [参考] `features/step_definitions/command_system.steps.ts` — 既存ステップ定義

## featureファイル全文

以下の内容で `features/ai_accusation.feature` を上書きすること（人間承認済み）:

```gherkin
# features/ai_accusation.feature
# ステータス: ドラフト v3
#
# US-020のBOTマーク表示・攻撃フローは ai_accusation（告発→BOTマーク付与）と
# bot_system（BOTマーク後の攻撃・撃破）で分担している。
# → 攻撃・撃破シナリオは bot_system.feature を参照
Feature: AI告発（!tell）

  ログイン済みユーザーとして、特定の書き込みに「!tell」を使って「これはAIだ」と
  告発し、その結果がスレッド全体に公開されてほしい。告発の瞬間がスレッド全体の
  イベントになることで、「あいつ絶対AIだろ」「いや人間だよ」というリアルタイムの
  推理ショーが生まれる。告発成功時は告発者にボーナス通貨が付与される。
  告発失敗（対象が人間だった）時は、被告発者に冤罪ボーナスが付与され、
  わざとAIのフリをして告発を誘う戦略も成立する（創発的プレイ）。

  # US-016: AI告発（!tell）全公開の推理ショー
  # US-017: 冤罪ボーナスを狙ったAIのフリ戦略
  # US-020: BOTマーク表示（告発成功→BOTマーク付与の部分）

  # 経済パラメータ: コスト10 / 成功ボーナス20 / 冤罪ボーナス10
  # 設定値は config/commands.yaml に集約

  # ===========================================
  # 告発成功（対象がAIボットだった場合）
  # ===========================================

  Scenario: AI告発に成功すると結果がスレッド全体に公開される
    Given ユーザーの通貨残高が 100 である
    And レス >>5 はAIボットによる書き込みである
    When "!tell >>5" を実行する
    Then 通貨が 10 消費され残高が 90 になる
    And スレッドにシステムメッセージが表示される
    And システムメッセージに告発者のIDが含まれる
    And システムメッセージに "AIでした" が含まれる
    And 告発成功ボーナス 20 が告発者に付与され残高が 110 になる

  Scenario: 告発成功したボットにBOTマークが表示される
    Given レス >>5 のAIボットに対するAI告発が成功した
    Then レス >>5 のボットの表示にBOTマーク🤖が付与される
    And ボットの現在のHP状況が表示される
    And BOTマークはその日の間ずっと表示され続ける

  Scenario: BOTマークがついたボットは書き込みを継続する
    Given AIボット "逆張りマスター" が告発されBOTマークが表示されている
    When ボットの定期実行タイミングが到来する
    Then ボットは通常通り書き込みを行う
    And 書き込みにBOTマークが付いた状態で表示される

  # ===========================================
  # 告発失敗（対象が人間だった場合）
  # ===========================================

  Scenario: AI告発に失敗すると冤罪ボーナスが被告発者に付与される
    Given ユーザーの通貨残高が 100 である
    And レス >>3 は人間ユーザーによる書き込みである
    When "!tell >>3" を実行する
    Then 通貨が 10 消費され残高が 90 になる
    And スレッドにシステムメッセージが表示される
    And システムメッセージに "人間でした" が含まれる
    And 告発者にはボーナスが付与されない
    And 被告発者に冤罪ボーナス 10 が付与される

  # ===========================================
  # 創発的プレイ: AIのフリをして告発を誘う
  # ===========================================

  Scenario: 人間がAIっぽく振る舞い告発を誘って冤罪ボーナスを稼ぐ
    Given 人間ユーザーがAIっぽい文体で書き込んでいる
    And 別のユーザーが "!tell >>3" を実行する
    And レス >>3 は人間の書き込みである
    Then システムメッセージに "人間でした" が含まれる
    And 被告発者に冤罪ボーナス 10 が付与される

  # ===========================================
  # エラーケース
  # ===========================================

  Scenario: 通貨不足でAI告発が実行できない
    Given ユーザーの通貨残高が 5 である
    When "!tell >>5" を実行する
    Then エラーのシステムメッセージ "通貨が不足しています" が表示される
    And 告発は実行されない
    And 通貨残高は 5 のまま変化しない

  Scenario: 自分の書き込みに対してAI告発を試みると拒否される
    Given レス >>7 は自分自身の書き込みである
    When "!tell >>7" を実行する
    Then エラーのシステムメッセージが表示される
    And 告発は実行されない
    And 通貨は消費されない

  Scenario: 同一ユーザーが同一レスに対して再度告発を試みると拒否される
    Given ユーザーがレス >>5 に対して既にAI告発を実行済みである
    When "!tell >>5" を再度実行する
    Then エラーのシステムメッセージ "既に告発済みです" が表示される
    And 告発は実行されない
    And 通貨は消費されない

  Scenario: 存在しないレスに対してAI告発を試みるとエラーになる
    Given レス >>999 は存在しない
    When "!tell >>999" を実行する
    Then エラーのシステムメッセージが表示される
    And 告発は実行されない

  Scenario: システムメッセージに対してAI告発を試みると拒否される
    Given レス >>10 はシステムメッセージである
    When "!tell >>10" を実行する
    Then エラーのシステムメッセージが表示される
    And 告発は実行されない
```

## 出力（変更すべきファイル）

### 1. `features/ai_accusation.feature`
上記featureファイル全文で上書きする。

### 2. `config/commands.yaml`
tell コマンドに hitBonus, falseAccusationBonus を追加し、cost を 10 に変更:
```yaml
tell:
  description: "指定レスをAIだと告発する"
  cost: 10
  targetFormat: ">>postNumber"
  enabled: true
  stealth: false
  hitBonus: 20
  falseAccusationBonus: 10
```

### 3. `src/lib/domain/rules/accusation-rules.ts`
- `ACCUSATION_HIT_BONUS` と `FALSE_ACCUSATION_BONUS` のハードコード定数を**削除**
- `calculateBonus()` に引数としてボーナス値を受け取る形に変更:
  ```typescript
  calculateBonus(isBot: boolean, hitBonus: number, falseAccusationBonus: number): BonusCalculationResult
  ```
- `buildHitSystemMessage()`, `buildMissSystemMessage()` はそのまま（引数で値を受け取る形は変わらない）

### 4. `src/lib/services/command-service.ts`
- CommandConfig 型に `hitBonus?: number`, `falseAccusationBonus?: number` を追加
- AccusationService 生成時にYAML設定値を渡す、または TellHandler 生成時に渡す

### 5. `src/lib/services/accusation-service.ts`
- ボーナス額をコンストラクタまたはメソッド引数で受け取るように変更
- ハードコード値への参照を削除

### 6. `src/lib/services/handlers/tell-handler.ts`
- 必要に応じてボーナス設定値をAccusationServiceに渡す

### 7. ステップ定義の更新
- `features/step_definitions/ai_accusation.steps.ts` — 新しいステップパターンに合わせて全面更新
  - `通貨が {int} 消費され残高が {int} になる`
  - `告発成功ボーナス {int} が告発者に付与され残高が {int} になる`
  - `被告発者に冤罪ボーナス {int} が付与される`
  - `システムメッセージに {string} が含まれる`
  - `システムメッセージに告発者のIDが含まれる`
  - `通貨残高は {int} のまま変化しない`
  - etc.
- `features/step_definitions/command_system.steps.ts` — !tell関連ステップとの重複がないか確認・調整

### 8. 単体テスト更新
- `src/__tests__/lib/domain/rules/accusation-rules.test.ts` — 定数削除に伴う引数変更
- `src/__tests__/lib/services/accusation-service.test.ts` — ボーナス値の受け渡し変更
- `src/lib/services/__tests__/command-service.test.ts` — YAML設定値変更（cost: 50→10等）

## 完了条件
- [ ] ai_accusation.feature が指定内容で上書き済み
- [ ] commands.yaml に hitBonus/falseAccusationBonus 追加、cost: 10
- [ ] accusation-rules.ts からハードコード定数削除
- [ ] YAML設定値がAccusationServiceまで伝播
- [ ] `npx cucumber-js` 全シナリオPASS（既存 + 更新後）
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx tsc --noEmit` エラーなし

## スコープ外
- BOTマーク関連2シナリオの実装（引き続きcucumber.js除外）
- command_system.feature の変更
- bot_system.feature の実装

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- エスカレーション ESC-TASK-080-1 解決後、command_system.feature の3箇所を修正:
  - Background DataTable: `| !tell | 50 |` → `| !tell | 10 |`
  - 通貨消費シナリオ: `通貨が 50 消費される` → `通貨が 10 消費される`、`通貨残高が 50 になる` → `通貨残高が 90 になる`
  - 通貨不足シナリオ: `ユーザーの通貨残高が 10 である` → `ユーザーの通貨残高が 5 である`
- 全テストPASS確認済み

### 進捗ログ
- [完了] ai_accusation.feature 上書き
- [完了] config/commands.yaml 更新（cost: 10, hitBonus: 20, falseAccusationBonus: 10）
- [完了] accusation-rules.ts: ハードコード定数削除、calculateBonus 3引数化
- [完了] accusation-service.ts: AccusationBonusConfig DI導入、DEFAULT_BONUS_CONFIG追加
- [完了] command-service.ts: CommandConfig拡張、AccusationService生成時にYAML値渡し
- [完了] ai_accusation.steps.ts: v3 feature対応で全面書き換え
- [完了] hooks.ts: async Before フック + 告発シナリオ用デフォルトユーザー設定
- [完了] accusation-rules.test.ts: 3引数対応、テスト値20/10に更新
- [完了] accusation-service.test.ts: AccusationBonusConfig対応
- [完了] command-service.test.ts: YAML値・コスト値更新
- [エスカレーション] ESC-TASK-080-1 起票: command_system.feature の cost 不整合

### escalation_resolution

ESC-TASK-080-1 解決: 選択肢Aを採用（人間承認済み）。`features/command_system.feature` を locked_files に追加し、以下の修正を行うこと:
- Background DataTable: `| !tell | 50 |` → `| !tell | 10 |`
- 「コマンド実行に通貨コストが必要な場合は通貨が消費される」シナリオ:
  - `通貨が 50 消費される` → `通貨が 10 消費される`
  - `通貨残高が 50 になる` → `通貨残高が 90 になる`
- 「通貨不足でコマンドが実行できない場合はエラーになる」シナリオ:
  - `ユーザーの通貨残高が 10 である` → `ユーザーの通貨残高が 5 である`

また、incentive.feature の1 FAIL は既存不具合（本タスク起因ではない）。これは無視してよい。

### テスト結果サマリー（最終）
- `npx tsc --noEmit`: PASS（エラーなし）
- `npx vitest run`: 746 tests PASS / 0 fail（22 test files）
- `npx cucumber-js`: 128 passed, 0 failed, 3 pending
  - ai_accusation.feature: 8 executable scenarios 全てPASS
  - command_system.feature: 全シナリオPASS（cost 50→10 修正完了）
  - specialist_browser_compat.feature: 3 scenarios pending（変更前から存在、本タスク対象外）
