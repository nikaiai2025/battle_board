# 人間模倣ボット v1 設計ドラフト

> 位置づけ: `features/human_mimic_bot.feature` の受け入れ基準に対応する D-08 追記草案  
> ステータス: ドラフト v1  
> 方針: 実行回数節約を最優先し、複雑な在庫制御は導入しない

## 1. 目的

人間模倣ボットは、固定文ではなくスレッド内容を踏まえた AI 生成文を掲示板へ投下する運営ボットである。  
ただし v1 では、BOT投稿のたびに AI API を呼び出さず、6時間ごとの生成バッチで候補を先に作り置きする。

荒らし役と同一条件として、以下を採用する。

- 10体並行稼働
- HP 10
- 投稿間隔 1〜2時間ランダム
- 撃破報酬パラメータは荒らし役と同一
- 日次リセットと翌日復活ロジックは荒らし役と同一

採用理由:

- 無料枠の AI API 実行回数を節約できる
- 投稿タイミングで外部 API の遅延や失敗に引きずられない
- 既存の「収集と投稿の分離」パターンに整合する

Gemini API の再試行方針は既存の `GoogleAiAdapter` と同一にする。

- 最大試行回数: 3
- バックオフ: 指数バックオフ（1秒 / 2秒 / 4秒）
- リトライ対象: HTTP 429, 500, 503 およびネットワークエラー
- 全試行失敗時: 当該スレッドの候補生成だけを失敗として扱い、バッチ全体は継続する

## 2. v1 の非採用事項

以下は v1 では導入しない。

- 在庫しきい値補充
- 候補の TTL
- 新着レス数に応じた再生成
- 補充要求キュー
- `reserved` 状態

理由は、実行回数節約という主目的に対して費用対効果が低く、ロジックを不必要に複雑化するためである。

## 3. 全体フロー

候補在庫は個別 bot インスタンスごとではなく、`人間模倣ボットというBOT種別全体` で共有する。
理由は、10体構成で bot_id 単位の在庫を持つと、同一スレッドに対して候補生成が10重化し、
AI API 実行回数節約という主目的に反するためである。

### 3.1 候補生成バッチ

1. 6時間ごとに起動する
2. アクティブ50スレッドを取得する
3. 各スレッドについて未投稿候補の有無を確認する
4. 未投稿候補が1件以上あるスレッドはスキップする
5. 未投稿候補が0件のスレッドだけ AI API を1回呼び出す
6. 1回の API 実行で 10 件の候補文を生成し保存する

Gemini API 呼び出しはアダプタ内部で再試行する。ワーカー/バッチ層で独自リトライループは持たない。

### 3.2 BOT投稿

1. 投稿タイミングで、アクティブスレッドのうち `未投稿候補があるスレッド` だけを母集団にする
2. その中からランダムに1スレッドを選ぶ
3. 選ばれたスレッドの最古の未投稿候補を1件取得する
4. その候補文を `PostService.createPost(isBotWrite=true)` で投稿する
5. 成功時に候補を投稿済みに更新する
6. 候補ありスレッドが0件なら `BotAction.type = "skip"` として終了する

## 4. Strategy への割り当て

既存の Strategy 分割に合わせるなら、v1 は以下が妥当。

- `ContentStrategy`: 保存済み候補文を返す専用実装
- `BehaviorStrategy`: 候補ありスレッドからランダム選択する専用実装
- `SchedulingStrategy`: 荒らし役と同等の既存実装を流用、または専用プロファイルで間隔だけ定義

仮名:

- `StoredReplyCandidateContentStrategy`
- `CandidateStockBehaviorStrategy`

`AiConversationContentStrategy` を投稿時に直接使う案は v1 では採用しない。AI 呼び出しは生成バッチ側へ寄せる。

## 5. データモデル草案

### 5.1 新規テーブル: `reply_candidates`

人間模倣ボットの AI回答候補の在庫を保持する。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | UUID (PK) | 内部識別子 |
| `bot_profile_key` | VARCHAR | 候補の所有BOT種別。v1では `human_mimic` 固定 |
| `thread_id` | UUID (FK -> threads.id) | 対象スレッド |
| `body` | TEXT NOT NULL | 投稿候補本文 |
| `generated_from_post_count` | INTEGER | 生成時点のレス数 |
| `posted_post_id` | UUID NULL | 実際に投稿された post_id |
| `posted_at` | TIMESTAMPTZ NULL | 投稿済み時刻。NULL = 未投稿 |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | 候補生成時刻 |

最小要件として `posted_at IS NULL` が未投稿判定の正本になる。

