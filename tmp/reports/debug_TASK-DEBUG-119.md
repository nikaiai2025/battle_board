# TASK-DEBUG-119: BOT !w コマンド不発の真の原因

**調査日**: 2026-03-25
**ステータス**: 原因特定完了 -- bdd-coding への修正依頼待ち

## 症状

チュートリアルBOTが投稿する `!w` コマンドが実行されない（サイレント失敗）。
前回のインシデント修正（cebd451: 改行分割）を適用済みだが改善しない。

## 真の原因: grass_reactions.giver_id の FK制約違反

**BOTが `!w` コマンドを実行すると、`grass_reactions` テーブルへの INSERT で外部キー制約違反が発生する。**

### 実行パスの追跡

```
1. BotService.executeBotPost(botId)
   body = ">>5 !w\n新参おるやん🤣"  (改行分割済み)
   ↓
2. PostService.createPost({
     body: ">>5 !w\n...",
     isBotWrite: true,
     botUserId: botId       // ← botsテーブルのUUID
   })
   ↓
3. [Step 5] CommandService.executeCommand({
     rawCommand: body,
     userId: botId           // ← input.botUserId がそのまま渡る (L470)
   })
   ↓
4. parseCommand(">>5 !w\n...") → { name: "w", args: [">>5"] }
   ↓
5. [Step 1.5] PostNumberResolver: ">>5" → UUID に解決 (正常)
   ↓
6. GrassHandler.execute({
     args: [対象レスのUUID],
     userId: botId            // ← botsテーブルのUUID
   })
   ↓
7. [ステップ4] 自己草チェック: targetPost.authorId !== botId → 通過
   ↓
8. [ステップ7] grassRepository.create({
     giverId: botId           // ← botsテーブルのUUID
   })
   ↓
9. SQL INSERT into grass_reactions (giver_id = botId, ...)
   → FK制約違反: giver_id REFERENCES users(id) だが botId は usersテーブルに存在しない
   → PostgreSQL error 23503 (foreign_key_violation)
   → throw Error
```

### FK制約の該当箇所

`supabase/migrations/00008_grass_system.sql` L32:
```sql
giver_id UUID NOT NULL REFERENCES users(id),
```

### サイレント失敗の理由

GrassHandler には `try-catch` がない。例外は以下のパスで握りつぶされる:

```
GrassHandler.execute()  -- 例外 throw
  → CommandService.executeCommand()  -- 例外 throw
    → PostService.createPost() L473  -- catch で console.error のみ
      → commandResult = null のまま
      → inlineSystemInfo にエラー情報なし
      → BOTの書き込み自体は成功（投稿は正常にINSERTされる）
      → ユーザーには何も起きていないように見える
```

## 前回の分析が不十分だった理由

前回のインシデント分析（cebd451）では「フレーバーテキストが後方引数に混入する」問題を特定し、改行分割で修正した。これ自体は実在する問題であり修正は正しかったが、**改行分割後も FK制約違反が発生する別の失敗パスが存在することに気づいていなかった**。

改行分割前: パーサーが `"新参おるやん🤣"` を引数として解釈 → `findById` で null → `success: false` を返却（例外なし）
改行分割後: パーサーが `">>5"` を正しく解釈 → UUID解決も成功 → GrassHandler の処理が進行 → **ステップ7で FK制約違反が発生** → 例外 throw → サイレント失敗

つまり、改行分割修正により「パーサーの問題」は解消されたが、「より深い層の問題」が露出した形になる。

## 該当箇所

| ファイル | 行 | 問題 |
|---|---|---|
| `supabase/migrations/00008_grass_system.sql` | L32 | `giver_id REFERENCES users(id)` -- BOTはusersに存在しない |
| `src/lib/services/handlers/grass-handler.ts` | L231-232 | `giverId: ctx.userId` -- BOTの場合 botId が入る |
| `src/lib/services/post-service.ts` | L470 | `userId: input.botUserId ?? ...` -- botId をそのまま渡す |
| `src/lib/services/post-service.ts` | L473-477 | 例外を `console.error` で握りつぶし |

## 備考: 同種の問題の既知認識

`post-service.ts` L571-576 に以下のコメントが存在する:

```typescript
// BOT書き込み時は IncentiveService をスキップする
// BOTの botUserId は users テーブルに存在しないため、FK制約違反を起こす無駄なクエリを防ぎ
```

IncentiveService では「BOTはスキップ」という対策がされているが、GrassHandler（CommandService経由のコマンド実行パイプライン）では同じ対策が漏れている。

## 修正方針（案）

以下のいずれか:

**案A: BOTの !w コマンド実行をスキップする**
- PostService の Step 5 で `isBotWrite && body に !w を含む` 場合はコマンド解析をスキップ
- 最もシンプルだが、将来BOTに他のコマンドを実行させたい場合に拡張性がない

**案B: GrassHandler で BOT giver を許容する設計変更**
- `grass_reactions.giver_id` の FK制約を外す、またはNULLABLE化して giver_bot_id カラムを追加
- スキーマ変更を伴うため影響範囲が大きい

**案C: BOT用の仮ユーザーレコードを作成する（既存パターン）**
- BOTスポーン時に `users` テーブルにも対応するレコードを作成し、botUserId をそのユーザーIDにする
- スキーマ変更なし。ただし users テーブルにBOT用レコードが増える

**案D: GrassHandler 内で giver がBOTかを判定し、giver_id に別の値を使う**
- BOTの草付与は「システムによる草」として扱い、giver_id にシステムユーザーIDを使用する
- 「誰が草を生やしたか」の情報は失われるが、チュートリアルBOTの目的（デモ）には十分

いずれの案も設計判断を伴うため、人間の方針決定が必要。

## 収集ログ

本件はコード解析のみで原因特定が完了した。wrangler tail によるログ収集は未実施。
FK制約違反の例外は PostService の L476 `console.error` で出力されるため、wrangler tail で以下のログが確認できるはず:

```
[PostService] CommandService.executeCommand failed: GrassRepository.create failed: ...
```
