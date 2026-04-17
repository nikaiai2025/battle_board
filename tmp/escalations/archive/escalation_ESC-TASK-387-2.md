---
escalation_id: ESC-TASK-387-2
task_id: TASK-387
sprint_id: Sprint-154
severity: medium
status: open
escalated_at: 2026-04-17
assigned_to: orchestrator
---

## 問題の内容

TASK-387 で `deleteEliminatedSingleUseBots()` を導入し `performDailyReset` Step 6 で**撃破済みの tutorial / aori / hiroyuki を物理削除**するようにした結果、`features/command_aori.feature @煽りBOTは日次リセットで復活しない` シナリオの既存 Then ステップが FAIL する。

### 失敗の内訳

```
Scenario: 煽りBOTは日次リセットで復活しない
  Given 煽りBOTが撃破済みである          (PASS)
  When 日付が変更される（JST 0:00）       (PASS — performDailyReset 実行)
  Then 煽りBOTは撃破済みのまま復活しない  (× FAILED)
      AssertionError [ERR_ASSERTION]: 煽りBOTが見つかりません
        at command_aori.steps.ts:720
```

### 根本原因

既存ステップ実装 (`features/step_definitions/command_aori.steps.ts` L714-729):

```typescript
Then(
  "煽りBOTは撃破済みのまま復活しない",
  async function (this: BattleBoardWorld) {
    assert(this.currentBot, "現在のBOTが設定されていません");

    const bot = await InMemoryBotRepo.findById(this.currentBot.id);
    assert(bot, "煽りBOTが見つかりません");   // ← ここで失敗

    // is_active=false のまま（復活していない）
    assert.strictEqual(bot.isActive, false, ...);
  },
);
```

TASK-387 実装前は、aori 撃破済みレコードは日次リセット後も `is_active=false` のまま残留していたため `findById` は bot を返し、`isActive===false` 検証が成立していた。
TASK-387 実装後は、`deleteEliminatedSingleUseBots()` が `botProfileKey='aori'` AND `isActive=false` のレコードを**物理削除**するため、`findById(this.currentBot.id)` は null を返す。

### 設計書 (design.md) の内部矛盾

- §2.2: aori / hiroyuki クリーンアップ拡張を採択（撃破済み物理削除）
- §4.1: 「`command_aori.feature` L110-113 | 既存復活除外ロジックは不変 | **変更要否なし**」

→ §2.2 の振る舞い変更（物理削除）が §4.1 の BDD 影響分析で見落とされている。

## 選択肢と各選択肢の影響

### 選択肢A: BDD step 実装の assertion を "削除 OR isActive=false" に緩める（推奨）

`features/step_definitions/command_aori.steps.ts` L714-729 の assertion を以下に変更:

```typescript
Then(
  "煽りBOTは撃破済みのまま復活しない",
  async function (this: BattleBoardWorld) {
    assert(this.currentBot, "現在のBOTが設定されていません");

    const bot = await InMemoryBotRepo.findById(this.currentBot.id);
    // Sprint-154 TASK-387: 使い切りBOT（aori/hiroyuki/tutorial）は
    // deleteEliminatedSingleUseBots で物理削除される、または is_active=false のまま残る。
    // いずれも「復活していない」と見なす。
    // See: docs/architecture/components/bot.md §2.10 Step 6
    if (bot !== null) {
      assert.strictEqual(bot.isActive, false, "煽りBOTが復活しています");
    }
  },
);
```

- 影響範囲: `command_aori.steps.ts` のみ（1ステップ実装）
- 振る舞い: シナリオ意図「aori は復活しない」を正しく表現する（復活とは `isActive=true` になること）
- リスク: 極めて低い。logical equivalence: `bot is null` も `bot.isActive=false` も両方「復活していない」

### 選択肢B: `deleteEliminatedSingleUseBots()` から aori を除外する（design 再調整）

design §2.2 の「aori 拡張」を撤回し、cleanup 対象を tutorial / hiroyuki のみにする。

- メリット: BDD ステップ変更不要
- デメリット: design §2.2 が却下した「代替案 B（放置）」に後退する。aori の潜在的膨張リスクが残る。TASK-386 設計検証の結論を翻すことになる

### 選択肢C: BDD シナリオ/step の意味を明示的に変更（Scenario 追加）

`command_aori.feature` に新規 Scenario「煽りBOTは日次リセットで使い切りクリーンアップにより削除される」を追加し、既存 Scenario の期待値を「record not found」に変更する。

- メリット: 仕様が feature ファイルに明文化される
- デメリット: **BDDシナリオ変更に該当**（CLAUDE.md 禁止事項第1項）。人間承認ゲートが必要。スプリント完了が遅延する可能性

## 推奨: 選択肢A

理由:
1. BDD シナリオテキスト「煽りBOTは撃破済みのまま復活しない」自体は不変
2. step 実装内の assertion 変更のみで、feature ファイルは未変更
3. 「復活しない」の semantic に合致した assertion へ修正するのは設計意図の正確な実装
4. design §2.2 の「aori 拡張」を尊重できる
5. 振る舞い変更はシステム内部で完結（ユーザーから見た振る舞い不変）

## 関連するfeatureファイル・シナリオタグ

- `features/command_aori.feature` L110-113「煽りBOTは日次リセットで復活しない」
- `features/step_definitions/command_aori.steps.ts` L714-729（修正対象）
- `docs/architecture/components/bot.md` §2.10 Step 6 使い切りBOTクリーンアップ
- `tmp/workers/bdd-architect_TASK-386/design.md` §2.2（aori 拡張）, §4.1（BDD 影響分析、要訂正）

## 現在の状況（参考）

- vitest: 全 120 ファイル 2306 tests PASS
- cucumber-js: 433 scenarios (1 failed, 4 undefined, 18 pending, 410 passed) — 本エスカレーション対象の 1 件のみ FAIL
- 他2件（bot_system.feature 撃破済み復活・生存日数リセット）は in-memory filter の `revivedAt == null` 対応で解決済み

ロック外ファイル `features/step_definitions/command_aori.steps.ts` への修正許可が得られ次第、1 ステップ実装の微修正 → 全 BDD 再実行 → 完了報告に進める。
