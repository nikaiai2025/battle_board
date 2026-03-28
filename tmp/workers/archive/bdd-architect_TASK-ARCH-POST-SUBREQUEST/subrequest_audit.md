# PostService.createPost サブリクエスト消費量分析

調査日: 2026-03-29
対象エラー: `Too many subrequests by single Worker invocation`（2026-03-27検出）

---

## 1. サブリクエストマップ

`PostService.createPost()` の各ステップで発生する Supabase クエリ（= CF Workers サブリクエスト）を列挙する。
各リポジトリ関数は 1 Supabase クエリ = 1 サブリクエストとしてカウントする。

### 1.1 ベースフロー（コマンドなし・人間書き込み）

| Step | 処理 | DB呼び出し | 回数 | 条件 |
|---|---|---|---|---|
| 0 | `ThreadRepository.findById` | 1 | 固定 | 常時 |
| 0b | `AuthService.isIpBanned` → `IpBanRepository.isBanned` | 1 | 固定 | `!isBotWrite` |
| 2 | `AuthService.verifyEdgeToken` → `EdgeTokenRepository.findByToken` + `UserRepository.findById` | 2 | 固定 | `!isBotWrite` かつ edgeToken != null |
| 2b | `AuthService.isUserBanned` → `UserRepository.findById` | 1 | 固定 | `!isBotWrite` かつ userId あり |
| 3 | `UserRepository.findById` | 1 | 固定 | userId あり かつ `!isBotWrite` |
| 3b | `UserRepository.updateLastIpHash` | 1 | 固定 | `!isBotWrite` かつ userId あり |
| 4.5a | `PostRepository.countByAuthorId` | 1 | 固定 | 初回書き込み検出（`!isSystemMessage && !isBotWrite`） |
| 4.5b | `CurrencyService.credit` → `CurrencyRepository.credit` | 1 | 条件付き | postCount === 0 のときのみ |
| 7(pre) | `PostRepository.findByThreadId` | 1 | 固定 | アンカー解析用（アンカーがある場合） |
| 7 | `IncentiveLogRepository.findByUserIdAndDate` | 1 | 固定 | Incentive sync phase |
| 7 | `UserRepository.findById` | 1 | 固定 | Incentive sync phase |
| 7-1 | daily_login: `IncentiveLogRepository.create` + `CurrencyService.credit` | 2 | 条件付き | 当日初書き込み |
| 7-3 | reply: `PostRepository.findById` + `IncentiveLogRepository.findByUserIdAndDate` | 1~2 | 条件付き | アンカーあり |
| 7-3b | reply付与: `IncentiveLogRepository.create` + `CurrencyService.credit` | 2 | 条件付き | reply ボーナス発火 |
| 7-4 | new_thread_join: `PostRepository.findByThreadId` + `ThreadRepository.findById` | 1~2 | 条件付き | スレッド初参加判定 |
| 7-4b | new_thread_join付与: `IncentiveLogRepository.create` + `CurrencyService.credit` | 2 | 条件付き | ボーナス発火 |
| 7-5 | streak: `UserRepository.updateStreak` + `IncentiveLogRepository.create` + `CurrencyService.credit` | 1~3 | 条件付き | ストリーク更新・ボーナス発火 |
| 9 | `PostRepository.createWithAtomicNumber` (RPC) | 1 | 固定 | 常時 |
| 9a | `PendingTutorialRepository.create` | 1 | 条件付き | welcomeMessagePending |
| 9b | **再帰 `createPost`** (independentMessage) | **N** | 条件付き | 撃破通知/調査結果あり |
| 9c | **再帰 `createPost`** (lastBotBonusNotice) | **N** | 条件付き | ラストボットボーナス |
| 9d-1 | milestone_post: `IncentiveLogRepository.create` | 1 | 条件付き | キリ番 |
| 9d-2 | milestone_post: `CurrencyService.credit` | 1 | 条件付き | キリ番ボーナス発火 |
| 10 | `ThreadRepository.incrementPostCount` | 1 | 固定 | 常時 |
| 10 | `ThreadRepository.updateLastPostAt` | 1 | 固定 | 常時 |
| 10b | `ThreadRepository.wakeThread` | 1 | 条件付き | 休眠スレッドへの書き込み |
| 10b | `ThreadRepository.countActiveThreads` | 1 | 固定 | 常時 |
| 10b | `ThreadRepository.demoteOldestActiveThread` | 1 | 条件付き | activeCount > 50 |
| 11-pre | `PostRepository.findByThreadId` | 1 | 固定 | Incentive deferred phase |
| 11-pre | `ThreadRepository.findById` | 1 | 固定 | Incentive deferred phase |
| 11-7 | hot_post: `IncentiveLogRepository.findByUserIdAndDate` | 1 | 条件付き | アンカーあり |
| 11-7b | hot_post付与: `IncentiveLogRepository.create` + `CurrencyService.credit` | 2 | 条件付き | ボーナス発火 |
| 11-8 | thread_revival: `IncentiveLogRepository.findByUserIdAndDate` | 1 | 条件付き | 復興候補あり |
| 11-8b | thread_revival付与: `IncentiveLogRepository.create` + `CurrencyService.credit` | 2 | 条件付き | ボーナス発火 |
| 11-9 | thread_growth: `IncentiveLogRepository.findByUserIdAndDate` | 1 | 条件付き | growthBonus > 0 |
| 11-9b | thread_growth付与: `IncentiveLogRepository.create` + `CurrencyService.credit` | 2 | 条件付き | ボーナス発火 |
| 11.5 | **再帰 `createPost`** (welcomeMessage) | **N** | 条件付き | 初回書き込み時 |

