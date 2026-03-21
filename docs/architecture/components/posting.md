# D-08 コンポーネント境界設計書: Posting（書き込み）

> ステータス: 運用中
> 関連D-07: § 3.2 PostService / § 7 投稿処理の原子性

---

## 1. 分割方針

「書き込みという行為に伴う副作用の統括」を単一の責務とする。
Web API・専ブラ互換Adapterの2経路が存在するため、経路ごとに散らばりがちな副作用処理（コマンド転送・インセンティブ判定・日次ID生成等）を本コンポーネントに集約し、**経路に依存しない一貫した処理保証**を実現する。

コマンド実行・通貨操作・インセンティブ判定を自身のサービスから分離する理由は、それぞれが独立したトランザクション失敗ポリシーを持つため（書き込みを巻き戻さずコマンドだけスキップする等）。

---

## 2. 公開インターフェース

### 2.1 入力型（PostInput）

両経路が共通して渡すべき正規化済み構造体。経路固有の情報（Shift_JIS / form-urlencoded 等）はAdapterで除去済みであること。

```
PostInput {
  threadId:   UUID
  body:       string          // UTF-8済み本文
  edgeToken:  string | null   // 未認証時はnull → 認証フロー起動
  ipHash:     string          // 発行時IPのSHA-512ハッシュ
  displayName?: string        // 省略 → "名無しさん"
  email?:     string          // 省略 → ""
  isBotWrite: boolean         // BotServiceからの呼び出し時true（認証スキップ用）
  botUserId?: string          // BOT書き込み時のコマンド実行用ユーザーID（botIdをそのまま使用）
}
```

`isBotWrite` フラグの扱い：edge-token検証をスキップするが、それ以外の処理（コマンド・インセンティブ等）は人間と同一パスを通る。ボットか人間かをこのコンポーネント以下で意識させない。

`botUserId` の扱い：`isBotWrite=true` かつ `botUserId` が指定されている場合、コマンド実行時の `resolvedAuthorId` を `botUserId` で上書きする。チュートリアルBOTの書き込みに `!w` コマンドが含まれる場合など、BOT書き込み時でもコマンドパイプラインを正常動作させるために使用する（Sprint-84新設）。See: docs/architecture/components/bot.md §6.10

### 2.2 出力型（PostResult）

```
PostResult {
  postId:          UUID
  postNumber:      number
  systemMessages:  { postId: UUID; body: string }[]  // 同一Txで挿入されたシステムメッセージ
  authRequired?:   { code: string; token: string }    // edgeTokenがnullだった場合のみ
}
```

### 2.3 その他公開操作

| 操作 | 用途 |
|---|---|
| `createThread(ThreadInput)` | スレッド新規作成 |
| `getThreadList(boardId, cursor?)` | 一覧取得（subject.txt / Web UI共用）。アクティブスレッド（is_dormant=false）のみ返す |
| `getPostList(threadId, range?)` | レス取得（.dat Range / Web UI共用） |

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| AuthService | `createPost` 冒頭でedge-token検証。未認証時は認証フローをAuthServiceに委譲し、PostResultに認証情報を添付して早期リターン |
| CommandService | 本文中にコマンドを検出した場合のみ呼び出す。失敗しても書き込みはコミット済み |
| IncentiveService | 書き込み成功後に呼び出す。失敗しても書き込みを巻き戻さない |
| PostRepository | 書き込みレコードのINSERT、スレッド内レスの取得 |
| ThreadRepository | post_count / last_post_at の更新、スレッド取得、休眠⇔復活の更新（D-05参照） |
| UserRepository | ユーザー特定・streak更新 |
| `domain/rules/daily-id` | 日次リセットID生成（純粋関数。副作用なし） |
| `domain/rules/command-parser` | コマンド有無の検出（純粋関数。副作用なし） |

### 3.2 被依存（呼び出し元）

```
Web APIルートハンドラ  →  PostService
専ブラ互換Adapter      →  PostService
BotService             →  PostService（isBotWrite=trueで呼び出す）
```

---

## 4. 隠蔽する実装詳細

- トランザクション境界の実装（Supabase RPC / pg関数 / アプリ層での逐次実行 のいずれか）
- レス番号採番の排他制御方式（SERIALIZABLEかアドバイザリロックか）
- `bot_posts` テーブルへのレコード挿入タイミング（PostServiceが行うのかBotServiceが後続で行うのか）→ **BotServiceが `createPost` 完了後に `bot_posts` INSERTを行う**責務とし、PostService内では意識しない

---

## 5. 設計上の判断

### ウェルカムシーケンス（Sprint-84新設）

初回書き込みユーザーへのウェルカム処理として、`createPost()` 内に2つのステップを追加した。

**Step 6.5: 初回書き込み検出（レス番号採番完了後）**

