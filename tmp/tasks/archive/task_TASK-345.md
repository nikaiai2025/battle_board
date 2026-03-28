---
task_id: TASK-345
sprint_id: Sprint-134
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-28T02:00:00+09:00
updated_at: 2026-03-28T02:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/bot-repository.ts
  - src/lib/services/bot-service.ts
  - features/support/in-memory/bot-repository.ts
  - features/step_definitions/bot_system.steps.ts
---

## タスク概要

ボット日次リセット復活をインカーネーション（転生）モデルに変更する。
現行の UPDATE 方式（同一レコードを書き換え）を廃止し、旧レコード凍結 + 新レコード INSERT 方式にする。

### 背景

現行方式では、復活後のボットが過去日の書き込みと同一 `botId` を共有するため、前日撃破されたレスを翌日攻撃すると「未撃破」扱いになる。これは「毎日が新しい推理ゲームの始まり」という設計意図と矛盾する。

### ゴール

- 撃破済みボットの旧レコードが `is_active = false` のまま永続保持される
- 旧レコードの `bot_posts` 紐付けが維持され、BOTマーク表示・撃破済み判定が正しく動作する
- 復活後のボットは新しい `botId`（UUID）を持ち、旧日の書き込みとは無関係になる

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/bot.md` §6.11 — インカーネーションモデルの設計判断
2. [必須] `docs/architecture/components/bot.md` §2.10 — 日次リセット処理フロー（更新済み）
3. [必須] `docs/specs/bot_state_transitions.yaml` — eliminated → lurking 遷移（更新済み）
4. [必須] `features/bot_system.feature` L448-480 — 日次リセット関連シナリオ
5. [参考] `src/lib/services/bot-service.ts` L726-795 — `performDailyReset()` 現行実装
6. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` L516-561 — `bulkReviveEliminated()` 現行実装
7. [参考] `features/support/in-memory/bot-repository.ts` L437-458 — BDD用インメモリ実装

## 変更対象ファイル

### 1. IBotRepository インターフェース変更 (`src/lib/services/bot-service.ts`)

`bulkReviveEliminated` の戻り値を変更:

```
// Before
bulkReviveEliminated(): Promise<number>;

// After
bulkReviveEliminated(): Promise<Bot[]>;  // 新規作成された Bot レコードの配列
```

理由: `performDailyReset` Step 4.5 で新ボットの ID を知る必要があるため。

### 2. BotRepository 実装変更 (`src/lib/infrastructure/repositories/bot-repository.ts`)

`bulkReviveEliminated()` を UPDATE → INSERT に変更する。

```
処理フロー:
1. SELECT: is_active = false かつ復活対象（tutorial/aori 除外）の全ボットを取得
2. 各ボットに対して:
   a. 旧レコード: そのまま放置（UPDATE しない）
   b. 新レコード INSERT:
      - コピーするフィールド: name, persona, bot_profile_key, max_hp
      - リセットするフィールド: hp=max_hp, is_active=true, is_revealed=false,
        survival_days=0, total_posts=0, accused_count=0, times_attacked=0,
        eliminated_at=NULL, eliminated_by=NULL, grass_count=0
      - 新規生成: daily_id（ランダム偽装ID）, daily_id_date=当日JST
      - next_post_at: NULL（Step 4.5 で設定される）
3. return: 新規作成された Bot[] を返す
```

注意: `BotRepository.create()` が既に存在するので、内部で再利用可能。

### 3. BotService.performDailyReset() 変更 (`src/lib/services/bot-service.ts`)

**Step 1（偽装ID再生成）**: `findAll()` で全ボット取得 → 変更不要。凍結ボットの daily_id を更新しても無害。

**Step 4（復活処理）**: 戻り値の型変更に対応。

```typescript
// Before
const botsRevived = await this.botRepository.bulkReviveEliminated();

// After
const revivedBots = await this.botRepository.bulkReviveEliminated();
const botsRevived = revivedBots.length;
```

**Step 4.5（next_post_at 再設定）**: 新ボット ID を直接使う。

```typescript
// Before: findAll() で再取得し、旧 allBots と比較して復活ボットを特定
// After: bulkReviveEliminated() の戻り値をそのまま使用
for (const bot of revivedBots) {
    const delayMinutes = this.getNextPostDelay(bot.id, bot.botProfileKey);
    const nextPostAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    await this.botRepository.updateNextPostAt(bot.id, nextPostAt);
}
```

### 4. In-memory BotRepository 変更 (`features/support/in-memory/bot-repository.ts`)

`bulkReviveEliminated()` を本番と同じインカーネーション方式にする。

