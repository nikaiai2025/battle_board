# ESC-TASK-347-1 対応方針調査

## 1. 報酬計算の仕組み

### 質問1: `baseReward` / `dailyBonus` / `attackBonus` の保持場所

これらの値はボットレコード（DB/InMemory）のフィールドとして保持されて**いない**。

`Bot` エンティティ（`src/lib/domain/models/bot.ts`）には `botProfileKey: string | null` のみが存在し、報酬パラメータ自体は保持しない。

報酬パラメータの解決は `BotService.getRewardParams()` がランタイムに行う:

1. `bot.botProfileKey` を取得
2. `this.botProfiles[botProfileKey]` からプロファイルを参照
3. `profile.reward.{base_reward, daily_bonus, attack_bonus}` を `RewardParams` に変換
4. プロファイル未発見時は `DEFAULT_REWARD_PARAMS`（baseReward:10, dailyBonus:50, attackBonus:5）にフォールバック

`this.botProfiles` のデータソースは `BotService` コンストラクタの第4引数 `botProfilesData` で DI 可能。省略時は `config/bot-profiles.ts` の定数にフォールバックする。

計算式（`elimination-reward.ts`）:
```
reward = baseReward + (survivalDays * dailyBonus) + (timesAttacked * attackBonus)
```

### 質問2: InMemory テスト環境での報酬値の上書き

**可能だが、現在のステップ定義では行っていない。**

`createBotService()` は `botProfilesData` に `undefined` を渡しているため、`config/bot-profiles.ts` のデフォルト設定が使われる。

上書き方法は2つ:
- **(a)** `createBotService()` に `botProfilesData` を DI する（ゼロ報酬プロファイルを含むオブジェクトを渡す）
- **(b)** ボットの `botProfileKey` を `config/bot_profiles.yaml` / `config/bot-profiles.ts` に存在するゼロ報酬プロファイルに設定する

---

## 2. 各選択肢の実現可能性評価

### 選択肢A: `config/bot_profiles.yaml` にゼロ報酬プロファイルを追加

**実現可能性: 高い（ただし影響範囲に注意）**

- `config/bot_profiles.yaml` に `test_zero_reward:` エントリを追加
- `config/bot-profiles.ts` にも同一エントリを追加（同期必須）
- ステップ定義の `createNamedBotWithPost()` で `botProfileKey: "test_zero_reward"` を設定

長所:
- ステップ定義の変更は最小限（botProfileKey の値を変更するだけ）
- ラストボットボーナスは別途対処が必要（後述）

短所:
- テスト専用プロファイルを本番コンフィグに含める点が不潔
- `config/bot_profiles.yaml` と `config/bot-profiles.ts` の2ファイルを同期変更する必要がある
- ラストボットボーナス（+100）は `botProfileKey` と無関係に発生するため、これだけでは不十分

### 選択肢B: ステップ定義内でボットの報酬フィールドを直接0に設定

**実現可能性: 高い（推奨）**

`BotService` のコンストラクタに `botProfilesData` を DI してゼロ���酬プロファイルを注入する。

具体的な実装:
- `createBotService()` / `createAttackHandler()` にゼロ報酬プロファイルを渡す版を作成するか、既存関数にオプション引数を追加
- または、シナリオ5用のボット作成時に `botProfileKey` を既存プロファイルから変更し、`createBotService()` に渡す `botProfilesData` にゼロ報酬エントリを含める

長所:
- 本番コンフィグ（yaml/ts）を変更しない
- テスト内部で完結する

短所:
- `createAttackHandler()` の DI チェーンが `createBotService()` → `BotService` → `botProfilesData` と深い
- ラストボットボーナスの問題は残る

### 選択肢C: ラストボットボーナスが発生しない状況をセットアップ

**実現可能性: 高い（選択肢Bとの併用で完全解決）**

ラストボットボーナスの発火条件は `countLivingBots() === 0`。シナリオ5のセットアップで「攻撃対象にならない別のアクティブボット」を1体追加すれば、ラストボットボーナスを回避できる。

ただし **通常の撃破報酬（+15）は残る** ため、これだけでは不十分。

