# コードレビューレポート: TASK-129

> 対象: Sprint-40 ~ Sprint-43 (194ファイル変更)
> レビュアー: bdd-code-reviewer
> 実施日: 2026-03-17

---

## レビュー対象

### 新規ファイル (5)
- `src/lib/services/bot-strategies/types.ts`
- `src/lib/services/bot-strategies/strategy-resolver.ts`
- `src/lib/services/bot-strategies/content/fixed-message.ts`
- `src/lib/services/bot-strategies/scheduling/fixed-interval.ts`
- `src/lib/services/bot-strategies/behavior/random-thread.ts`

### 大幅変更ファイル (2)
- `src/lib/services/bot-service.ts` (1037行)
- `src/lib/infrastructure/repositories/auth-code-repository.ts` (341行)

### テストファイル (5)
- `src/__tests__/lib/services/bot-strategies/fixed-message.test.ts`
- `src/__tests__/lib/services/bot-strategies/random-thread.test.ts`
- `src/__tests__/lib/services/bot-strategies/fixed-interval.test.ts`
- `src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts`
- `src/__tests__/lib/services/bot-service.test.ts`

### その他 (3)
- `src/lib/infrastructure/repositories/bot-repository.ts`
- `src/lib/infrastructure/repositories/attack-repository.ts`
- `src/app/(web)/mypage/page.tsx`

---

## 指摘事項

### [HIGH-001] 依存方向違反: Strategy 実装が親モジュール (bot-service.ts) をインポートしている

ファイル: `src/lib/services/bot-strategies/strategy-resolver.ts:13`, `src/lib/services/bot-strategies/behavior/random-thread.ts:13`

問題点:
Strategy 実装群 (`bot-strategies/`) が親モジュール `bot-service.ts` から `IThreadRepository` をインポートしている。設計書 (D-08 bot.md) では依存方向を `bot-service.ts -> bot-strategies/types.ts <- bot-strategies/content/*.ts (実装)` と規定しており、Strategy 実装から bot-service への逆依存は循環依存リスクを生む。現時点では TypeScript の `import type` のため実行時循環は発生しないが、将来 bot-service.ts が Strategy 実装を直接 `import` した場合に循環が顕在化する。

```typescript
// 現状 (strategy-resolver.ts:13):
import type { IThreadRepository } from "../bot-service";

// 推奨: IThreadRepository を types.ts に移動するか、独立した型ファイルに切り出す
import type { IThreadRepository } from "./types";
```

修正案: `IThreadRepository` インターフェースを `bot-strategies/types.ts` に移動し、`bot-service.ts` からもそちらを re-export する形にリファクタする。

---

### [HIGH-002] BotProfileReward / BotProfileInternal の型定義が重複している

ファイル: `src/lib/services/bot-service.ts:208-223`, `src/lib/services/bot-strategies/types.ts:45-71`

問題点:
`BotProfileReward` インターフェースが `bot-service.ts` (L208) と `bot-strategies/types.ts` (L45) の両方で同一構造で独立して定義されている。さらに `bot-service.ts` 内部の `BotProfileInternal` は `types.ts` の `BotProfile` とほぼ同一だが v6 拡張フィールド (`content_strategy`, `behavior_type`, `scheduling`) が欠落している。DRY 原則に反し、将来のフィールド追加時に片方の更新漏れが発生するリスクがある。

```typescript
// bot-service.ts:208-223 (内部用型)
interface BotProfileReward {
  base_reward: number;
  daily_bonus: number;
  attack_bonus: number;
}
interface BotProfileInternal {
  hp: number;
  max_hp: number;
  reward: BotProfileReward;
  fixed_messages: string[];
}

// bot-strategies/types.ts:45-71 (公開型) -- 同一構造
export interface BotProfileReward { ... }
export interface BotProfile { ... }
```

修正案: `bot-service.ts` 内部の `BotProfileReward` / `BotProfileInternal` を削除し、`bot-strategies/types.ts` の `BotProfile` / `BotProfileReward` を import して使用する。`getBotProfileForStrategy` の変換処理も不要になる。

---

### [HIGH-003] BotService.selectTargetThread でボット未検出時にダミー Bot オブジェクトを生成している

ファイル: `src/lib/services/bot-service.ts:757-776`

問題点:
`selectTargetThread` メソッドで `botRepository.findById` が null を返した場合、ハードコードされたダミー Bot オブジェクト (L757-776) を生成して Strategy 解決に渡している。同様のパターンが `getNextPostDelay` (L820-839) にも存在する。これは以下の問題を引き起こす:

1. **マジック値**: hp=10, maxHp=10 等のハードコード値が散在している
2. **保守性**: Bot インターフェースにフィールドが追加された場合、2箇所のダミーオブジェクトの更新が必要
3. **意味的な問題**: 存在しないボットIDに対してサイレントに処理を継続してしまう

