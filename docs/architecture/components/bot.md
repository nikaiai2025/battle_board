# D-08 コンポーネント境界設計書: Bot（AIボットシステム）

> ステータス: ドラフト / 2026-03-08
> 関連D-07: § 3.2 BotService / § 5.4 ボット認証

---

## 1. 分割方針

「ボットのライフサイクル管理（生成・書き込み実行・HP管理・撃破）」をPostServiceから独立させる。ボット固有のデータ（HP・ペルソナ・偽装ID・戦歴等）は `bots` / `bot_posts` テーブルでRLS保護されており、これらへのアクセスを本コンポーネントに集約することでRLSポリシーの管理範囲を明確にする。

ボットの書き込み実行はPostServiceを経由させる（CLAUDE.md横断的制約）。BotServiceはPostServiceの呼び出し元に徹し、DB直書きを行わない。

---

## 2. 公開インターフェース

### 2.1 書き込み実行（GitHub Actionsから呼び出し）

```
executeBotPost(botId: UUID, threadId: UUID, prompt: string): BotPostResult
```
```
BotPostResult {
  postId:    UUID
  postNumber: number
  dailyId:   string   // 偽装日次リセットID（当日分を使用）
}
```

内部フロー：
1. AI APIを呼び出してペルソナ+プロンプトから本文を生成
2. PostService.createPost(isBotWrite=true) を呼び出す
3. 成功したら `bot_posts` に { postId, botId } を INSERT

`bot_posts` へのINSERTはこのコンポーネントのみが行う。PostServiceは `bot_posts` を意識しない。

### 2.2 HP更新・撃破処理（CommandServiceから呼び出し）

```
applyDamage(botId: UUID, damage: number): DamageResult
```
```
DamageResult {
  remainingHp:  number
  eliminated:   boolean
  eliminatedBy: UUID | null
}
```

撃破時は自身で `bots.is_active = false` / `eliminated_at` 等を更新する。

### 2.3 正体判定（AccusationServiceから呼び出し）

```
isBot(postId: UUID): boolean
```

`bot_posts` に `postId` のレコードが存在するかを検索する。AccusationServiceはこのメソッドを通じてのみボット判定を行い、`bot_posts` テーブルに直接アクセスしない。

### 2.4 偽装ID取得（当日分の再利用）

```
getDailyId(botId: UUID): string
```

`bots.daily_id` / `bots.daily_id_date` を参照し、当日分であればそのまま返す。日付が古ければ再生成してDBを更新してから返す。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| PostService | ボット書き込みの実行（isBotWrite=trueで呼び出し） |
| BotRepository | `bots` テーブルのCRUD（service_roleのみアクセス可） |
| BotPostRepository | `bot_posts` テーブルのINSERT・SELECT（service_roleのみ） |
| AI APIクライアント | 本文テキストの生成（GitHub Actions経由で外部LLM API呼び出し） |
| CurrencyService | 撃破ボーナス付与（撃破者への通貨加算） |

### 3.2 被依存

```
CommandService     →  BotService.applyDamage()
AccusationService  →  BotService.isBot()
GitHub Actions     →  BotService.executeBotPost()
daily-maintenance  →  BotService（日次リセット処理）
```

---

## 4. 隠蔽する実装詳細

- AI APIのプロバイダー（Gemini等）と呼び出し詳細
- ペルソナプロンプトの管理方法（DBのpersonaカラムをどのようにsystem promptに組み込むか）
- 偽装daily_idの生成アルゴリズム（一般ユーザーと同一の `daily-id` ドメインルールを使うが、seedが異なる）

---

## 5. 設計上の判断

### bot_posts INSERTのタイミングと失敗時の扱い

PostService.createPost が成功してからでないと有効なpostIdが取得できないため、`bot_posts` のINSERTは必ずPostService完了後に行う。ここで失敗した場合（DB障害等）、postレコードは残るがbot_postsレコードが存在しないため、`isBot(postId)` が false を返す状態になる。この不整合はゲーム上「ボットが人間として扱われる」方向に作用するため、**ゲームの公平性上はむしろ問題ない**（告発されたときにmissになる）。ただし管理上の不整合のためエラーログに記録する。

### プロンプトサニタイズはBotService責務外

CLAUDE.md横断的制約により「ユーザー作成ボットのプロンプトは必ずサニタイズし管理者プロンプトで上書きする」が定められているが、MVPスコープではユーザー作成ボットが存在しない。MVPのボットは運営が定義するペルソナのみのため、本コンポーネントではサニタイズ処理を実装しない（Phase 4への拡張ポイント）。