```
処理フロー:
1. store 内の is_active=false かつ復活対象のボットを探す
2. 各ボットに対して:
   a. 旧レコード: store 内にそのまま残す（変更しない）
   b. 新レコード: 新 UUID を生成し、必要フィールドをコピーして store に push
3. return: 新規作成した Bot[] を返す
```

### 5. BDD ステップ定義の修正 (`features/step_definitions/bot_system.steps.ts`)

復活後のボット状態を検証するステップが `this.currentBot.id`（旧ボットの ID）で findById している。
インカーネーションモデルでは新ボットは別 ID を持つため、検索方法を変更する必要がある。

影響するステップ（推定）:
- L2078 `"ボットの状態が「潜伏中」に復帰する"` — `findById(this.currentBot.id)` → 旧ボット（凍結済み）がヒットする
- L2094付近 `"HPが初期値（10）に戻る"` — 同上
- L2194 `"翌日に復活する"` 内の後続アサーション — 同上

修正方針: `performDailyReset()` 呼び出し後、`this.currentBot` を新世代のボットに更新する。

```typescript
// 例: performDailyReset 後に新世代ボットを取得
const allBots = await InMemoryBotRepo.findAll();
const newIncarnation = allBots.find(
    (b) => b.isActive && b.name === this.currentBot!.name && b.id !== this.currentBot!.id,
);
if (newIncarnation) {
    this.currentBot = newIncarnation;
}
```

### 6. 既存テストのモック修正

`src/lib/services/__tests__/admin-service.test.ts` の `bulkReviveEliminated` モックを `Bot[]` を返すように変更する。

## 変更しないもの

- AttackHandler（`isBot` → `getBotByPostId` → `isActive` チェックは変更不要）
- BOTマーク表示ロジック（旧 bot レコード参照のまま正しく動作）
- `features/bot_system.feature`（振る舞いは変わらない。BDD シナリオの変更は不要）
- `docs/` 配下の設計書（本タスク開始前に更新済み）

## 完了条件

- [ ] `npx vitest run` で全テスト PASS（既存の失敗を増やさない）
- [ ] `npx cucumber-js --tags "@翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する or @撃破済みボットは翌日にHP初期値で復活する or @撃破されたボットの生存日数は撃破時にリセットされる or @日次リセットで同一ボットへの攻撃制限が解除される"` で全シナリオ PASS
- [ ] `npx cucumber-js` 全体で新たな failed が増えていない

## 検証の着眼点

実装完了後、以下の点を重点的にテストで確認すること:

1. **旧レスへの攻撃が撃破済みになること**: 旧 botId → `is_active = false` → 「撃破済み」判定
2. **新世代ボットが正常に活動すること**: 新 botId → `is_active = true` → 投稿 cron 対象
3. **旧レコードが不変であること**: `bulkReviveEliminated` 後、旧レコードの全フィールドが変化していない

## 作業ログ

### チェックポイント
- 作業開始: 2026-03-28
- 現在の状態: 実装開始前。必読ドキュメントと既存コード確認済み
- 次にすべきこと: 1. IBotRepository.bulkReviveEliminated 戻り値変更 → 2. BotRepository 実装変更 → 3. In-memory 実装変更 → 4. bot-service.ts 変更 → 5. ステップ定義変更 → 6. admin-service.test.ts モック修正

### 進捗ログ
- [x] src/lib/services/bot-service.ts: IBotRepository.bulkReviveEliminated 戻り値 number -> Bot[]
- [x] src/lib/services/bot-service.ts: performDailyReset() 変更（Step 4.5 の再取得ロジックを削除し revivedBots を直接使用）
- [x] src/lib/infrastructure/repositories/bot-repository.ts: bulkReviveEliminated UPDATE→INSERT（インカーネーションモデル）
- [x] features/support/in-memory/bot-repository.ts: bulkReviveEliminated インカーネーション方式
- [x] features/step_definitions/bot_system.steps.ts: 新世代ボットID追跡（「日付が変更される」「翌日に復活する」両ステップで修正）
- [x] src/lib/services/__tests__/admin-service.test.ts: モック修正（mockResolvedValue([])）
- [x] src/lib/services/__tests__/bot-service.test.ts: モック修正（Bot[] を返すよう変更）
- [x] src/lib/services/__tests__/bot-service-scheduling.test.ts: モック修正（2回目findAll削除、新UUID使用）
- [x] src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts: UPDATE→INSERT に合わせてテスト書き直し

### テスト結果サマリー
- vitest: 4 files failed（変更前と同数）、2020 passed（変更前 2007 から 13 件増加）
  - 失敗は registration-service.test.ts、auth/callback/route.test.ts 等の既存失敗（今回の変更と無関係）
- BDD（npx cucumber-js）: 0 failed、354 passed（変更前 353 から 1 件増加）