```typescript
// 問題のコード (L757-776):
const dummyBot = bot ?? {
  id: botId,
  name: "",
  persona: "",
  hp: 10,
  maxHp: 10,
  // ... 16フィールドのハードコード
};
```

修正案: ボットが見つからない場合はエラーをスローする（`executeBotPost` と同様の振る舞い）。ダミー Bot 生成が必要な場合は、テストヘルパーと同様のファクトリ関数を共通化する。

---

### [HIGH-004] BotRepository.incrementColumn のレースコンディション

ファイル: `src/lib/infrastructure/repositories/bot-repository.ts:84-112`

問題点:
`incrementColumn` は SELECT + UPDATE の2ステップで実装されており、楽観的更新を想定しているが、同一ボットに対する同時攻撃（複数ユーザーが同時に `!attack` を実行）時にレースコンディションが発生する可能性がある。コメントに「低頻度のため楽観的更新で十分」とあるが、人気ボットへの同時攻撃は十分に起こり得るシナリオであり、`times_attacked` の値が実際の攻撃回数より少なくカウントされ、撃破報酬の計算が不正確になるリスクがある。

```typescript
// 現状: SELECT + UPDATE (非アトミック)
const current = (row as Record<string, number>)[column];
await supabaseAdmin.from("bots").update({ [column]: current + 1 }).eq("id", botId);

// 推奨: Supabase の RPC / raw SQL で SET column = column + 1 を使用
```

修正案: Supabase の `.rpc()` で PostgreSQL の `UPDATE bots SET times_attacked = times_attacked + 1 WHERE id = $1` を実行する RPC 関数を作成するか、Supabase が対応していれば `.update()` 内でカラム参照式を使用する。

---

### [MEDIUM-001] bot-service.ts のファイルサイズ (1037行)

ファイル: `src/lib/services/bot-service.ts`

問題点:
1037行と大きく、レビューチェックリストの巨大ファイル基準 (800行以上) を超えている。Strategy パターンの導入でロジックの一部は分離されたが、依存インターフェース定義 (L96-189)、型定義 (L50-91)、内部YAML型定義 (L206-223)、定数定義 (L195-234)、ファクトリ関数 (L1020-1036) がサービスクラス本体と混在している。

修正案:
- 依存インターフェース (`IBotRepository`, `IBotPostRepository`, `IAttackRepository`, `IThreadRepository`, `CreatePostFn`) を `bot-service.types.ts` または `bot-strategies/types.ts` に移動する
- 結果型 (`DamageResult`, `BotInfo`, `DailyResetResult`) を独立ファイルに移動する
- `BotProfileReward` / `BotProfileInternal` の重複削除 (HIGH-002 参照)

---

### [MEDIUM-002] createBotService ファクトリ関数の require 使用

ファイル: `src/lib/services/bot-service.ts:1027-1036`

問題点:
`createBotService` ファクトリ関数が `require()` による動的インポートを使用しており、`eslint-disable` コメントで lint を抑制している。TypeScript プロジェクトにおいて `require` は型安全性を損ない、Tree-shaking も阻害する。

```typescript
// 現状 (L1029-1033):
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BotRepository = require("../infrastructure/repositories/bot-repository");
```

修正案: 通常の `import` 文に置き換える。循環参照を避ける目的であれば、ファクトリ関数を別ファイル (`bot-service.factory.ts`) に分離する。

---

### [MEDIUM-003] performDailyReset の N+1 パターン（ループ内の個別 DB 更新）

ファイル: `src/lib/services/bot-service.ts:561-565`, `src/lib/services/bot-service.ts:574-578`

問題点:
`performDailyReset` メソッドで全ボットを取得した後、ループ内で個別に `updateDailyId` (L563) と `incrementSurvivalDays` (L576) を呼び出している。ボットの数が増えると、ボット数 x 2 回の DB 呼び出しが発生する。Sprint-40 で N+1 修正が行われたとタスク指示書に記載があるが、この箇所は改善されていない。

```typescript
// 現状: ボットごとに個別 UPDATE
for (const bot of allBots) {
  const newDailyId = this.generateFakeDailyId();
  await this.botRepository.updateDailyId(bot.id, newDailyId, today);
  idsRegenerated++;
}
```

修正案: `IBotRepository` にバルク更新メソッド (`bulkUpdateDailyIds`, `bulkIncrementSurvivalDays`) を追加し、1回の DB 呼び出しで処理する。ただし偽装IDはボットごとに異なるランダム値のため、バルク INSERT + ON CONFLICT または RPC 関数での対応が必要。ボット数が10体程度の現状では実害は小さいが、Phase 4 でユーザー作成ボットが増加した場合にスケーラビリティの問題が顕在化する。

---

### [MEDIUM-004] FixedMessageContentStrategy がコンストラクタ内でファイルシステム同期読み取りを行っている

