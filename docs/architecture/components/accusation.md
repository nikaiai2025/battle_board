# D-08 コンポーネント境界設計書: Accusation（AI告発）

> ステータス: ドラフト / 2026-03-08
> 関連D-07: § 3.2 AccusationService

---

## 1. 分割方針

`!tell` コマンドはコマンドシステムの一種だが、「RLS保護されたbot_postsへのアクセス」と「hitかmissかの判定ロジック」がCommandServiceの他コマンドと明確に異なるため、独立させる。CommandServiceは `!tell` を受け取ったらAccusationServiceに丸ごと委譲し、実行詳細を持たない。

---

## 2. 公開インターフェース

```
accuse(input: AccusationInput): AccusationResult
```

```
AccusationInput {
  accuserId:     UUID   // 告発者userId
  targetPostId:  UUID   // 告発対象のpostId
  threadId:      UUID
}
```

```
AccusationResult {
  result:        "hit" | "miss"
  bonusAmount:   number         // 付与される通貨ボーナス（0の場合もある）
  systemMessage: string         // スレッドに表示するシステムメッセージ文字列
  alreadyAccused: boolean       // 重複告発フラグ（trueの場合は実行されない）
}
```

重複告発（同一accuser × 同一targetPost）は `alreadyAccused: true` を返し、通貨消費なし・DB書き込みなし。この判定はAccusationService内で行い、CommandService側では重複チェックを行わない。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| BotService | `isBot(postId)` でbotか人間かを判定（bot_postsには直接アクセスしない） |
| CurrencyService | hit時のボーナス付与（`credit`） |
| AccusationRepository | `accusations` テーブルへのINSERT・重複チェック |

### 3.2 被依存

```
CommandService  →  AccusationService.accuse()
```

---

## 4. 隠蔽する実装詳細

- `bot_posts` テーブルへのアクセスはBotService経由であり、AccusationServiceは直接参照しない
- ボーナス金額の計算ロジック（miss時の冤罪ボーナス計算を含む）
- 重複チェックの実装（`accusations` テーブルのユニーク制約に依存するか、事前SELECTするか）

---

## 5. 設計上の判断

### bot_postsへの直接アクセスを禁止

AccusationServiceが `bot_posts` を直接参照すると、service_roleアクセスを持つコンポーネントが増加しRLSの管理が複雑化する。`BotService.isBot()` という単一の窓口を経由させることで、bot_posts への直接アクセス権を BotService に集中させる。

### システムメッセージ文字列の生成責任

告発結果のシステムメッセージ（「AIボットを発見しました！」等）はAccusationServiceが生成し文字列として返す。PostServiceへのINSERTはPostService（orCommandService経由）が行う。テキスト生成ロジックがPostServiceに漏れ出さないようにする。