数値シミュレーション（選択肢C単独、ラストボットボーナスなし、撃破報酬あり）:
| ステップ | 収支 | 残高 |
|---|---|---|
| 開始 | - | 25 |
| >>10 攻撃（ボット撃破）| -5 + 15（報酬）| 35 |
| >>11 攻撃（人間、賠償金）| -5 - 15 | 15 |
| >>12 攻撃（残高15 >= cost5）| 実行される | 25 or 更に高い |

残高が足りるため >>12 は中断されない。**選択肢C単独では不十分**。

### 選択肢D: ステップの検証ロジックを緩い条件に変更

**実現可能性: 低い（非推奨）**

feature ファイルの記述:
```gherkin
Then >>10: 攻撃成功（コスト5、残高20）
And >>11: 人間への攻撃（コスト5 + 賠償金15、残高0）
And >>12: 残高不足で中断
```

問題点:
- `残高20` `残高0` は feature に明記された具体値であり、検証ロジックを緩くすることは feature の意図に反する
- 最も根本的な問題として、**>>12 が「残高不足で中断」にならない**。撃破報酬により残高が回復するため、実際には >>12 の攻撃が成功する。検証ロジックの変更では解決不可能

---

## 3. 推奨する解決策

### 推奨: 選択肢B + 選択肢C の併用

**撃破報酬ゼロ化（B）** と **ラストボットボーナス回避（C）** を組み合わせることで、feature ファイルを変更せずにシナリオ5を PASS させる。

### 実装方針

#### 3.1 ゼロ報酬プロファイルの注入（選択肢B）

`createAttackHandler()` に DI する `BotService` が参照する `botProfilesData` に、ゼロ報酬プロファイルを含める。

最も影響範囲が小さい方法: シナリオ5のボット作成時に `botProfileKey` を特定の値（例: `"__test_zero_reward"`）に設定し、`createAttackHandler()` が生成する `BotService` のプロファイルデータにそのキーのゼロ報酬エントリを含める。

ただし、`createAttackHandler()` は全シナリオで共用されているため、プロファイルデータの追加は他シナリオに影響しない（未参照のキーは無害）。

擬似コード（`bot_system.steps.ts`）:

```typescript
// --- 方式1: createAttackHandler にプロファイルデータ DI オプションを追加 ---

// ゼロ報酬プロファイル定数
const ZERO_REWARD_PROFILES = {
  "__test_zero_reward": {
    hp: 10,
    max_hp: 10,
    reward: { base_reward: 0, daily_bonus: 0, attack_bonus: 0 },
    fixed_messages: [],
  },
};

function createBotServiceWithZeroReward() {
  const { BotService } = require("../../src/lib/services/bot-service");
  // 既存プロファイル + ゼロ報酬プロファイルをマージして DI
  const { botProfilesConfig } = require("../../config/bot-profiles");
  const mergedProfiles = { ...botProfilesConfig, ...ZERO_REWARD_PROFILES };
  return new BotService(
    InMemoryBotRepo,
    InMemoryBotPostRepo,
    InMemoryAttackRepo,
    mergedProfiles,         // botProfilesData を明示的に指定
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    InMemoryDailyEventRepo,
  );
}

function createAttackHandlerWithZeroReward() {
  const { AttackHandler } = require("../../src/lib/services/handlers/attack-handler");
  const CurrencyService = getCurrencyService();
  const botService = createBotServiceWithZeroReward();
  const currencyAdapter = { /* 既存と同じ */ };
  return new AttackHandler(botService, currencyAdapter, InMemoryPostRepo, 5, 10, 3);
}
```

#### 3.2 ラストボットボーナス回避（選択肢C）

シナリオ5の Given ステップ実行後、「攻撃対象にならない非公開のダミーボット」を InMemoryBotRepo に追加する。このボットは `isActive: true` だが、シナリオ内のどのレスにも紐付いていないため攻撃されない。

```typescript
// シナリオ5のセットアップ後に実行（executeMultiAttackCommand の前）
// ラストボットボーナス防止用のダミーボット
InMemoryBotRepo._insert({
  id: crypto.randomUUID(),
  name: "ダミー（ラストボットボーナス防止）",
  persona: "",
  hp: 100,
  maxHp: 100,
  dailyId: "DummyBot",
  dailyIdDate: getTodayJst(),
  isActive: true,        // countLivingBots() で1以上を返す
  isRevealed: false,
  revealedAt: null,
  survivalDays: 0,
  totalPosts: 0,
  accusedCount: 0,
  timesAttacked: 0,
  botProfileKey: null,
  nextPostAt: null,
  eliminatedAt: null,
  eliminatedBy: null,
  createdAt: new Date(),
});
```

