# 分析: bots.total_posts インクリメント漏れ

## 1. 根本原因

**実装忘れ**。`BotService.executeBotPost()` で投稿成功後に `total_posts` をインクリメントする処理が実装されていない。

### 原因の詳細

`BotService` が依存する `IBotRepository` インターフェース（`bot-service.ts` L104-129）に `incrementTotalPosts` メソッドが定義されていない。

```typescript
// bot-service.ts L104-129 — IBotRepository インターフェース（抜粋）
export interface IBotRepository {
  findById(id: string): Promise<Bot | null>;
  findAll(): Promise<Bot[]>;
  updateHp(botId: string, hp: number): Promise<void>;
  eliminate(botId: string, eliminatedBy: string): Promise<void>;
  reveal(botId: string): Promise<void>;
  incrementTimesAttacked(botId: string): Promise<void>;  // <-- 被攻撃回数はある
  incrementSurvivalDays(botId: string): Promise<void>;   // <-- 生存日数もある
  // ... incrementTotalPosts が存在しない
}
```

一方、実リポジトリ（`bot-repository.ts` L324-326）には `incrementTotalPosts` 関数が実装済みであり、RPC関数 `increment_bot_column` も `total_posts` カラムに対応済み（`00014_add_increment_column_rpc.sql` L53）。

つまり、**インフラ層は準備完了しているが、サービス層のインターフェース定義とビジネスロジックの双方で呼び出しが欠落している**。

## 2. コードフロー追跡

### 2.1 BOT投稿の完全なフロー

```
GitHub Actions cron
  -> POST /api/internal/bot/execute  (src/app/api/internal/bot/execute/route.ts)
    -> BotService.getActiveBotsDueForPost()  (L292-294)
    -> BotService.executeBotPost(bot.id)     (L653-788)
      Step 1:  botRepository.findById(botId)           ... BOT情報取得
      Step 1.5: next_post_at 判定                       ... 投稿タイミング確認
      Step 2:  getBotProfileForStrategy()               ... プロファイル取得
      Step 3:  resolveStrategiesForBot()                ... Strategy解決
      Step 4:  behavior.decideAction()                  ... 投稿先決定
      Step 5:  content.generateContent()                ... 本文生成
      Step 6:  getDailyId()                             ... 偽装ID取得
      Step 7:  createPostFn()                           ... PostService経由で書き込み
      Step 8:  botPostRepository.create(postId, botId)  ... bot_posts紐付けINSERT
      Step 9:  botRepository.updateNextPostAt()         ... 次回投稿時刻更新
      *** total_posts インクリメント処理が存在しない ***
      Step 10: return { postId, postNumber, dailyId }
```

### 2.2 他カウンタのインクリメント箇所（対比）

| カウンタ | インクリメント箇所 | 呼び出し元 |
|---|---|---|
| `times_attacked` | `IBotRepository.incrementTimesAttacked` (L110) | `BotService.applyDamage` (L418) |
| `survival_days` | `IBotRepository.incrementSurvivalDays` (L111) | `BotService.performDailyReset` (L585) |
| `accused_count` | `BotRepository.incrementAccusedCount` (L332) | 不明（IBotRepositoryに未定義、直接呼出し？） |
| `total_posts` | `BotRepository.incrementTotalPosts` (L324) | **どこからも呼ばれていない** |

## 3. 仕様での定義

### 3.1 BDDシナリオ (features/bot_system.feature)

L230-231:
```gherkin
And ボットの生存日数は 5日、総書き込み数は 42件、被告発回数は 3回 である
```

L238-243 （撃破通知フォーマット）:
```
生存日数：5日 / 総書き込み：42件 / 被告発：3回
```

`total_posts` は撃破時の戦歴公開で表示される仕様上必須のフィールド。

### 3.2 状態遷移仕様書 (docs/specs/bot_state_transitions.yaml)

L284-298: `battle_record` セクションで `total_posts`（総書き込み数）が戦歴の構成要素として定義されている。

### 3.3 DBスキーマ (supabase/migrations/00001_create_tables.sql)

L111: `total_posts INTEGER NOT NULL DEFAULT 0` として定義済み。

### 3.4 ドメインモデル (src/lib/domain/models/bot.ts)

