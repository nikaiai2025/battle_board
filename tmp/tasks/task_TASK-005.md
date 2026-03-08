---
task_id: TASK-005
sprint_id: Sprint-3
status: completed
assigned_to: bdd-coding
depends_on: [TASK-002, TASK-003]
created_at: 2026-03-08T21:00:00+09:00
updated_at: 2026-03-08T21:00:00+09:00
locked_files:
  - "[NEW] src/lib/infrastructure/repositories/bot-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/bot-post-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/accusation-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/incentive-log-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/auth-code-repository.ts"
---

## タスク概要
Phase 1 Step 3 (後半) — ゲーム・認証系リポジトリ5つを実装する。
Supabaseクライアント経由でDBにアクセスし、ドメインモデル型との変換を行う。
bot-post-repository は RLS で完全保護されたテーブルへのアクセスであり、service_role 必須。

## 対象BDDシナリオ
- なし（リポジトリ単体はBDDシナリオの直接対象外）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/architecture.md` — §4.2 テーブル定義（bots, bot_posts, accusations, incentive_logs, auth_codes）
2. [必須] `docs/architecture/architecture.md` — §10.1.1 RLSポリシー設計（bot_posts, bots, auth_codes は DENY ALL）
3. [必須] `docs/architecture/architecture.md` — §7.2 同時実行制御（incentive_logs の ON CONFLICT DO NOTHING）
4. [必須] `supabase/migrations/00001_create_tables.sql` — 実テーブル定義
5. [必須] `src/lib/domain/models/bot.ts` — Bot型
6. [必須] `src/lib/domain/models/accusation.ts` — Accusation型
7. [必須] `src/lib/domain/models/incentive.ts` — IncentiveLog型、IncentiveEventType
8. [必須] `src/lib/infrastructure/supabase/client.ts` — supabaseAdmin

## 入力（前工程の成果物）
- `supabase/migrations/00001_create_tables.sql` — テーブル定義（TASK-002）
- `src/lib/domain/models/*.ts` — ドメインモデル型定義（TASK-003）

## 出力（生成すべきファイル）

### `src/lib/infrastructure/repositories/bot-repository.ts`
- `findById(id: string): Promise<Bot | null>`
- `findActive(): Promise<Bot[]>` — is_active = true
- `create(bot: Omit<Bot, 'id' | 'createdAt' | 'survivalDays' | 'totalPosts' | 'accusedCount' | 'eliminatedAt' | 'eliminatedBy'>): Promise<Bot>`
- `updateHp(botId: string, hp: number): Promise<void>`
- `updateDailyId(botId: string, dailyId: string, dailyIdDate: string): Promise<void>`
- `reveal(botId: string): Promise<void>` — is_revealed = true, revealed_at = now()
- `unreveal(botId: string): Promise<void>` — is_revealed = false, revealed_at = null
- `eliminate(botId: string, eliminatedBy: string): Promise<void>` — is_active = false, eliminated_at = now(), eliminated_by = eliminatedBy
- `incrementTotalPosts(botId: string): Promise<void>`
- `incrementAccusedCount(botId: string): Promise<void>`
- `incrementSurvivalDays(botId: string): Promise<void>`

### `src/lib/infrastructure/repositories/bot-post-repository.ts`
- `create(postId: string, botId: string): Promise<void>`
- `findByPostId(postId: string): Promise<{ postId: string; botId: string } | null>` — !tell判定用
- `findByBotId(botId: string): Promise<{ postId: string; botId: string }[]>`

### `src/lib/infrastructure/repositories/accusation-repository.ts`
- `create(accusation: Omit<Accusation, 'id' | 'createdAt'>): Promise<Accusation>`
- `findByAccuserAndTarget(accuserId: string, targetPostId: string): Promise<Accusation | null>` — 重複チェック用
- `findByThreadId(threadId: string): Promise<Accusation[]>`

### `src/lib/infrastructure/repositories/incentive-log-repository.ts`
- `create(log: Omit<IncentiveLog, 'id' | 'createdAt'>): Promise<IncentiveLog | null>` — `ON CONFLICT (user_id, event_type, context_date) DO NOTHING` で冪等性担保。INSERT成功時はログを返し、重複時はnullを返す
- `findByUserIdAndDate(userId: string, contextDate: string): Promise<IncentiveLog[]>`
- `findByUserId(userId: string, options?: { limit?: number }): Promise<IncentiveLog[]>`

### `src/lib/infrastructure/repositories/auth-code-repository.ts`
- `create(authCode: Omit<AuthCode, 'id' | 'createdAt'>): Promise<AuthCode>` — ※ AuthCode型はこのファイル内で定義する（models/に対応型がないため）
- `findByCode(code: string): Promise<AuthCode | null>`
- `findByTokenId(tokenId: string): Promise<AuthCode | null>`
- `markVerified(id: string): Promise<void>` — verified = true
- `deleteExpired(): Promise<number>` — expires_at < now() を削除、削除件数を返す

AuthCode型（リポジトリ内で定義）:
```typescript
export interface AuthCode {
  id: string;
  code: string;
  tokenId: string;
  ipHash: string;
  verified: boolean;
  expiresAt: Date;
  createdAt: Date;
}
```

## 完了条件
- [ ] 5つのリポジトリファイルが作成されている
- [ ] 各リポジトリが上記のメソッドを公開している
- [ ] `supabaseAdmin` を使用している（service_role経由。RLSバイパス必須）
- [ ] incentive-log-repository の `create` が `ON CONFLICT DO NOTHING` を使用している
- [ ] DBカラム名（snake_case）とドメインモデル（camelCase）の変換が正しい
- [ ] テストコマンド: `npx vitest run` で既存テスト（164件）が壊れていないこと

## スコープ外
- サービス層の実装
- BDDシナリオのステップ定義
- リポジトリの単体テスト（DB接続必要のためスキップ）
- TASK-004 の対象リポジトリ（thread, post, user, currency）

## 補足・制約
- bot_posts, bots, auth_codes は RLS で anon/authenticated を全拒否しているため、必ず `supabaseAdmin`（service_role）を使用すること
- カラム名変換: DB側 `snake_case` ↔ アプリ側 `camelCase`。TASK-004と共通のヘルパーが既に作成されている場合はそれを利用してよい
- `incentive_logs` の INSERT は `ON CONFLICT DO NOTHING` で冪等性を担保する（§7.2）
- auth-code-repository の AuthCode 型はリポジトリファイル内で定義する（ドメインモデルにAuthCode型が存在しないため）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 5リポジトリファイル全て作成、既存テスト164件PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

2026-03-08 作業開始

1. タスク指示書 読み込み完了
2. 必読ドキュメント参照完了:
   - docs/architecture/architecture.md §4.2, §7.2, §10.1.1
   - supabase/migrations/00001_create_tables.sql
   - src/lib/domain/models/bot.ts, accusation.ts, incentive.ts
   - src/lib/infrastructure/supabase/client.ts
3. 5ファイル作成完了:
   - src/lib/infrastructure/repositories/bot-repository.ts
   - src/lib/infrastructure/repositories/bot-post-repository.ts
   - src/lib/infrastructure/repositories/accusation-repository.ts
   - src/lib/infrastructure/repositories/incentive-log-repository.ts
   - src/lib/infrastructure/repositories/auth-code-repository.ts

### テスト結果サマリー

npx vitest run 実行結果:
- Test Files: 4 passed (4)
- Tests: 164 passed (164)
- 既存テスト全件 PASS、新規リポジトリファイルによる影響なし
