# CF Workers エラー調査報告 (2026-03-22)

## 調査概要

Cloudflare Workers Observability 有効化後、初回のエラーログ収集・分析を実施した。

## 発見した問題

### 問題1: BOT投稿の全件 FK制約違反 (現在進行中・要修正)

**症状**: cron 経由の BOT投稿が全て `posts_author_id_fkey` 外部キー制約違反で失敗

**wrangler tail で取得したログ**:
```
[scheduled] bot/execute result: {
  "totalDue": 10,
  "processed": 5,
  "successCount": 0,
  "failureCount": 5,
  "results": [
    {"botId":"2c9d21a9-...","success":false,"error":"PostRepository.create failed: insert or update on table \"posts\" violates foreign key constraint \"posts_author_id_fkey\""},
    ... (5件全て同一エラー)
  ],
  "tutorials": {
    "processed": 2,
    "results": [
      {"pendingId":"a0020c68-...","success":false,"error":"PostRepository.create failed: ...posts_author_id_fkey..."},
      {"pendingId":"8d47f559-...","success":false,"error":"PostRepository.create failed: ...posts_author_id_fkey..."}
    ]
  }
}
```

**根本原因**:

`post-service.ts` 415-417行目で、BOT書き込み時に `botUserId` (= `bots.id`) を `resolvedAuthorId` にセットしている:

```typescript
// post-service.ts L415-417
if (input.isBotWrite && input.botUserId) {
    resolvedAuthorId = input.botUserId;  // bots.id をセット
}
```

この値が `PostRepository.create()` で `posts.author_id` に INSERT される (L649)。
しかし `posts.author_id` は `REFERENCES users(id)` の FK制約を持つ (00001_create_tables.sql L68)。
`botId` は `bots` テーブルの UUID であり `users` テーブルには存在しないため、FK制約違反が発生する。

スキーマコメント (L60) にも「author_id は人間の書き込み時のみ設定。ボットは NULL + bot_posts に記録される」と明記されている。

**導入経緯**: Sprint-85 (`f3867a8`) で `PostInput.botUserId` フィールドを追加。コマンドパイプライン (!w 等) で BOT書き込み時に userId が空になる問題を解消するために `resolvedAuthorId` を設定したが、DB側の FK制約との矛盾が見落とされた。

**修正方針**:

BOT書き込み時の `resolvedAuthorId` と、コマンドパイプラインで使う `userId` を分離する必要がある。

案A: BOT書き込み時は `resolvedAuthorId = null` (DB INSERT用) のまま維持し、コマンドパイプライン用の `userId` は別変数で管理する。
- `posts.author_id` には null がINSERTされる (FK制約OK、スキーマ意図通り)
- コマンド実行時の userId は `input.botUserId` を参照

案B: `posts.author_id` の FK制約を `bots(id)` も許容するように変更する。
- スキーマの設計意図に反する。推奨しない。

推奨は **案A**。

**該当ファイル**:
- `src/lib/services/post-service.ts` L415-417 (resolvedAuthorId のセット箇所)
- `src/lib/services/post-service.ts` L649 (PostRepository.create への渡し)
- コマンドパイプライン内で `resolvedAuthorId` を userId として使用している箇所の分離

---

### 問題2: cron の canceled outcome 656件 (解消済み)

**症状**: 2026-03-21 13:36-19:36 UTC に、cron トリガーの `canceled` outcome が 656件発生

**特徴**:
- `httpMethod` なし → cron (scheduled) トリガーのイベント
- `wallTime` = 0 → 処理が開始される前に即座にキャンセル
- HTTP 500 は 0件 (レスポンスは返していない)
- 同時間帯の OK リクエストは 515件 (HTTP は正常に動作)
- 2026-03-21 19:56 UTC のデプロイ以降、発生なし

**推定原因**:

13:36-19:36 UTC の時間帯は、CF Workers Error 1101 修正 (`62338fa`) の前後に該当する。
この修正では wrangler.toml の復元と build-cf.mjs の scheduled handler 注入ロジックを修正している。
修正前のデプロイでは scheduled handler が正しく注入されていなかった可能性が高く、
Workers ランタイムが cron トリガーに対して有効な handler を見つけられず即座に canceled を返したと推定される。

19:56 UTC のデプロイ (`03a24fa0`) で修正版が反映され、以降は canceled が 0件。

**対応**: 解消済み。追加対応不要。

---

## Observability API 利用メモ

- `groupBy` 付きクエリは `internal_server` エラーになることがある (API制限の可能性)
- `DOES_NOT_EXIST` オペレータで「フィールドが存在しないイベント」をフィルタ可能 (cron検出に有効)
- `$workers.wallTime`, `$workers.cpuTime` で計算量フィルタ可能
- Free プランの Observability は 200K events/day
