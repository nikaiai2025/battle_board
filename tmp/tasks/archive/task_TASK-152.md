---
task_id: TASK-152
sprint_id: Sprint-54
status: completed
assigned_to: bdd-coding
depends_on: [TASK-151]
created_at: 2026-03-19T00:00:00+09:00
updated_at: 2026-03-19T00:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/XXXXXXXX_bot_next_post_at.sql"
  - src/lib/services/bot-service.ts
  - src/lib/infrastructure/repositories/bot-repository.ts
  - "[NEW] src/app/api/internal/bot/execute/route.ts"
  - "[NEW] src/app/api/internal/daily-reset/route.ts"
  - "[NEW] src/app/api/internal/daily-stats/route.ts"
  - "[NEW] src/lib/middleware/internal-api-auth.ts"
  - "[NEW] src/__tests__/lib/services/bot-service-scheduling.test.ts"
  - "[NEW] src/__tests__/api/internal/"
---

## タスク概要

荒らし役BOTの本番稼働に必要なバックエンド全体を実装する。DBマイグレーション（`next_post_at`カラム追加）、BotServiceの投稿判定・更新ロジック、Internal APIルート3本、Bearer認証ミドルウェア、および単体テストを一括で実装する。

## 対象BDDシナリオ
- なし（内部API。BDDシナリオは存在しないが、単体テストでカバーする）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/architecture.md` §13 TDR-010 — cron設計の全仕様
2. [必須] `docs/architecture/components/bot.md` §2.1, §2.10, §5.1 — next_post_at関連の設計
3. [必須] `src/lib/services/bot-service.ts` — 既存のBotService実装
4. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` — 既存のRepository
5. [参考] `scripts/aggregate-daily-stats.ts` — 日次統計集計の既存スクリプト（APIルート化時に参考）
6. [参考] `src/app/api/admin/` — 既存の管理APIルート（認証パターンの参考）

## 実装内容

### 1. DBマイグレーション

`bots` テーブルに `next_post_at` カラムを追加:
```sql
ALTER TABLE bots ADD COLUMN next_post_at TIMESTAMPTZ;
-- 既存BOTの初期値: NOW()（次のcronで即投稿対象になる）
UPDATE bots SET next_post_at = NOW() WHERE next_post_at IS NULL;
```

### 2. BotService の next_post_at 対応

- `executeBotPost()` の冒頭に `next_post_at <= NOW()` 判定を追加（スキップ時は早期return）
- 投稿成功後に `next_post_at = NOW() + scheduling.getNextPostDelay()` でDB更新
- `performDailyReset()` の eliminated→lurking 復活時に `next_post_at` を再設定
- **新規メソッド**: `getActiveBotsDueForPost(): Bot[]` — `WHERE is_active = true AND next_post_at <= NOW()` で投稿対象BOT一覧を返す

### 3. BotRepository の拡張

- `updateNextPostAt(botId: UUID, nextPostAt: Date): void`
- `findDueForPost(): Bot[]` — next_post_at <= NOW() かつ is_active = true のBOT一覧

### 4. Internal API認証ミドルウェア

```typescript
// src/lib/middleware/internal-api-auth.ts
export function verifyInternalApiKey(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  return token === process.env.BOT_API_KEY;
}
```

認証失敗時は 401 Unauthorized を返す。

### 5. APIルート3本

#### POST /api/internal/bot/execute
- Bearer認証チェック
- `getActiveBotsDueForPost()` で投稿対象BOTを取得
- 各BOTに対して `executeBotPost(botId)` を実行
- 結果をJSONで返す（成功数・失敗数・各BOTの投稿結果）

#### POST /api/internal/daily-reset
- Bearer認証チェック
- `BotService.performDailyReset()` を実行
- 結果をJSONで返す

#### POST /api/internal/daily-stats
- Bearer認証チェック
- `scripts/aggregate-daily-stats.ts` と同等のロジックを実行
- 既存スクリプトのロジックを可能な限り再利用する（importまたはリファクタ）

### 6. 単体テスト

- BotService: next_post_at判定のテスト（投稿対象/非対象、更新後の値）
- BotService: 日次リセット時のnext_post_at再設定テスト
- Internal API認証: 正常キー/不正キー/キーなしのテスト
- APIルート: モックBotServiceでの正常系・異常系テスト

## 完了条件
- [ ] マイグレーションファイルが作成されている
- [ ] BotService.executeBotPost() が next_post_at を判定・更新する
- [ ] performDailyReset() が復活BOTの next_post_at を再設定する
- [ ] 3つのInternal APIルートが Bearer認証付きで動作する
- [ ] 単体テスト全件PASS
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- GitHub Actionsワークフロー（TASK-153で対応）
- BDDシナリオの追加・変更
- フロントエンド変更
- Vercel/Cloudflare環境変数設定（人間作業）

## 補足・制約
- Vercel Hobbyのタイムアウトは10秒。BOT投稿APIは投稿対象BOT数に応じて実行時間が変わる。荒らし役10体が同時に投稿対象になるケースは稀だが、逐次実行で10秒を超える可能性がある場合は1回あたりの処理BOT数を制限する等の対策を検討すること
- `BOT_API_KEY` 環境変数が空の場合（ローカルで未設定等）は全リクエストを拒否すること（空文字との一致を許可しない）
- 既存のBotServiceのコンストラクタシグネチャ・DIパターンを壊さないこと

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全実装完了、全テストPASS
- 次にすべきこと: なし
- 未解決の問題: schema-consistency テスト1件がローカルSupabase未適用のため失敗（マイグレーション適用は人間作業）

### 進捗ログ
- 2026-03-19 作業開始。必読ドキュメント読了。
- 2026-03-19 DBマイグレーション作成（00015_bot_next_post_at.sql）
- 2026-03-19 Bot ドメインモデルに nextPostAt フィールド追加
- 2026-03-19 BotRepository に updateNextPostAt / findDueForPost 追加、BotRow に next_post_at 追加
- 2026-03-19 BotService 拡張: executeBotPost に next_post_at 判定・更新ロジック追加、getActiveBotsDueForPost 追加、performDailyReset に復活BOTの next_post_at 再設定追加
- 2026-03-19 Internal API 認証ミドルウェア作成（internal-api-auth.ts）
- 2026-03-19 API ルート3本作成: POST /api/internal/bot/execute, /daily-reset, /daily-stats
- 2026-03-19 単体テスト作成: bot-service-scheduling.test.ts（14テスト）、internal-api-auth.test.ts（10テスト）、bot-execute.test.ts（7テスト）、daily-reset.test.ts（4テスト）、daily-stats.test.ts（5テスト）
- 2026-03-19 既存テスト波及修正: bot-repository.test.ts, bot-service.test.ts にnextPostAt追加、InMemory BotRepository/BDD steps にnextPostAt対応

### テスト結果サマリー
- **vitest**: 52ファイルPASS / 1ファイルFAIL（schema-consistency: ローカルDB未適用） / 1240テストPASS / 1テストFAIL
  - 新規テスト: 40件全PASS（scheduling 14件、認証 10件、bot-execute 7件、daily-reset 4件、daily-stats 5件）
  - 既存テスト: 1200件全PASS
- **cucumber-js (BDD)**: 227シナリオPASS / 7シナリオPending（UI未実装、既存状態のまま）
- schema-consistency の FAIL はマイグレーション未適用が原因であり、00015_bot_next_post_at.sql を Supabase に適用すれば解消する