### 1.2 ベースフロー合計（コマンドなし・典型的な人間書き込み）

最小（BOT書き込み・isSystemMessage=true の再帰呼び出し）:
- Step 0: findById = 1
- Step 9: createWithAtomicNumber = 1
- Step 10: incrementPostCount + updateLastPostAt = 2
- Step 10b: countActiveThreads = 1
- **合計: 5**

典型（人間・認証済み・コマンドなし・アンカーなし・初回以外）:
- Step 0~3b: 7 (findById + isIpBanned + verifyEdgeToken(2) + isUserBanned + findById + updateLastIpHash)
- Step 4.5: 1 (countByAuthorId)
- Step 7 sync: 2~10 (findByUserIdAndDate + findById + daily_login(0~2) + streak(0~3) + new_thread_join(0~4))
- Step 9: 1
- Step 10~10b: 3~5
- Step 11 deferred: 2~8 (findByThreadId + findById + hot_post(0~2) + revival(0~2) + growth(0~2))
- **合計: 約 16~32**

### 1.3 再帰呼び出し（isSystemMessage=true）のコスト

再帰 createPost は `isBotWrite=true, isSystemMessage=true` で呼ばれるため:
- Step 0: findById = 1 ... isPinned チェック
- Step 0b: スキップ (isBotWrite)
- Step 1: バリデーション（DBなし）
- Step 2: スキップ (isBotWrite → authenticated=true 即返)
- Step 2b~3b: スキップ (isBotWrite)
- Step 4.5: スキップ (isSystemMessage)
- Step 5: スキップ (isSystemMessage)
- Step 7: スキップ (isSystemMessage)
- Step 9: createWithAtomicNumber = 1
- Step 9a~9d: スキップ (isSystemMessage)
- Step 10: incrementPostCount + updateLastPostAt = 2
- Step 10b: countActiveThreads = 1 + (条件付き: wakeThread 0~1, demote 0~1)
- Step 11: スキップ (isSystemMessage)
- Step 11.5: スキップ (isSystemMessage なので welcomeMessagePending=false)
- **合計: 5~7 / 回**

---

## 2. コマンド別コスト表

### 2.1 CommandService 共通処理

| 処理 | DB呼び出し | 条件 |
|---|---|---|
| `>>N` 解決 (PostNumberResolver) | N個の `findByThreadIdAndPostNumber` | args 内の `>>N` 個数分。**N依存** |
| 通貨残高チェック | `CurrencyRepository.getBalance` = 1 | cost > 0 かつ !isBotGiver |
| 通貨消費 (共通debit) | `CurrencyRepository.deduct` = 1 | cost > 0 かつ !skipDebit (attack以外) |

PostNumberResolver は各 `>>N` 引数ごとに 1 クエリ。通常コマンドは引数 0~1 個 = 0~1 クエリ。

### 2.2 各ハンドラの DB 呼び出し