条件: `!isSystemMessage && !isBotWrite && resolvedAuthorId != null`
- `PostRepository.countByAuthorId(resolvedAuthorId) === 0` の場合:
  1. 初回書き込みボーナス +50 を付与（`CurrencyService.credit(userId, 50, "welcome_bonus")`）
  2. ボーナス通知文字列をレス末尾の `inlineSystemInfo` に追加（方式A: レス内マージ）
  3. `PendingTutorialRepository.create()` でチュートリアルBOTのキューイング

**Step 11.5: ウェルカムメッセージ投稿（初回書き込み検出時のみ）**

上記キューイングと同一トランザクション内で、独立システムレスとしてウェルカムメッセージを投稿する（方式B: 独立システムレス）。

```
PostService.createPost({
  body: `>>${welcomeTargetPostNumber} Welcome to Underground...`,
  displayName: "★システム",
  isBotWrite: true,
  isSystemMessage: true,
})
```

See: features/welcome.feature @初回書き込みボーナスとして+50が付与されレス末尾にマージ表示される
See: tmp/workers/bdd-architect_TASK-236/design.md §2 初回書き込み検出 + ウェルカムシーケンス

### コマンド検出を Parsing と Execution に分離

`command-parser`（純粋関数）でコマンドの有無だけを検出し、CommandServiceに渡す。PostServiceはコマンドの種類・コストを知らない。これによりコマンド仕様の変更がPostServiceに波及しない。

### 休眠管理の責務（D-05 スレッド状態遷移）

書き込み時の同期処理として、PostService が休眠⇔復活の遷移を管理する。cron ではなく書き込みトランザクション内で実行するため、タイミング不整合が発生しない。

処理順序（D-07 §7.1 step 2b）:
1. 対象スレッドの last_post_at を更新
2. 対象スレッドが休眠中（is_dormant=true）の場合、is_dormant=false に更新（復活）
3. アクティブスレッド数が上限（50件）を超える場合、last_post_at が最古の非固定（is_pinned=false）アクティブスレッドを is_dormant=true に更新

この処理はコマンド解析・インセンティブ判定より前に実行する。休眠管理の失敗は書き込み全体を巻き戻す（スレッド状態の整合性が崩れるため、コマンド・インセンティブとは異なり部分的スキップを許容しない）。

### `getThreadList` / `getPostList` の共用

Web UI（SSR）と専ブラ互換Adapterは同一のクエリ結果を使う。フォーマット変換（DAT形式・JSON等）はそれぞれの呼び出し元が行う。PostServiceはUTF-8のドメインオブジェクトを返すのみ。

### システムメッセージの表示方式

システムメッセージには2つの表示方式があり、PostServiceが統括する。

#### 方式A: レス内マージ

コマンド実行結果・書き込み報酬など、投稿者のレスに付随する情報を本文末尾に区切り線付きで付加する。

- PostServiceは `createPost` のトランザクション内で、コマンド実行結果・インセンティブ結果を取得し、本文末尾に結合してからINSERTする
- レスがDBに確定した時点で結果込みの本文になるため、専ブラの差分同期（Rangeヘッダ）に影響しない
- レス番号を1つだけ消費する（コマンド結果のために別レスを消費しない）
- 区切り線の具体的表現はD-06 SCR-002を参照

**方式Aが適用されるケース:**
- コマンド実行結果（成功・失敗・エラー）
- 書き込み報酬
- 通貨変動の通知

#### 方式B: 独立システムレス

「★システム」名義の独立レスとしてPostServiceが挿入する。

- 投稿者名は `★システム`、dailyIdなし
- 「★」はシステム予約文字であり、一般ユーザーの表示名には使用できない（有料ユーザーがユーザーネームに「★」を含めた場合は「☆」に置換。D-03 mypage.feature参照）
- 独立レスとしてレス番号を消費する

**方式Bが適用されるケース:**
- 管理者操作の通知（レス削除コメント等）
- スレッド全体への非同期イベント通知（ボット撃破速報等、Phase 2以降）
- 他ユーザーの情報を表示するコマンドの結果（!hissi, !kinou 等）

#### 判断基準

方式A/Bの選択はコマンドの性質に応じて柔軟に決定する。以下は傾向であり厳格な条件ではない。

| 傾向 | 方式 |
|---|---|
| 実行者自身のレスに付随する短い結果 | A（レス内マージ） |
| 他ユーザーの情報など、実行者のレスにマージすると文脈が混乱する結果 | B（独立システムレス） |
| ユーザーの投稿に紐づかない、または非同期に発生するイベント | B（独立システムレス） |
| エラー通知 | A（レス内マージ） |

コマンドごとの方式は `config/commands.yaml` で設定し、PostServiceが方式に応じたDB操作を行う。CommandServiceは方式を意識しない。`CommandExecutionResult.systemMessage` として文字列を返すのみ。
