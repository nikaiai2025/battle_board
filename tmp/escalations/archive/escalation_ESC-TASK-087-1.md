---
escalation_id: ESC-TASK-087-1
task_id: TASK-087
status: open
created_at: 2026-03-16T20:10:00+09:00
---

# エスカレーション: locked_files 外ファイルの変更許可を求める

## 問題の内容

TASK-087 の作業において、`AccusationBonusConfig` から `hitBonus`・`falseAccusationBonus` を削除すると、**locked_files に含まれない以下のファイル**でコンパイルエラーまたはテスト不整合が発生する。

### 影響ファイル

#### 1. `src/lib/services/command-service.ts`（locked_files 外）

```typescript
// 206行目付近
const bonusConfig: AccusationBonusConfig = {
    hitBonus: tellConfig?.hitBonus ?? 20,          // 削除対象フィールドを参照
    falseAccusationBonus: tellConfig?.falseAccusationBonus ?? 10, // 同上
    cost: tellConfig?.cost ?? 10,
};
```

また `CommandConfig` インターフェース（118-122行）にも `hitBonus?`・`falseAccusationBonus?` フィールドが定義されている。

#### 2. `src/lib/services/__tests__/command-service.test.ts`（locked_files 外）

YAML設定の定数に `hitBonus: 20` / `falseAccusationBonus: 10` が含まれる（63-64行、82-83行）。

#### 3. `src/lib/services/__tests__/currency-service.test.ts`（locked_files 外）

`CreditReason` の網羅テストに `'accusation_hit'`・`'false_accusation_bonus'` が含まれる（103-104行）。これらは `currency.ts` から削除する対象。

## 選択肢と影響

### A: locked_files を拡張して 3 ファイルを追加し、変更を許可する（推奨）

**対象追加ファイル:**
- `src/lib/services/command-service.ts`
- `src/lib/services/__tests__/command-service.test.ts`
- `src/lib/services/__tests__/currency-service.test.ts`

**変更内容:**
- `command-service.ts`: `CommandConfig.hitBonus?`・`falseAccusationBonus?` を削除。`AccusationBonusConfig` の構築箇所で `hitBonus`・`falseAccusationBonus` の参照を削除。`AccusationBonusConfig` が `cost` のみになるため、`bonusConfig` の渡し方を整理。
- `command-service.test.ts`: YAMLテスト定数から `hitBonus`・`falseAccusationBonus` を削除。
- `currency-service.test.ts`: `CreditReason` の網羅テストから `'accusation_hit'`・`'false_accusation_bonus'` を削除。

**影響:** locked_files 外への変更だが、内部整合性の修正であり、ユーザーから見た振る舞いは変わらない。

### B: AccusationBonusConfig に hitBonus/falseAccusationBonus を残し、常に 0 として扱う

`AccusationBonusConfig` のフィールドを残したまま、`accusation-service.ts` 内でボーナス付与をスキップする。

**影響:**
- command-service.ts の変更が不要になる
- ただし、タスク指示書の完了条件「`AccusationBonusConfig` から `hitBonus` / `falseAccusationBonus` が削除されていること」を満たせない
- 将来的なコードの混乱を招く（フィールドはあるが使われない）

### C: command-service.ts 側の hitBonus/falseAccusationBonus を yaml-optional として残す

YAML の設定として `hitBonus?` を optional のまま維持し、`AccusationBonusConfig` にも残す。削除するのは実際のボーナス付与処理だけにする。

**影響:**
- 選択肢 B と同様、完了条件を満たせない

## 推奨

**選択肢 A** が仕様整合性・コード品質の観点で最善。変更内容はユーザーから見た振る舞いに影響しない内部リファクタリング。

## 関連

- featureファイル: `features/ai_accusation.feature` @告発成功・失敗シナリオ
- タスク指示書: `tmp/tasks/task_TASK-087.md`
