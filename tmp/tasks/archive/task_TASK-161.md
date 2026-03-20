---
task_id: TASK-161
sprint_id: Sprint-58
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T18:00:00+09:00
updated_at: 2026-03-19T18:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00016_seed_arashi_bot.sql"
  - src/lib/services/bot-service.ts
  - src/__tests__/lib/services/bot-service.test.ts
---

## タスク概要

BOT本番稼働を阻害する2つのバグを修正する。(A) botsテーブルに荒らし役ボットの初期レコードが存在しない問題をseedマイグレーションで解決する。(B) `createBotService()` ファクトリ関数が `createPostFn` と `threadRepository` を注入していないため `executeBotPost()` が必ず失敗するバグを修正する。

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/services/bot-service.ts` — createBotService() ファクトリ関数（末尾付近）と BotService コンストラクタ
2. [必須] `src/app/api/internal/bot/execute/route.ts` — createBotService() の呼び出し元
3. [必須] `config/bot-profiles.ts` — 荒らし役の設定値（hp=10, max_hp=10, bot_profile_key='荒らし役'）
4. [参考] `supabase/migrations/00001_create_tables.sql` — bots テーブル定義
5. [参考] `supabase/migrations/00007_bot_v5_attack_system.sql` — times_attacked, bot_profile_key カラム追加
6. [参考] `supabase/migrations/00015_bot_next_post_at.sql` — next_post_at カラム追加
7. [参考] `docs/architecture/architecture.md` §13 TDR-010 — cron駆動方式

## 修正内容

### A. seedマイグレーション作成

**ファイル:** `[NEW] supabase/migrations/00016_seed_arashi_bot.sql`

荒らし役ボット1体の初期レコードをINSERTする。冪等にするため `ON CONFLICT DO NOTHING` または `INSERT ... WHERE NOT EXISTS` を使用する。

必要カラム値:
- `name`: '荒らし役'
- `persona`: 荒らし役BOTのペルソナ（なんJ風の短文投稿者）
- `hp`: 10
- `max_hp`: 10
- `daily_id`: ランダム8文字英数字
- `daily_id_date`: CURRENT_DATE
- `is_active`: true
- `is_revealed`: false
- `bot_profile_key`: '荒らし役'
- `next_post_at`: NOW()（次のcronで即投稿対象になる）

冪等性の実現方法: `name = '荒らし役'` のレコードが既に存在する場合はスキップ。UUIDは `gen_random_uuid()` で自動生成。

### B. createBotService() バグ修正

**ファイル:** `src/lib/services/bot-service.ts`

現状の `createBotService()`:
```typescript
export function createBotService(): BotService {
    const BotRepository = require("../infrastructure/repositories/bot-repository");
    const BotPostRepository = require("../infrastructure/repositories/bot-post-repository");
    const AttackRepository = require("../infrastructure/repositories/attack-repository");
    return new BotService(BotRepository, BotPostRepository, AttackRepository);
}
```

BotService コンストラクタの第5〜7引数が未注入:
- 第4引数 `botProfilesData`: 省略OK（コンストラクタ内で `botProfilesConfig` がデフォルト使用される）
- **第5引数 `threadRepository`**: executeBotPost内のBehaviorStrategyが書き込み先スレッドを決定するのに必要
- **第6引数 `createPostFn`**: executeBotPost内でPostService.createPostを呼ぶのに必要
- 第7引数 `resolveStrategiesFn`: 省略OK（デフォルトのresolveStrategiesが使用される）

修正方針:
```typescript
export function createBotService(): BotService {
    const BotRepository = require("../infrastructure/repositories/bot-repository");
    const BotPostRepository = require("../infrastructure/repositories/bot-post-repository");
    const AttackRepository = require("../infrastructure/repositories/attack-repository");
    const ThreadRepository = require("../infrastructure/repositories/thread-repository");
    const { createPost } = require("./post-service");

    // threadRepository は IBotService.IThreadRepository に適合するアダプタを作成
    const threadRepository = {
        findByBoardId: (boardId: string) => ThreadRepository.findByBoardId(boardId),
    };

    return new BotService(
        BotRepository,
        BotPostRepository,
        AttackRepository,
        undefined,           // botProfilesData（デフォルトを使用）
        threadRepository,    // threadRepository
        createPost,          // createPostFn
    );
}
```

注意点:
- `thread-repository.ts` に `findByBoardId` 関数が存在するか確認すること。存在しない場合は `IThreadRepository` インターフェースを確認して適切な関数を使用する
- `post-service.ts` の `createPost` 関数のシグネチャが `CreatePostFn` 型と一致するか確認すること
- 循環依存に注意（`require()` の遅延評価で回避しているパターンを維持する）

### テスト

- `npx vitest run` で既存テスト全件PASSを確認
- 特に `src/__tests__/lib/services/bot-service.test.ts` でテストが壊れないことを確認

## 完了条件
- [ ] `supabase/migrations/00016_seed_arashi_bot.sql` が存在し、冪等なINSERT文である
- [ ] `createBotService()` が `threadRepository` と `createPostFn` を注入している
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- BDDシナリオの変更
- bot/execute ルートの変更
- 新規テストファイルの追加（既存テストの修正のみ）
- ネタ師BOT関連

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: A. seedマイグレーション作成、B. createBotService() バグ修正、テスト全件PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [2026-03-19] タスク開始。必読ドキュメント（bot-service.ts, route.ts, bot-profiles.ts, マイグレーション, テストファイル）読み込み完了
- [2026-03-19] thread-repository.ts の findByBoardId と post-service.ts の createPost のシグネチャを確認。互換性あり
- [2026-03-19] A: `supabase/migrations/00016_seed_arashi_bot.sql` 作成完了（INSERT ... WHERE NOT EXISTS で冪等性担保）
- [2026-03-19] B: `createBotService()` に ThreadRepository アダプタと createPost を注入するよう修正完了
- [2026-03-19] `npx vitest run` 実行。schema-consistency.test.ts の1件は変更前から存在する既存の失敗（Local DB に 00015 マイグレーション未適用）。今回の変更に起因しないことをgit stashで確認済み
- [2026-03-19] bot-service.test.ts 41件 PASS。schema-consistency除く 56 ファイル / 1269 テスト全件 PASS

### テスト結果サマリー
- bot-service.test.ts: **41 PASS / 0 FAIL**
- 全テスト（schema-consistency除く）: **1269 PASS / 0 FAIL** (56 ファイル)
- schema-consistency.test.ts: 1 FAIL（既存の問題。本タスクの変更前から存在。Local DB に 00015_bot_next_post_at.sql 未適用が原因）
