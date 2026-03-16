# D-08 コンポーネント境界設計書: Incentive（インセンティブ）

> ステータス: 運用中
> 関連D-07: § 3.2 IncentiveService / § 7.3 遅延評価ボーナス / TDR-004

---

## 1. 分割方針

8種のボーナスイベントを一覧し、発火条件の判定とCurrencyServiceへの付与委譲を一元管理する。PostServiceが個別のボーナス条件を知らなくてよい構造とするため、独立したコンポーネントとする。

ボーナスの一部は「書き込み時点では未確定」（後続書き込みに依存する遅延評価型）であり、この評価タイミングの管理もIncentiveServiceの責務とする（TDR-004）。

---

## 2. 公開インターフェース

### 2.1 書き込みトリガー型（PostServiceから呼び出し）

```
evaluateOnPost(ctx: PostContext): IncentiveResult
```

```
PostContext {
  postId:    UUID
  threadId:  UUID
  userId:    UUID
  postNumber: number
  createdAt: Date
  isReplyTo?: UUID   // アンカー先レスのID（返信ボーナス用）
}
```

```
IncentiveResult {
  granted: { eventType: string; amount: number }[]  // 今回付与したボーナス一覧
  skipped: string[]                                 // 重複等でスキップしたイベント種別
}
```

このメソッド内で「過去のレスに対する遅延評価ボーナス」も合わせて判定する（ホットレス・スレッド復興・スレッド成長）。

### 2.2 イベント種別と評価方式の一覧

| イベント種別 | 評価タイミング | 評価軸 |
|---|---|---|
| `daily_login` | 書き込み時 | 当日初書き込みか（date単位重複チェック） |
| `reply` | 書き込み時 | アンカー先が存在し、自分以外のレスか |
| `new_thread_join` | 書き込み時 | スレッド立てから数レス以内への初参加か |
| `streak` | 書き込み時 | 連続書き込み日数がマイルストーンに到達したか |
| `milestone_post` | 書き込み時 | レス番号がキリ番か |
| `hot_post` | 後続書き込み時（遅延） | 過去60分以内の自分のレスに3人以上が返信したか |
| `thread_revival` | 後続書き込み時（遅延） | 過去30分以内に別ユーザーのレスが付いたか |
| `thread_growth` | 後続書き込み時（遅延） | スレッドが10件/100件マイルストーン到達 + ユニークID数条件 |

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| CurrencyService | ボーナス通貨の付与（credit） |
| IncentiveLogRepository | `incentive_logs` テーブルへのINSERT・重複チェック |
| PostRepository | 遅延評価ボーナス判定に必要な過去レス参照（読み取りのみ） |
| ThreadRepository | スレッドのpost_count・ユニークID数参照（読み取りのみ） |
| UserRepository | streak_days / last_post_date の読み書き |

### 3.2 被依存

```
PostService  →  IncentiveService.evaluateOnPost()
```

---

## 4. 隠蔽する実装詳細

- 遅延評価ボーナスの過去レス参照クエリ（どのSQLで何件を走査するか）
- `incentive_logs` の重複防止に `ON CONFLICT DO NOTHING` を使うか事前SELECTするか（D-07では `ON CONFLICT DO NOTHING` を採用）
- イベント種別ごとの重複チェックキー（`(user_id, event_type, context_date)` vs `(user_id, event_type, context_id)`）

---

## 5. 設計上の判断

### インセンティブ失敗は書き込みを巻き戻さない

IncentiveServiceの例外は呼び出し元（PostService）でcatchし、ボーナスをスキップしてエラーログに記録する。書き込みのトランザクションとは別扱いにするため、**IncentiveServiceへの呼び出しは書き込みトランザクションのコミット後に行う**か、または同一Tx内に含める場合でも失敗時に書き込みをロールバックしない設計とする（要実装時確認）。

### 遅延評価ボーナスを専用ジョブにしない理由（TDR-004）

メッセージキューやバックグラウンドジョブを避け、後続書き込みトランザクション内で過去レスをチェックする方式を採用。これはインフラをVercel+Supabase+GitHub Actionsに固定する制約下で、追加のインフラ（SQS等）を必要としないための選択。遅延評価の対象が長期にわたる場合（書き込みが来なければ永久に判定されない）のリスクは許容する（MVP初期フェーズでは書き込み頻度が想定できない）。