L40: `totalPosts: number` として型定義済み。

### 3.5 撃破通知の実装 (src/lib/services/handlers/attack-handler.ts)

L312: 撃破通知で `botInfo.totalPosts` を参照して表示している。

## 4. 修正方針

### 4.1 コード修正（2箇所）

#### (A) IBotRepository インターフェースに `incrementTotalPosts` を追加

**ファイル**: `src/lib/services/bot-service.ts` L104-129

```typescript
export interface IBotRepository {
  // ... 既存メソッド ...
  incrementTimesAttacked(botId: string): Promise<void>;
  incrementSurvivalDays(botId: string): Promise<void>;
  incrementTotalPosts(botId: string): Promise<void>;  // <-- 追加
  // ...
}
```

#### (B) executeBotPost の Step 8（bot_posts INSERT）成功直後に incrementTotalPosts を呼び出す

**ファイル**: `src/lib/services/bot-service.ts`、Step 8 の try ブロック内（L752 の後）

```typescript
// Step 8: bot_posts に { postId, botId } を INSERT
try {
    await this.botPostRepository.create(result.postId, botId);
    // total_posts をインクリメント（bot_posts INSERT成功後に実行）
    await this.botRepository.incrementTotalPosts(botId);
} catch (err) {
    // ... 既存のエラーハンドリング ...
}
```

**設計判断**: `incrementTotalPosts` を bot_posts INSERT と同じ try ブロック内に置く理由:
- bot_posts INSERT が失敗した場合、その投稿は「ボットの投稿として認識されない」ため、total_posts をインクリメントすべきでない
- incrementTotalPosts が失敗した場合は、bot_posts INSERT は成功しているため、カウンタのみ不整合になる。これは next_post_at の更新失敗と同じ性質であり、致命的ではない。ただし、正確な戦歴表示に影響するため、エラーログは記録すべき

補足: `incrementTotalPosts` の失敗を独立して処理したい場合は、bot_posts INSERT の直後に独立した try-catch で囲む設計も考えられる。しかし、現状の bot_posts INSERT 失敗時の方針（「ボットが人間として扱われる方向に作用するため許容」）と一貫させるなら、同一 try 内に置くのが最もシンプルで整合的。

### 4.2 既存データの補正SQL

```sql
-- bot_posts テーブルの実レコード数に基づいて total_posts を補正する
UPDATE bots b
SET total_posts = sub.actual_count
FROM (
    SELECT bot_id, COUNT(*) AS actual_count
    FROM bot_posts
    GROUP BY bot_id
) sub
WHERE b.id = sub.bot_id
  AND b.total_posts <> sub.actual_count;
```

このSQLは冪等であり、今後も定期的な整合性チェックとして使える。

### 4.3 テスト追加方針

#### 単体テスト（Vitest）

**ファイル**: `src/__tests__/lib/services/bot-service.test.ts`

テストケース:
1. `executeBotPost` 成功時に `incrementTotalPosts` が1回呼ばれることを検証
2. `botPostRepository.create` 失敗時に `incrementTotalPosts` が呼ばれないことを検証（bot_posts INSERT と同一 try 内に置いた場合）

#### BDDステップ定義

`features/bot_system.feature` の既存シナリオ「HPが0になったボットが撃破され戦歴が全公開される」で `総書き込み数は 42件` が検証対象になっている。このシナリオのステップ定義が正しく total_posts を検証するよう確認する。

## 5. 影響範囲

- **撃破時の戦歴表示**: `attack-handler.ts` L312 で `botInfo.totalPosts` を使用。現状は常に 0 が表示される
- **管理ダッシュボード**: 管理画面でBOT情報を表示する際に totalPosts を参照している可能性あり
- **BOTヘルスチェック (C8)**: 本バグの発見元。total_posts == 0 と bot_posts レコード数の不一致を検知

## 6. 追加確認事項

`accused_count`（被告発回数）のインクリメントについても同様の確認が推奨される。`IBotRepository` インターフェースに `incrementAccusedCount` が含まれておらず、`BotRepository` の実装（L330-333）は存在するが、サービス層からの呼び出し元が不明瞭。告発処理（AccusationService）から直接リポジトリを呼んでいる可能性がある。
