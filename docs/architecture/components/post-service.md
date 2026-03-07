# D-08 コンポーネント設計書: PostService

> 作成日: 2026-03-07
> 対象: Phase 1 + Phase 2 (MVP)

## 1. 概要

書き込み処理の統括コンポーネント。バリデーション → レス追加 → コマンド解析 → インセンティブ判定を一連のトランザクションで実行する。Web API と専ブラ互換 API の両方からの書き込みを統一的に処理する。

## 2. 責務

- 書き込みリクエストのバリデーション
- レス番号の採番（スレッド内連番）
- 日次リセットID / 表示名の決定
- レスの永続化
- コマンド検出時の CommandService への委譲
- インセンティブ判定の IncentiveService への委譲
- スレッドメタデータ（post_count, last_post_at）の更新

## 3. 依存関係

```
PostService
  ├── PostRepository        (レスの永続化)
  ├── ThreadRepository      (スレッドメタ更新)
  ├── UserRepository        (ユーザー情報取得)
  ├── CommandService         (コマンド解析・実行)
  ├── IncentiveService       (ボーナス判定・付与)
  └── AuthService            (認証状態の検証)
```

## 4. インターフェース

```typescript
interface PostInput {
  threadId: string;
  body: string;          // 本文（UTF-8）
  authorToken: string;   // edge-token or bot API key
}

interface PostOutput {
  post: Post;
  commandResult?: CommandResult;
  bonuses: BonusEvent[];
}

interface PostService {
  createPost(input: PostInput): Promise<PostOutput>;
}
```

## 5. 処理フロー

```
createPost(input)
│
├── 1. 認証検証
│   └── AuthService.validateToken(input.authorToken)
│       → 無効: 認証コード案内を返して終了
│       → 有効: userId, dailyId, displayName を取得
│
├── 2. バリデーション
│   ├── body が空でないこと
│   ├── threadId が存在し、削除されていないこと
│   └── 失敗時: エラーを返して終了
│
├── 3. BEGIN TRANSACTION
│   │
│   ├── 3a. レス番号の採番
│   │   └── SELECT MAX(post_number) FROM posts WHERE thread_id = :threadId
│   │       → 次番号 = MAX + 1（スレッド作成時は 1）
│   │
│   ├── 3b. コマンド検出（本文のプリプロセス）
│   │   └── CommandParser.parse(body)
│   │       → commands: ParsedCommand[] （コマンド名、引数、位置）
│   │       → cleanBody: string（ステルスコマンドを除去した本文）
│   │
│   ├── 3c. レスの INSERT
│   │   └── posts に INSERT（cleanBody を使用）
│   │
│   ├── 3d. スレッドメタ更新
│   │   └── threads の post_count +1, last_post_at = NOW()
│   │
│   ├── 3e. コマンド実行（commands が空でない場合）
│   │   └── CommandService.execute(commands, context)
│   │       → 通貨消費、システムメッセージ INSERT 等
│   │       → 通貨不足時: コマンドスキップ、エラーメッセージ INSERT
│   │
│   ├── 3f. インセンティブ判定
│   │   └── IncentiveService.evaluate(context)
│   │       → 書き込みログインボーナス判定
│   │       → スレッド作成ボーナス判定（スレ立て時のみ）
│   │       → 新スレッド参加ボーナス判定
│   │       → 返信ボーナス判定（アンカー先の著者への付与）
│   │       → ホットレスボーナス判定（過去レスのチェック）
│   │       → スレッド復興ボーナス判定
│   │       → キリ番ボーナス判定
│   │       → ストリーク更新
│   │
│   └── 3g. COMMIT
│
└── 4. PostOutput を返却
```

## 5.1 ボット書き込み時の追加処理

AuthService がリクエストをボット（`X-Bot-API-Key`）と判定した場合、以下が変わる:

- `author_id = NULL`（ボットは users テーブルにレコードを持たない）
- `daily_id = bot.daily_id`（ボット固有の偽装ID）
- `display_name = "名無しさん"`（固定）
- **3c の INSERT 後**: `bot_posts` に `(post_id, bot_id)` を INSERT
- **3d の後**: `bots.total_posts` を +1
- インセンティブ判定はスキップ（ボットはボーナス対象外）

## 6. エラーハンドリング

**原則: 書き込みの成功を最優先する。** （architecture.md §7.3 参照）

| 失敗種別 | 書き込み | コマンド | ボーナス | 対応 |
|---|---|---|---|---|
| 未認証 | ❌ 中止 | - | - | 401 + 認証コード案内。TX不実行 |
| バリデーションエラー（本文空等） | ❌ 中止 | - | - | 400 エラー。TX不実行 |
| スレッド不存在/削除済み | ❌ 中止 | - | - | 404 エラー。TX不実行 |
| DB致命的エラー（接続断等） | ❌ 中止 | - | - | ROLLBACK。500 エラー |
| コマンドの通貨不足 | ✅ 成功 | ❌ スキップ | 判定する | エラーのシステムメッセージを追加 |
| コマンド実行エラー（対象不存在等） | ✅ 成功 | ❌ スキップ | 判定する | エラーのシステムメッセージを追加 |
| インセンティブ判定エラー | ✅ 成功 | 実行済み | ❌ スキップ | エラーログに記録（後で手動補填可能） |

## 7. 同時実行制御

- レス番号の採番: `SELECT MAX + 1` は SERIALIZABLE またはアドバイザリロックで保護
- 通貨操作: CurrencyService の楽観的ロック（`WHERE balance >= cost`）に委譲
- 同一スレッドへの同時書き込み: レス番号の一意制約 `(thread_id, post_number)` で最終防衛