| コマンド | ハンドラ | 固定DB呼び出し | N依存呼び出し | 備考 |
|---|---|---|---|---|
| `!tell` | TellHandler (AccusationService) | 3~5 | - | BOT判定+告発処理 |
| `!attack` 単体 | AttackHandler.executeSingleTarget | 4~10 | - | 後述 §2.3 |
| `!attack` 複数 | AttackHandler.executeMultiTarget | 2+α | **T個のターゲットループ** | 後述 §2.3 |
| `!w` | GrassHandler | 2~3 | - | findById + grassCount + insert |
| `!omikuji` | OmikujiHandler | 0~1 | - | 既出チェック |
| `!iamsystem` | IamsystemHandler | 0 | - | 純粋処理 |
| `!abeshinzo` | AbeshinzoHandler | 0 | - | 純粋処理 |
| `!hissi` | HissiHandler | 2~3 | - | findByAuthorIdAndDate + findById |
| `!kinou` | KinouHandler | 2~3 | - | findByAuthorIdAndDate + findById |
| `!livingbot` | LivingBotHandler | 1~3 | - | countLivingBots (最適化済み) |
| `!aori` | AoriHandler | 1~2 | - | pending INSERT + findById |
| `!newspaper` | NewspaperHandler | 1 | - | pending INSERT |
| `!copipe` | CopipeHandler | 1~2 | - | findRandom |
| `!hiroyuki` | HiroyukiHandler | 1~2 | - | findById + pending INSERT |

### 2.3 AttackHandler 詳細分析

#### 単体攻撃（`!attack >>5`）

CommandService 共通:
- PostNumberResolver: `findByThreadIdAndPostNumber` = 1
- 通貨残高チェック: `getBalance` = 1 (CommandService側。attackはskipDebit)

AttackHandler.executeSingleTarget:
1. `postRepository.findById` = 1 (対象レス存在チェック)
2. `botService.isBot` → `botPostRepository.findByPostId` = 1

フローB（対象がBOT）:
3. `botService.getBotByPostId` → `botPostRepository.findByPostId` + `botRepository.findById` = 2
4. `botService.canAttackToday` → `attackRepository.findByAttackerAndBotAndDate` = 1
5. `currencyService.debit` = 1
6. `botService.revealBot` → `botRepository.findById` + (条件付き) `botRepository.reveal` = 1~2
7. `botService.applyDamage` → `botRepository.findById` + `incrementTimesAttacked` + `updateHp` (+ 条件付き `eliminate`) = 3~4
8. `botService.recordAttack` → `attackRepository.create` = 1
9. (撃破時) `currencyService.credit` = 1
10. (撃破時) `botService.checkLastBotBonus` → `countLivingBots` + (条件付き) `existsForToday` + `create` = 1~3

**単体BOT攻撃（非撃破）: CommandService(2) + Handler(10~11) = 12~13**
**単体BOT攻撃（撃破）: CommandService(2) + Handler(12~16) = 14~18**
**単体BOT攻撃（撃破+ラストボットボーナス）: 16~20**

フローC（対象が人間）:
3. `currencyService.debit` = 1
4. `currencyService.getBalance` = 1 (賠償金計算用)
5. `currencyService.debit` = 1 (賠償金)
6. `currencyService.credit` = 1 (被攻撃者へ)

**単体人間攻撃: CommandService(2) + isBot(1) + findById(1) + FlowC(4) = 8**

#### 複数ターゲット攻撃（`!attack >>10-15`, 6ターゲット）

CommandService 共通:
- PostNumberResolver: 引数が `>>10-15` 形式のため**UUID解決されずそのまま渡される** = 0
  (isMultiTargetFormat により AttackHandler 内部でパースされる)
- 通貨残高チェック: `getBalance` = 1

**事前検証フェーズ（preValidateTarget）: ターゲットごとにループ**

各ターゲット (T) に対して:
1. `postRepository.findByThreadIdAndPostNumber` = 1
2. `botService.isBot` → `botPostRepository.findByPostId` = 1
3. (BOTの場合) `botService.getBotByPostId` → findByPostId + findById = 2
4. (BOTの場合) `botService.canAttackToday` → findByAttackerAndBotAndDate = 1

**事前検証: T * (2~5) クエリ**
- BOTターゲット: 5 クエリ/体
- 人間ターゲット: 2 クエリ/体

**残高チェック**: `getBalance` = 1

**攻撃実行フェーズ: 有効ターゲットごとにループ**

