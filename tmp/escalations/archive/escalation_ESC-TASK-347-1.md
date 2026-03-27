---
escalation_id: ESC-TASK-347-1
task_id: TASK-347
status: open
created_at: 2026-03-28T14:00:00+09:00
---

## 問題の内容

`features/bot_system.feature` のシナリオ5「賠償金で途中で残高不足になると残りの攻撃が中断される」が、仕様実装の不整合により PASS できない。

### 根本原因

Feature spec はボット撃破時に「撃破報酬（elimination reward）」が発生しないことを前提に書かれているが、実際の `AttackHandler.execute()` / `BotService.applyDamage()` はボット撃破時に以下の通貨クレジットを発生させる:

- **撃破報酬**: `baseReward(10) + survivalDays(0)*dailyBonus(50) + timesAttacked(1)*attackBonus(5) = 15` (荒らし役プロファイル)
- **ラストボットボーナス**: `+100` (当日の全BOTが撃破されたとき)

### 失敗シナリオの詳細

```
Scenario: 賠償金で途中で残高不足になると残りの攻撃が中断される
  Given ボット（HP:10）のレス >>10 がスレッドに存在する
  And レス >>11 は人間ユーザーの書き込みである
  And ボット（HP:10）のレス >>12 がスレッドに存在する
  And ユーザーの通貨残高が 25 である
  When ユーザーが "!attack >>10-12" を含む書き込みを投稿する
  Then >>10: 攻撃成功（コスト5、残高20）  ← 「残高が20以下」アサーション FAIL
  And >>11: 人間への攻撃（コスト5 + 賠償金15、残高0）
  And >>12: 残高不足で中断
```

**Feature spec が想定している資金フロー**（報酬なし）:
| ステップ | 収支 | 残高 |
|---|---|---|
| 開始 | - | 25 |
| >>10 攻撃（ボット撃破） | -5 | 20 |
| >>11 攻撃（人間、賠償金） | -5, -15 = -20 | 0 |
| >>12 攻撃（残高不足） | 中断 | 0 |

**実際の資金フロー**（報酬あり）:
| ステップ | 収支 | 残高 |
|---|---|---|
| 開始 | - | 25 |
| >>10 攻撃（ボット撃破）| -5 (cost) + 15 (reward) | 35 |
| >>11 攻撃（人間、賠償金） | -5, -15 = -20 | 15 |
| >>12 攻撃（残高15>=cost5）| **実行される** -5 + 15 (reward) + 100 (last_bot_bonus) | 125 |

実際には >>12 は中断されず実行され、最終残高は 125 になる。

### 影響ファイル

- `features/bot_system.feature` L346-355（シナリオ5）
- `src/lib/services/handlers/attack-handler.ts`（executeSingleBotAttack - 報酬付与ロジック）
- `src/lib/services/bot-service.ts`（applyDamage - 報酬計算）

## 選択肢

### 選択肢 A: Feature spec を修正する

**内容**: `features/bot_system.feature` シナリオ5を、実際の報酬システムを考慮した数値に更新する。

**修正例**:
```gherkin
And ユーザーの通貨残高が 25 である
# 実際の残高フロー（報酬込み）:
# >>10: -5(cost) + 15(reward) = 残高35
# >>11: -5(cost) - 15(compensation) = 残高15
# >>12: 残高15 >= cost5 → 実行, -5 + 15(reward) + 100(last_bot_bonus) = 残高125
```

このシナリオが「途中で残高不足になる」ことを示すには、初期残高や報酬が0になる条件を設定する必要がある。

**影響**: feature ファイルは人間が管理する正本。変更には人間の承認が必要。

### 選択肢 B: 専用テスト用ボットプロファイル `test_zero_reward` を追加する

**内容**: `config/bot_profiles.yaml` に `base_reward: 0, daily_bonus: 0, attack_bonus: 0` のプロファイルを追加し、範囲攻撃テスト用ボットに使用する。

**制約**: `config/bot_profiles.yaml` は locked_files に含まれていない。要確認。

### 選択肢 C: AttackHandler の rangeAttack フローで報酬付与を後処理に変更する

**内容**: 範囲攻撃の結果を集約した後、最後にまとめて報酬を付与する実装変更。ただし仕様として「各攻撃後に即座に報酬付与」が前提なら変更不可。

**影響**: `src/lib/services/handlers/attack-handler.ts` の変更が必要（locked_files 外）。

## 推奨選択肢

**選択肢 A（Feature spec 修正）を推奨**。

「賠償金で途中で残高不足になる」という振る舞いのシナリオを維持するには:
- 初期残高を `5` にする（cost=5 のみ）: >>10 攻撃後に残高 = 5-5+15 = 15 >= 5 → 中断できない
- 撃破報酬を 0 にする（選択肢 B）か、initial balance をさらに低くする

最も仕様の意図を正確に反映するには、人間が「このシナリオでは報酬を考慮した上での中断ケースを示す」という意図で初期残高を決定するべき。

例: 初期残高 = 20 の場合:
- >>10: -5 + 15 = 30
- >>11: -5 -15 = 10
- >>12: 10 >= 5 → 実行

報酬が高い限り、賠償金だけでは中断させることが難しい。報酬 0 のボット（選択肢 B）が現実的。

## 関連するfeatureファイル・シナリオタグ

- `features/bot_system.feature` L346 `Scenario: 賠償金で途中で残高不足になると残りの攻撃が中断される`
- 関連: `features/bot_system.feature` L280-394（複数ターゲット攻撃セクション全体）