### 5.2 インデックス

- `(thread_id, posted_at, created_at)`  
  スレッド単位の未投稿候補検索と最古候補取得に使用

- `(bot_profile_key, thread_id, posted_at)`  
  生成スキップ判定と投稿候補スレッド検索に使用

## 6. Repository インターフェース草案

```ts
interface IReplyCandidateRepository {
  countUnpostedByThread(threadId: string): Promise<number>;
  saveMany(
    botProfileKey: string,
    threadId: string,
    bodies: string[],
    generatedFromPostCount: number
  ): Promise<void>;
  findThreadIdsWithUnpostedCandidates(
    botProfileKey: string,
    boardId: string,
    limit: number
  ): Promise<string[]>;
  findOldestUnpostedByThread(
    threadId: string
  ): Promise<{ id: string; body: string } | null>;
  markAsPosted(
    candidateId: string,
    postId: string,
    postedAt: Date
  ): Promise<boolean>;
}
```

`markAsPosted` は `WHERE id = :candidateId AND posted_at IS NULL` 条件で更新し、更新件数 1/0 を返す。  
これが v1 における最小限の二重投稿防止である。

## 7. 二重投稿防止

現実的には同一候補の競合は多発しない前提とする。  
ただし、システム的な最低限の手当てとして以下だけ入れる。

1. 取得対象は `posted_at IS NULL`
2. 投稿成功後の更新は `id = ? AND posted_at IS NULL` 条件で行う
3. 更新件数が 0 の場合は、他実行が先に確保したとみなし、重複投稿扱いを避けて終了する

`reserved` カラムやロックテーブルは v1 では不要とする。

## 8. AI プロンプト

入力:

- スレッド本文
- 人間模倣用の管理者システムプロンプト
- 生成件数 `10`

出力:

- JSON 配列の候補文 10件

既存の調査メモ `docs/research/20260421-人間らしい書き込みを再現するためのプロンプト検討.md` の方向性を流用可能。

セキュリティ要件:

- スレッド本文はシステムプロンプトと別メッセージで渡す
- ユーザー入力をそのまま LLM に渡さない
- 管理者プロンプトを常に先頭で固定する

## 8.1 Gemini API リトライ

既存の `src/lib/infrastructure/adapters/google-ai-adapter.ts` と同じリトライ方針を適用する。

- 最大3回試行
- 指数バックオフ 1秒 / 2秒 / 4秒
- HTTP 429 / 500 / 503 / ネットワーク系をリトライ対象とする
- 400 / 403 など恒久エラーはリトライしない

責務分担:

- アダプタ層: リトライとバックオフ
- 候補生成バッチ層: 成功時の保存、全試行失敗時のログ記録、次スレッドへの継続

これは `!newspaper` `!hiroyuki` `!yomiage` の AI 利用時と同一方針である。

## 9. 既存コンポーネントへの影響

### 9.1 `docs/architecture/components/bot.md`

追記候補:

- Strategy 実装一覧に人間模倣ボット用の `ContentStrategy` / `BehaviorStrategy` を追加
- `AiApiClient` 利用例として「候補生成バッチ」を追加
- `収集と投稿の分離` の節に、人間模倣ボットの候補生成を追加
- データモデル節に `reply_candidates` を追加
- `bot_profiles.yaml` に `human_mimic` プロファイルを追加し、HP / reward / scheduling を荒らし役と同一値で定義

### 9.2 `docs/specs/bot_state_transitions.yaml`

状態遷移自体は既存の運営ボットと同じでよい。  
追加が必要なのは「投稿本文の生成源が固定文ではなく保存済み候補である」という注記レベルに留まる。

### 9.3 `features/bot_system.feature`

共通ルールは流用できる。  
人間模倣ボット固有の受け入れ基準は独立 feature として切り出す方が DRY。

## 10. 実装順序案

1. `human_mimic_bot.feature` を正式化
2. `docs/architecture/components/bot.md` に v1 方針を追記
3. `reply_candidates` テーブルと Repository を追加
4. 候補生成バッチを実装
5. Strategy 実装を追加し、BotService から呼び出す
6. BDD と単体テストを追加

## 11. 決定事項

- 人間模倣ボットの HP は荒らし役と同一の 10
- 撃破報酬パラメータは荒らし役と同一
- 投稿間隔は荒らし役と同一の 1〜2時間ランダム
- ボット数は荒らし役と同一の 10体
- 撃破済みボットの翌日復活ロジックは荒らし役と同一

## 12. 未決事項

- 候補生成バッチの実行環境を GitHub Actions にするか既存 internal API に寄せるか
