---
task_id: TASK-280
sprint_id: Sprint-103
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-23T04:00:00+09:00
updated_at: 2026-03-23T04:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/bot-repository.ts
---

## タスク概要

Sprint-102で最適化した`countLivingBots()`のSupabaseネストselectが本番で「無反応」を引き起こしている。Supabase PostgRESTのmany-to-one FK関係が**単一オブジェクト**を返すのに対し、コードが**配列**として`.some()`を呼び、TypeErrorで失敗する。

## 障害の根本原因

Supabaseネストselect `bots.select("id, bot_posts(post_id, posts(thread_id, threads(is_dormant)))")` の戻り値:
- `bot_posts`: one-to-many → **配列** ✓
- `bot_posts.posts`: many-to-one (bot_posts.post_id → posts.id) → **単一オブジェクト or null**
- `posts.threads`: many-to-one (posts.thread_id → threads.id) → **単一オブジェクト or null**

現行コードは`posts`と`threads`を`Array<>`として`.some()`を呼んでおり、TypeErrorを引き起こす。PostServiceのtry-catch（line 471-475）でエラーが黙殺され「無反応」になる。

## 修正方針

**安全なアプローチ: ネストselectを廃止し、2クエリに分離する。**

ネストselectの型推論はSupabase SDKバージョンやPostgRESTの挙動に依存し不安定。代わりに明確な2クエリパターンを使う:

```typescript
// クエリ1: スレッド固定BOTのIDとbot_postsのpost_idを取得
const { data: threadFixedBots } = await supabaseAdmin
  .from("bots")
  .select("id, bot_posts(post_id)")
  .eq("is_active", true)
  .in("bot_profile_key", ["tutorial", "aori"]);

// threadFixedBots が空なら countB = 0 で終了

// bot_postsからpost_id一覧を抽出
const allPostIds = threadFixedBots.flatMap(bot => bot.bot_posts.map(bp => bp.post_id));

// クエリ2: post_id → posts → threads の is_dormant を取得
const { data: posts } = await supabaseAdmin
  .from("posts")
  .select("id, thread_id, threads(is_dormant)")
  .in("id", allPostIds);

// posts.threads は many-to-one なので単一オブジェクト。
// ただし安全のため、Array.isArray()で判定して両方に対応する。
```

アプリ層で各BOTに紐づくスレッドの is_dormant=false を判定してカウント。合計2クエリ（区分A: 1 + 区分B: 2 = 3クエリ以内）。

**重要: PostgRESTのmany-to-one戻り値は必ずArray.isArray()で判定し、配列・オブジェクト両方に対応すること。**

## 完了条件
- [ ] `countLivingBots()` が最大3クエリ以内で完了する
- [ ] PostgREST戻り値をArray.isArray()で安全にハンドリングする
- [ ] BDDテスト: `npx cucumber-js --tags @livingbot` で全14シナリオPASS
- [ ] 単体テスト: `npx vitest run` 全PASS

## スコープ外
- features/ の変更
- InMemoryの動作ロジック変更
- 他のリポジトリメソッドの変更

## 補足・制約
- ThreadFixedBotRow型を実際のSupabase戻り値に合わせて修正すること
- CF Workers環境で1リクエストあたりのサブリクエスト上限が1000回。countLivingBotsは3クエリ以内に収めること
- Supabase `.in()` フィルタには空配列を渡さないこと（PostgRESTエラーになる）。allPostIdsが空の場合は早期リターン

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `ThreadFixedBotRow` 型を修正: `posts`/`threads` のネスト型（配列前提）を廃止し、2つの型に分離
   - `ThreadFixedBotRow`: bots → bot_posts(post_id) のみ
   - `PostWithThread`: posts → threads（many-to-one対応、単一オブジェクト/配列/null を受容）
2. `countLivingBots()` 区分Bを1ネストクエリから2クエリに分離:
   - クエリ1: bots + bot_posts(post_id) 取得
   - クエリ2: posts + threads(is_dormant) 取得
   - アプリ層で post_id → is_dormant マップを構築し、BOTごとにアクティブスレッド判定
3. 安全策の実装:
   - `Array.isArray()` で PostgREST many-to-one の配列/オブジェクト両対応
   - `allPostIds` が空の場合の早期リターン（Supabase `.in()` 空配列エラー回避）
   - threads が null の場合は休眠扱い（安全側に倒す）
4. クエリ数: 区分A=1 + 区分B=最大2 = 合計3クエリ以内（制約達成）

### テスト結果サマリー

- 単体テスト (`npx vitest run`): 84/85 PASS, 1 FAIL（pre-existing schema-consistency、本タスク無関係）
- BDDテスト (`npx cucumber-js`): 326 scenarios, 310 passed, 16 pending（全pending はpre-existing、本タスク無関係）
- command_livingbot.feature: 全14シナリオ PASS
