---
task_id: TASK-361
sprint_id: Sprint-140
status: completed
assigned_to: bdd-coding
depends_on: [TASK-360]
created_at: 2026-03-29T23:00:00+09:00
updated_at: 2026-03-29T23:00:00+09:00
locked_files:
  - "src/lib/services/handlers/attack-handler.ts"
  - "src/__tests__/lib/services/handlers/attack-handler.test.ts"
  - "src/lib/services/bot-service.ts"
---

## タスク概要

AttackHandler の複数対象攻撃で発生するサブリクエスト数を大幅に削減する。
監査レポートの短期改善案 S1〜S3 を実装する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md` — §2.3, §4, §5.1 (S1/S2/S3)
2. [必須] `src/lib/services/handlers/attack-handler.ts` — 現行の AttackHandler
3. [必須] `src/lib/services/bot-service.ts` — revealBot, applyDamage, getBotByPostId
4. [参考] `src/__tests__/lib/services/handlers/attack-handler.test.ts` — 既存テスト

## 改修内容

### S1: 事前検証のバッチ化（効果: -25〜27クエリ/6ターゲット）

**現状:**
```typescript
for (const pn of postNumbers) {
  const post = await postRepository.findByThreadIdAndPostNumber(threadId, pn);
  const isBot = await botService.isBot(post.id);
  // ...
}
```

**改善後:**
```typescript
// 1クエリで全レスを一括取得
const posts = await postRepository.findByThreadIdAndPostNumbers(threadId, postNumbers);
// 1クエリで全BOT判定を一括取得
const botPosts = await botPostRepository.findByPostIds(postIds);
```

TASK-360 で追加されたバッチメソッドを使用する。

### S2: BotService 重複 findById 排除（効果: -2〜3クエリ/ターゲット）

**現状:** `getBotByPostId` で取得した botInfo を、`revealBot` と `applyDamage` が再度 `findById` で取得し直す。

**改善:** botInfo を引数として受け渡す。以下のいずれかの方式:

方式A（推奨）: BotService に botInfo を直接受け取るオーバーロードを追加:
```typescript
async revealBotWithInfo(bot: Bot): Promise<void>
async applyDamageWithInfo(bot: Bot, damage: number, ...): Promise<DamageResult>
```

方式B: AttackHandler 側で botInfo をキャッシュし、BotService の既存メソッドはそのまま。

**重要:** 既存の `revealBot(botId)` / `applyDamage(botId, ...)` は削除しない。他の呼び出し元が存在する可能性があるため、新メソッドを追加する形にする。

### S3: 攻撃ループ内の getBalance 削除（効果: -V クエリ）

**現状:** 攻撃実行ループの先頭で毎回 `getBalance` を呼んでいる。

**改善:** ループ開始前に残高を取得し、ローカル変数で追跡する。
```typescript
let localBalance = await currencyService.getBalance(userId);
for (const target of validTargets) {
  if (localBalance < cost) break;
  // debit 後に localBalance を更新
  localBalance -= cost;
  // ...（人間攻撃の賠償金も localBalance から減算）
}
```

## 完了条件
- [x] 事前検証がバッチクエリで実行されている
- [x] revealBot / applyDamage の重複 findById が排除されている
- [x] 攻撃ループ内の getBalance が排除されている
- [x] `npx vitest run` で既存テスト全PASS + 新規テスト追加
- [x] `npx cucumber-js` で回帰なし（特に `bot_system.feature` の攻撃シナリオ）
- [x] テストコマンド: `npx vitest run` && `npx cucumber-js`

## スコープ外
- PostService の改修（TASK-362）
- 中期改善案 M1（バッチBOT操作）— 将来スプリントで対応
- リポジトリバッチメソッドの追加（TASK-360）

## 補足・制約
- **振る舞い変更なし**: これは純粋なパフォーマンス最適化。ユーザーから見た振る舞い（攻撃結果・通知・通貨消費）は一切変わらない
- `bot_system.feature` の攻撃関連シナリオがすべてPASSすることが必須の回帰テスト

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: S1/S2/S3 全改善の実装・テスト完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- TASK-360 で追加されたバッチメソッド (`findByThreadIdAndPostNumbers`, `findByPostIds`) の存在を確認済み
- attack-handler.ts, bot-service.ts, 既存テストの全体構造を把握済み
- S1: `executeMultiTarget` をバッチ化。`findByThreadIdAndPostNumbers` と `getBotsByPostIds` で事前検証を一括化
- S2: `IAttackBotService` に `revealBotWithInfo`/`applyDamageWithInfo`/`getBotsByPostIds` を追加。BotService に実装追加
  - `BotInfo` に `botProfileKey?: string | null` を追加（後方互換）
  - `getBotByPostId` / `getBotsByPostIds` で `botProfileKey` を返すよう変更
- S3: 攻撃ループ内の `getBalance` 呼び出しを排除。ローカル残高追跡に置き換え
  - `executeSingleHumanAttack` 内の `getBalance` も `deductResult.newBalance` に置き換え
- 既存テスト2件を `applyDamage` -> `applyDamageWithInfo` アサーションに更新
- S1/S2/S3 の新規テスト7件を追加

### テスト結果サマリー
- `npx vitest run src/__tests__/lib/services/handlers/attack-handler.test.ts`: 39/39 PASS
- `npx vitest run src/__tests__/lib/services/bot-service.test.ts`: 52/52 PASS
- `npx vitest run` (全体): 2145/2158 PASS (13 FAIL は Discord OAuth 認証テスト関連で本タスクと無関係)
- `npx cucumber-js features/bot_system.feature`: 389/389 PASS (18 pending は UI関連で既存)
- `npx cucumber-js` (全体): 389/389 PASS + 18 pending + 3 undefined (既存)