#### 3.3 シナリオ5用ボット作成の変更

名前なし版ボット作成ステップ（L2826-2838）の `botProfileKey` を `"__test_zero_reward"` に変更する必要があるが、これは他シナリオにも影響する。

対処法は2つ:
- **(a)** 全シナリオで `botProfileKey: "__test_zero_reward"` を使う（ゼロ報酬が他シナリオの検証に影響しないか確認が必要）
- **(b)** シナリオ5専用のセットアップステップを作り、その中でゼロ報酬ボットを作成する

**(a) の実現可能性**: 名前なしボット（`匿名N` ラベル）を使うシナリオは「範囲内に無効なターゲットがある場合はスキップして続行する」（L325）と「賠償金で途中で残高不足になる」（L346）の2つ。前者は残高検証が `有効ターゲット2件分の攻撃コスト 10 が消費される` で、報酬値に依存しない（消費コストのみ検証）。よって **(a)** で問題ない。

#### 3.4 実装上の注意: createAttackHandler の使い分け

シナリオ5では `createAttackHandlerWithZeroReward()` を使い、他のシナリオでは既存の `createAttackHandler()` を使う必要がある。

`executeMultiAttackCommand()` ヘルパーが内部で `createAttackHandler()` を呼んでいる場合、シナリオ5専用の `executeMultiAttackCommand` 版が必要になる。

代替: `createAttackHandler()` を常にゼロ報酬プロファイル込みで生成しても、`botProfileKey: "荒らし役"` のボットは従来通り「荒らし役」プロファイルの報酬を使うため影響なし。**影響するのは `botProfileKey: "__test_zero_reward"` のボットだけ**。

したがって、`createAttackHandler()` 自体を拡張して常にゼロ報酬プロファイルを含めるのが最もシンプル:

```typescript
function createBotService() {
  const { BotService } = require("../../src/lib/services/bot-service");
  const { botProfilesConfig } = require("../../config/bot-profiles");
  // テスト用ゼロ報酬プロファイルを追加（既存プロファイルには影響しない）
  const profiles = {
    ...botProfilesConfig,
    "__test_zero_reward": {
      hp: 10, max_hp: 10,
      reward: { base_reward: 0, daily_bonus: 0, attack_bonus: 0 },
      fixed_messages: [],
    },
  };
  return new BotService(
    InMemoryBotRepo,
    InMemoryBotPostRepo,
    InMemoryAttackRepo,
    profiles,
    undefined, undefined, undefined, undefined, undefined,
    InMemoryDailyEventRepo,
  );
}
```

この変更は既存のシナリオ1〜4, 6〜9 に影響しない（それらのボットは `botProfileKey: "荒らし役"` のまま）。

#### 3.5 数値検証（B+C 併用時）

| ステップ | 収支 | 残高 |
|---|---|---|
| 開始 | - | 25 |
| >>10 攻撃（ボットHP:10→0、撃破、報酬0） | -5 + 0 | 20 |
| >>11 攻撃（人間、コスト5 + 賠償金15） | -5 - 15 | 0 |
| >>12 攻撃 | 残高0 < cost5 → **中断** | 0 |

feature の期待値と完全に一致する。

---

## 4. まとめ

| 選択肢 | 撃破報酬 | ラストボットボーナス | feature変更 | 推奨 |
|---|---|---|---|---|
| A（yaml にゼロ報酬プロファイル追加） | 解決 | 未解決 | 不要 | -- |
| B（ステップ定義内でDI） | 解決 | 未解決 | 不要 | B+C で推奨 |
| C（ダミーボット追加） | 未解決 | 解決 | 不要 | B+C で推奨 |
| D（検証ロジック緩和） | 未解決 | 未解決 | 不要 | 非推奨 |

**推奨: B + C の併用**

変更対象ファイル: `features/step_definitions/bot_system.steps.ts` のみ

変更内容:
1. `createBotService()` に `botProfilesData` を DI し、`__test_zero_reward` プロファイルを追加
2. 名前なしボット作成（L2667）の `botProfileKey` を `"__test_zero_reward"` に変更
3. シナリオ5の実行前にラストボットボーナス防止用のダミーアクティブボットを追加