ファイル: `src/lib/services/bot-strategies/content/fixed-message.ts:47`

問題点:
`FixedMessageContentStrategy` のコンストラクタで `fs.readFileSync` を使用してYAMLファイルを読み込んでいる。同様に `BotService` のコンストラクタ (L283) でも `fs.readFileSync` を使用している。サーバーサイド (GitHub Actions) 実行のため致命的ではないが、以下の懸念がある:

1. Strategy が `resolveStrategies` で呼ばれるたびに新しいインスタンスが生成され、ファイル読み取りが発生する
2. Edge Runtime や Serverless Functions 環境での実行時に問題になる可能性がある

```typescript
// 現状 (L47):
const yamlContent = fs.readFileSync(yamlPath, "utf-8");
```

修正案: プロファイルデータを `resolveStrategies` の呼び出し元 (BotService コンストラクタ) で一度だけ読み込み、Strategy のコンストラクタに解析済みデータを渡す形にリファクタする。これにより YAML 読み込みが BotService のライフタイムで1回に集約される。

---

### [LOW-001] resolveStrategies の未使用パラメータにアンダースコアプレフィックスが使用されている

ファイル: `src/lib/services/bot-strategies/strategy-resolver.ts:48-49`

問題点:
`resolveStrategies` のパラメータ `_bot` と `_profile` にアンダースコアプレフィックスが付いている。Phase 3/4 向けの拡張ポイントであることは理解できるが、TODO コメントとの二重管理になっている。

```typescript
export function resolveStrategies(
  _bot: Bot,
  _profile: BotProfile | null,
  options: ResolveStrategiesOptions,
): BotStrategies {
```

補足: 現時点では Phase 2 デフォルト解決のみのため、パラメータが未使用なのは設計上正しい。Phase 3 実装時に自然に解消される見込みのため、修正優先度は低い。

---

## 肯定的評価

### Strategy パターンの設計品質

- **インターフェース分離**: 3つの関心事 (Content/Behavior/Scheduling) が明確に分離されており、ISP (Interface Segregation Principle) に適合している
- **型安全性**: `BotAction` の判別共用体 (`post_to_existing` | `create_thread`) は TypeScript の型システムを活用した良い設計
- **拡張性**: Phase 3/4 の Strategy 追加に対して OCP (Open-Closed Principle) に準拠した構造
- **ドキュメント参照**: 全ファイルに設計書 (D-08) の対応セクションへの `See:` 参照が記載されており、トレーサビリティが確保されている

### テストカバレッジ

- 新規 Strategy 実装 3ファイルに対して 4テストファイルが存在し、正常系・異常系・境界値・ランダム性が網羅的にテストされている
- BotService テスト (978行) が全公開メソッドのテストケースを含んでおり、Strategy 委譲後の振る舞い互換性も検証されている
- DI (Dependency Injection) を活用したモック設計が適切

### auth-code-repository.ts

- リファクタ後のコードは責務が明確で、関数ごとのドキュメントも充実している
- `findByWriteToken` / `clearWriteToken` のワンタイムトークンパターンが適切に実装されている
- PGRST116 エラーコードのハンドリングが全 find 系メソッドで一貫している

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 4     | warn      |
| MEDIUM   | 4     | info      |
| LOW      | 1     | note      |

**判定: WARNING** -- マージ前に4件のHIGHな問題を確認してください。

### HIGH 指摘の優先順位:

1. **HIGH-001 (依存方向違反)**: Strategy 実装から bot-service.ts への逆依存は将来の循環依存リスクを生む。`IThreadRepository` を `types.ts` に移動するリファクタが推奨される。
2. **HIGH-002 (型定義重複)**: DRY 原則違反。`BotProfileReward` / `BotProfileInternal` の重複解消は比較的低コストで実施可能。
3. **HIGH-003 (ダミー Bot オブジェクト)**: ハードコードされたダミーオブジェクトの散在は保守性を損なう。ファクトリ関数の共通化またはエラースローに変更を推奨。
4. **HIGH-004 (レースコンディション)**: `incrementColumn` の非アトミック更新は同時攻撃時にデータ不整合を起こす可能性がある。PostgreSQL のアトミック更新への移行を推奨。

### 総評:

Strategy パターンの導入自体は設計書 (D-08) に準拠した質の高い実装であり、SOLID 原則（特に ISP と OCP）を意識した構造になっている。セキュリティ上の問題（ハードコードされた認証情報、SQLインジェクション、XSS等）は検出されなかった。指摘事項はいずれも保守性とスケーラビリティの改善に関するものであり、現時点の機能動作には影響しない。ただし HIGH-001 (依存方向違反) と HIGH-004 (レースコンディション) は Phase 3/4 のスケール時に問題が顕在化する可能性が高いため、早期の対応を推奨する。