各有効ターゲット (V) に対して:
1. `currencyService.getBalance` = 1 (ループ先頭の残高チェック)
2. (BOT) `executeSingleBotAttack`: debit(1) + revealBot(1~2) + applyDamage(3~4) + recordAttack(1) + (撃破時: credit(1) + checkLastBotBonus(1~3)) = 6~12
3. (人間) `executeSingleHumanAttack`: debit(1) + getBalance(1) + debit(1) + credit(1) = 4

**攻撃実行: V * (5~13) クエリ**

---

## 3. ワーストケース計算

### 3.1 シナリオ: `!attack >>10-15`（6ターゲット・全BOT・全撃破・ラストボットボーナス）

#### A. ベースフロー（createPost 本体）

| ステップ | クエリ数 |
|---|---|
| Step 0~3b（認証・ユーザー情報） | 7 |
| Step 4.5（初回チェック） | 1 |
| Step 5: CommandService共通 | 1 (getBalance) |
| Step 5: AttackHandler 事前検証 (6 BOT) | 6 * 5 = **30** |
| Step 5: AttackHandler 残高チェック | 1 |
| Step 5: AttackHandler 攻撃実行 (6 BOT全撃破) | 6 * (1 + 12) = **78** |
| Step 5: うち最後の1体でラストボットボーナス | +3 (countLivingBots + existsForToday + create) |
| Step 7 sync（Incentive Phase 1） | 2~10 |
| Step 8（純粋処理） | 0 |
| Step 9（原子INSERT） | 1 |
| **小計 A** | **約 124~132** |

#### B. 再帰呼び出し

Step 9b: eliminationNotice (6回分を結合して1回の独立レス):
- 1回の再帰createPost = **5~7**

Step 9c: lastBotBonusNotice:
- 1回の再帰createPost = **5~7**

Step 11.5: welcomeMessage（初回書き込みの場合のみ）:
- 1回の再帰createPost = 5~7（通常は発生しない）

**小計 B: 10~14** (eliminationNotice + lastBotBonusNotice)

#### C. 後続処理

| ステップ | クエリ数 |
|---|---|
| Step 9d（milestone_post） | 0~2 |
| Step 10~10b（スレッド更新・休眠管理） | 3~5 |
| Step 11 deferred（Incentive Phase 2） | 2~8 |
| **小計 C** | **5~15** |

#### 合計

| 区分 | クエリ数 |
|---|---|
| A: ベースフロー | 124~132 |
| B: 再帰呼び出し | 10~14 |
| C: 後続処理 | 5~15 |
| **ワーストケース合計** | **約 139~161** |

### 3.2 CF Workers サブリクエスト上限との比較

| プラン | 上限 | ワーストケース | 余裕度 |
|---|---|---|---|
| Free | 50 | 139~161 | **超過（約3倍）** |
| Paid (Bundled) | 1000 | 139~161 | 余裕あり |

**注**: 現在の CF Workers プランが Paid であればワーストケースでも上限に達しない。
ただし、エラーログに `Too many subrequests` が出ているということは、実際の環境で上限に到達している。
考えられる原因:

1. **Free プランで運用している場合**: 50 上限。コマンドなしの通常書き込み（16~32クエリ）でもギリギリ。複数ターゲット攻撃は確実に超過。
2. **Paid プランでも超過する場合**: 他の原因（同一リクエスト内で複数の Worker invocation が連鎖しているなど）の可能性。

**エラーメッセージから推定すると**:
- `ThreadRepository.countActiveThreads failed` が再帰呼び出し内の Step 10b で発生している
- 再帰呼び出しは親 Worker invocation の中で実行されるため、親のサブリクエストカウンタを共有する
- つまり、親の createPost + 再帰の createPost が合算され、上限に達した

### 3.3 追加シナリオ: 初回書き込み + 6ターゲット全撃破

Step 4.5 のウェルカムシーケンスが発動する場合:
- +1 (CurrencyService.credit for welcome bonus)
- Step 9a: +1 (PendingTutorialRepository.create)
- Step 11.5: +5~7 (welcomeMessage 再帰 createPost)

**合計: 約 146~170**

---

## 4. N+1 問題一覧

### 4.1 致命的（ターゲット数に比例）

