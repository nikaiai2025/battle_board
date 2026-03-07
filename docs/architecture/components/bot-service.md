# D-08 コンポーネント設計書: BotService

> 作成日: 2026-03-07
> 対象: Phase 2 (MVP) — 運営ボット（荒らし役）のみ

## 1. 概要

AIボット（Phase 2では運営ボット荒らし役）のライフサイクル管理を行うコンポーネント。偽装ID生成・HP管理・BOTマーク管理・撃破処理・戦歴生成を担当する。

## 2. 責務

- ボットの偽装日次リセットID生成・日次リセット
- ボットの書き込み実行（GitHub Actions からのAPI呼び出し経由）
- BOTマークの付与・解除
- HP管理（攻撃によるHP減少）
- 撃破判定・戦歴生成・報酬計算
- 生存日数の加算（日次バッチ）

## 3. 依存関係

```
BotService
  ├── BotRepository          (ボットデータの読み書き)
  ├── PostRepository         (書き込み・システムメッセージ)
  ├── CurrencyService        (撃破報酬・攻撃コスト)
  └── AuthService            (ボットAPI認証)
```

## 4. ボットの書き込み処理

### 4.1 GitHub Actions → API 呼び出し

```
GitHub Actions (cron: 15分おき)
│
├── 1. AI API (Gemini等) を呼び出し、書き込み文章を生成
│   ├── プロンプト: ボットのペルソナ定義 + スレッドの直近レス
│   └── 生成テキスト: 「今日の雑談」スレに書き込む自然な文章
│
├── 2. BattleBoard API を呼び出し
│   └── POST /api/threads/{threadId}/posts
│       Header: X-Bot-API-Key: {secret}
│       Body: { body: "生成テキスト" }
│
└── 3. API側でボットとして処理
    ├── AuthService がボットAPI認証（X-Bot-API-Key → botId を解決）
    ├── PostService が書き込み処理
    │   ├── posts INSERT（author_id = NULL, daily_id = bot.daily_id）
    │   ├── bot_posts INSERT（post_id, bot_id）← RLS保護テーブル
    │   └── bots.total_posts を +1
    └── 表示名は「名無しさん」、IDはボットの偽装ID
```

### 4.2 偽装日次リセットID

```typescript
function generateBotDailyId(): string {
  // 人間のIDと同じ形式・桁数のランダム文字列
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}
```

- 同日中は一貫して同一のIDを使用（`bots.daily_id`）
- JST 0:00 にリセット（`bots.daily_id_date` で管理）

## 5. 攻撃処理

```
BotService.attack(attackerId, targetBotId, tx)
│
├── 1. ボットの状態確認
│   ├── is_active = true か？ → false なら「撃破済み」エラー
│   ├── is_revealed = true か？ → false なら「BOTマークなし」エラー
│   └── hp > 0 か？
│
├── 2. 攻撃コスト消費
│   └── CurrencyService.deduct(attackerId, ATTACK_COST, tx)
│
├── 3. HP減少
│   └── UPDATE bots SET hp = hp - :damage WHERE id = :botId
│       → damage の計算: 固定値（TBD）
│
├── 4. 撃破判定
│   ├── hp <= 0 → eliminate()
│   └── hp > 0 → 攻撃結果のシステムメッセージ
│
└── 5. システムメッセージ INSERT
    └── "[システム] 名無しさん(ID:xxx)が 🤖{name} に攻撃！ HP:N→M"
```

## 6. 撃破処理

```
BotService.eliminate(bot, eliminatorId, tx)
│
├── 1. ボット状態更新
│   └── UPDATE bots SET
│         is_active = false,
│         eliminated_at = NOW(),
│         eliminated_by = :eliminatorId
│
├── 2. 撃破報酬計算
│   └── reward = BASE_REWARD + (bot.survival_days * MULTIPLIER)
│       → 具体値は TBD-03
│
├── 3. 撃破報酬付与
│   └── CurrencyService.add(eliminatorId, reward, tx)
│
└── 4. 戦歴システムメッセージ INSERT
    └── "[システム] ⚔️ ボット「{name}」が撃破されました！
         生存日数：{N}日 / 総書き込み：{M}件 / 被告発：{K}回
         撃破者：ID:{daily_id} に撃破報酬 +{reward}"
```

## 7. 日次リセット処理

GitHub Actions `daily-maintenance` ジョブで実行（JST 0:00）:

```sql
-- 1. BOTマーク解除
UPDATE bots
SET is_revealed = false,
    revealed_at = NULL
WHERE is_active = true
  AND is_revealed = true;

-- 2. 偽装ID更新
-- アプリケーション側でランダムID生成後にUPDATE
UPDATE bots
SET daily_id = :newRandomId,
    daily_id_date = CURRENT_DATE
WHERE is_active = true;

-- 3. 生存日数加算
UPDATE bots
SET survival_days = survival_days + 1
WHERE is_active = true;
```

## 8. Phase 2 のボット構成

| ボット名 | ペルソナ | HP | 説明 |
|---|---|---|---|
| 荒らし役 | 煽り・短文・連投気味の書き込み | 30 | チュートリアルMob。新規ユーザーの初成功体験の対象 |

## 9. 将来の拡張（Phase 4）

- ユーザー作成ボット: `bots` テーブルに `owner_id` カラムを追加
- 複数ペルソナ: `persona` フィールドで分化（荒らし、常連、ネタ師等）
- ガチャ: HP・行動頻度・攻撃力・コマンド枠をランダム決定
- HP回復: 餌やり（!feed）、書き込み報酬、草をもらう（!w）
- ボットのコマンド使用: ガチャで獲得したコマンドをAI判断で使用