| 優先度 | 箇所 | パターン | 呼び出し数 |
|---|---|---|---|
| **P0** | AttackHandler.preValidateTarget | ターゲットごとに `findByThreadIdAndPostNumber` + `isBot` + `getBotByPostId` + `canAttackToday` | 2~5 * T |
| **P0** | AttackHandler 攻撃実行ループ | ターゲットごとに `getBalance` + `debit` + BotService操作群 | 5~13 * V |
| **P1** | AttackHandler.executeSingleBotAttack 内 | `revealBot` が `findById` + `reveal` で2クエリ（findById は applyDamage 直前にも呼ばれる） | 重複 findById |
| **P1** | BotService.revealBot + applyDamage | 両方が `botRepository.findById` を個別に呼ぶ | 2回の重複読み取り |

### 4.2 中程度（固定だが削減可能）

| 優先度 | 箇所 | パターン | 呼び出し数 |
|---|---|---|---|
| **P2** | AuthService.isUserBanned | `UserRepository.findById` — Step 3 と重複 | 1 (削減可能) |
| **P2** | IncentiveService sync phase | `PostRepository.findByThreadId` — Step 7 と Step 11 deferred で2回呼ぶ | 1 (キャッシュ可能) |
| **P2** | IncentiveService deferred phase | `ThreadRepository.findById` — Step 0 と Step 11 で2回呼ぶ | 1 (キャッシュ可能) |
| **P3** | IncentiveService reply | `PostRepository.findById` + `findByUserIdAndDate`（アンカー先ユーザーの当日ログ） | 1~2 |

### 4.3 BotService 内の重複 findById

AttackHandler が BotService の複数メソッドを順番に呼ぶとき、同一 botId に対する `botRepository.findById` が重複する:

```
getBotByPostId  → findByPostId + findById(botId)
canAttackToday  → (DB: attacks)
revealBot       → findById(botId) + reveal     ← 重複
applyDamage     → findById(botId) + ...        ← 重複
```

1ターゲットあたり最大3回の `botRepository.findById` が重複している。

---

## 5. 改善提案

### 5.1 短期: バッチ化・重複排除（コード変更のみ）

#### S1. AttackHandler 事前検証のバッチ化 [P0, 効果: -20~30クエリ/6ターゲット]

現状: ターゲットごとにループ内で `findByThreadIdAndPostNumber` を個別呼び出し。

提案: 範囲内の全レス番号を一括取得する。

```typescript
// 現状: T回の個別クエリ
for (const pn of postNumbers) {
  const post = await this.postRepository.findByThreadIdAndPostNumber(threadId, pn);
}

// 改善: 1回のバッチクエリ
const posts = await this.postRepository.findByThreadIdAndPostNumbers(threadId, postNumbers);
```

PostRepository に `findByThreadIdAndPostNumbers(threadId, postNumbers[])` を追加し、`WHERE thread_id = ? AND post_number IN (...)` で1クエリにする。

同様に、BOT判定 (`isBot`) もバッチ化する。`botPostRepository.findByPostIds(postIds[])` を追加し、`WHERE post_id IN (...)` で1クエリにする。

#### S2. BotService メソッド内の重複 findById 排除 [P1, 効果: -2~3クエリ/ターゲット]

提案A: `revealBot` と `applyDamage` が botInfo を引数で受け取るオーバーロードを追加する。
`getBotByPostId` で取得済みの botInfo を使い回す。

```typescript
// 現状: getBotByPostId で findById → revealBot で再度 findById → applyDamage で再度 findById
// 改善: getBotByPostId の結果を伝播
async revealBotWithInfo(bot: Bot): Promise<void> { ... }
async applyDamageWithInfo(bot: Bot, damage: number, attackerId: string): Promise<DamageResult> { ... }
```

提案B: AttackHandler が Bot オブジェクトを直接保持し、BotService の内部メソッドに渡す。
BotService のインターフェースを変更せず、AttackHandler 側でキャッシュする方式。

#### S3. 攻撃実行ループ内の getBalance 削除 [P0, 効果: -V クエリ]

現状: 攻撃実行ループの先頭で毎回 `getBalance` を呼んで残高チェックしている。

提案: ループ開始前の一括残高チェック（Step 5 の totalCost チェック）で十分な場合、ループ内の `getBalance` を削除する。
ただし、人間への攻撃で賠償金が発生すると残高が減るため、完全には削除できない。
代替案: ローカル変数で残高を追跡し、debit の戻り値から更新する。

```typescript
let localBalance = await this.currencyService.getBalance(ctx.userId);
for (const target of validTargets) {
  if (localBalance < this.cost) { /* 中断 */ break; }
  const deductResult = await this.currencyService.debit(ctx.userId, this.cost, "command_attack");
  if (deductResult.success) localBalance = deductResult.newBalance;
  // ...
}
```

#### S4. createPost 内の重複クエリ排除 [P2, 効果: -2~3クエリ]

- Step 2b `isUserBanned` は `UserRepository.findById` を呼ぶが、Step 3 でも同じ `findById` を呼ぶ。
  → Step 3 の結果を使って `isBanned` を判定する（1クエリ削減）。

- Step 7 sync の `PostRepository.findByThreadId` と Step 11 deferred の `PostRepository.findByThreadId` が重複。
  → sync phase の結果を変数に保持し、deferred phase で再利用する（1クエリ削減）。

- Step 0 の `ThreadRepository.findById` と Step 11 deferred 内の `ThreadRepository.findById` が重複。
  → Step 0 の結果を deferred phase に渡す（1クエリ削減）。

### 5.2 中期: 構造変更

#### M1. 複数ターゲット攻撃のバッチ BOT 操作 [効果: 大幅削減]

現状の攻撃実行はターゲットごとに逐次処理（debit → revealBot → applyDamage → recordAttack）。

提案: BotService に `applyBatchDamage(targets[], damage, attackerId)` を追加し、複数 BOT への HP 更新・攻撃記録を1~2クエリで処理する。

```sql
-- 一括HP更新
UPDATE bots SET hp = GREATEST(hp - $damage, 0) WHERE id = ANY($botIds);
-- 一括攻撃記録
INSERT INTO attacks (attacker_id, bot_id, attack_date, damage)
SELECT $attackerId, unnest($botIds), $today, $damage;
```

#### M2. リクエストスコープのクエリキャッシュ [効果: 全体的な削減]

1リクエスト内で同一エンティティの重複読み取りが多い。リクエストスコープのインメモリキャッシュ（Map）を導入し、同一キーの `findById` を2回目以降はキャッシュから返す。

```typescript
class RequestScopeCache {
  private cache = new Map<string, unknown>();
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const result = await fetcher();
    this.cache.set(key, result);
    return result;
  }
}
```

注意: CF Workers のリクエスト単位で生成・破棄すること。グローバルキャッシュにしてはならない。

#### M3. サブリクエストカウンター（監視用） [予防策]

先行インシデント記録（2026-03-23）の再発防止策 #7 で提案されているクエリカウンターを実装する。
1リクエスト内の Supabase クエリ発行数をカウントし、閾値（例: 80% = Free なら 40、Paid なら 800）超過時に警告ログを出力する。

### 5.3 改善後の見積もり

S1~S4 を全て適用した場合の `!attack >>10-15`（6 BOT全撃破）見積もり:

| 区分 | 現状 | 改善後 | 削減 |
|---|---|---|---|
| 事前検証 | 30 | 3~5 (バッチ) | -25~27 |
| 攻撃実行 (getBalance) | 6 | 0 (ローカル追跡) | -6 |
| 攻撃実行 (findById重複) | ~18 | ~6 (キャッシュ伝播) | -12 |
| ベース重複 (isUserBanned等) | 3 | 0 | -3 |
| findByThreadId重複 | 1 | 0 | -1 |
| **合計** | **139~161** | **約 92~114** | **-47** |

M1（バッチBOT操作）を追加適用した場合: **約 50~70** まで削減可能。

---

## 補足: 発生したエラーの正確な原因推定

エラーメッセージ:
```
[PostService] 独立システムレス挿入失敗: Error: ThreadRepository.countActiveThreads failed: Error: Too many subrequests
```

これは Step 9b の再帰 `createPost` 内の Step 10b `countActiveThreads` で発生している。
つまり、親の createPost（Step 0~9b まで）で消費されたサブリクエストと、再帰呼び出し内のサブリクエストの合計が上限を超えた。

親の createPost 内でコマンド実行（AttackHandler の複数ターゲット攻撃）が多数のサブリクエストを消費した後、再帰呼び出しの Step 10b で上限に到達したと推定される。再帰呼び出し自体は 5~7 クエリと軽量だが、親が既に大半を消費済みのため、残り枠が不足した。
