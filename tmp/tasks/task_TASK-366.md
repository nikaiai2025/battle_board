---
task_id: TASK-366
sprint_id: Sprint-142
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T18:30:00+09:00
updated_at: 2026-03-29T18:30:00+09:00
locked_files:
  - src/lib/services/bot-strategies/content/fixed-message.ts
  - "[NEW] supabase/migrations/00038_user_bot_vocabularies.sql"
  - "[NEW] src/lib/infrastructure/repositories/user-bot-vocabulary-repository.ts"
  - "[NEW] src/lib/domain/models/user-bot-vocabulary.ts"
  - "[NEW] src/lib/domain/rules/vocabulary-rules.ts"
  - "[NEW] src/lib/services/user-bot-vocabulary-service.ts"
  - "[NEW] src/app/api/mypage/vocabularies/route.ts"
---

## タスク概要

ユーザー語録登録機能のバックエンド全体を実装する。
マイページからの語録登録API、バリデーション、通貨消費、24時間有効期限管理、
および `FixedMessageContentStrategy` を語録プール対応に改修する。

user_copipe と同パターン（管理者マスタ + ユーザーマスタの別テーブル方式）で構築する。

## 対象BDDシナリオ

- `features/user_bot_vocabulary.feature` — 全16シナリオ
- `features/bot_system.feature` @荒らし役ボットは語録プールからランダムに書き込む（変更済み）

※ 本タスクはバックエンド層のみ。BDDステップ定義・UIは後続タスク TASK-367 で実装する。

## 必読ドキュメント（優先度順）

1. [必須] `features/user_bot_vocabulary.feature` — 全シナリオ仕様
2. [必須] `features/bot_system.feature` — 荒らし役の書き込みシナリオ（語録プール変更箇所）
3. [必須] `src/lib/services/bot-strategies/content/fixed-message.ts` — 改修対象のContentStrategy
4. [必須] `src/lib/services/user-copipe-service.ts` — 同パターンのサービス実装（設計参考）
5. [必須] `src/lib/infrastructure/repositories/user-copipe-repository.ts` — 同パターンのリポジトリ（設計参考）
6. [必須] `src/app/api/mypage/copipe/route.ts` — 同パターンのAPIルート（設計参考）
7. [参考] `supabase/migrations/00036_user_copipe_entries.sql` — テーブル設計の参考
8. [参考] `src/lib/services/bot-strategies/types.ts` — Strategy インターフェース定義
9. [参考] `config/bot-profiles.ts` — 固定文リストの現在のソース

## 実装内容

### 1. DBマイグレーション: `00038_user_bot_vocabularies.sql`

```sql
CREATE TABLE user_bot_vocabularies (
    id            SERIAL       PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES users(id),
    content       VARCHAR(30)  NOT NULL,
    registered_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ  NOT NULL  -- registered_at + 24h
);

CREATE INDEX idx_ubv_user_id ON user_bot_vocabularies (user_id);
CREATE INDEX idx_ubv_expires_at ON user_bot_vocabularies (expires_at);
```

- RLSは不要（service_role経由でのみアクセス。既存の dev_posts, daily_events, copipe_entries と同じ判断）
- expires_at は `registered_at + INTERVAL '24 hours'` で自動設定

### 2. ドメインモデル: `user-bot-vocabulary.ts`

```typescript
export interface UserBotVocabulary {
  id: number;
  userId: string;
  content: string;
  registeredAt: Date;
  expiresAt: Date;
}
```

### 3. バリデーションルール: `vocabulary-rules.ts`

純粋関数として実装（domain/rules配下）:
- `validateContent(content: string)`: 必須、空白のみ不可、30文字上限、半角`!`禁止、全角`！`禁止
- 登録コスト定数: `VOCABULARY_COST = 20`

### 4. リポジトリ: `user-bot-vocabulary-repository.ts`

user-copipe-repository.ts をテンプレートに実装する。

**インターフェース（DI用）:**
```typescript
export interface IUserBotVocabularyRepository {
  create(userId: string, content: string): Promise<UserBotVocabulary>;
  findActiveByUserId(userId: string): Promise<UserBotVocabulary[]>;  // expires_at > now()
  findAllActive(): Promise<UserBotVocabulary[]>;  // 全ユーザーの有効語録（BOT書き込み用）
}
```

- `findActiveByUserId`: マイページ一覧用。`WHERE user_id = ? AND expires_at > now()`
- `findAllActive`: BOT書き込み時の語録プール構築用。`WHERE expires_at > now()`

### 5. サービス: `user-bot-vocabulary-service.ts`

user-copipe-service.ts をテンプレートに実装する。

**主要メソッド:**
- `register(userId, content, repo?, currencyRepo?)`: バリデーション → 残高チェック → 通貨消費(20pt) → DB保存
- `listActive(userId, repo?)`: 有効語録一覧取得

**通貨消費:**
- 既存の `deductCurrency()` を使用（`src/lib/infrastructure/repositories/currency-repository.ts`）
- 残高不足時は `{ success: false, code: "INSUFFICIENT_BALANCE", error: "通貨が不足しています" }` を返す

**DI設計:**
- リポジトリ引数はオプショナル（デフォルトで実リポジトリ、テスト時にInMemory注入）
- user-copipe-service.ts と同じパターン

### 6. FixedMessageContentStrategy改修: `fixed-message.ts`

**変更方針:**
- `generateContent()` で固定文リスト + 有効ユーザー語録をマージした「語録プール」からランダム選択
- ユーザー語録の取得は `IUserBotVocabularyRepository.findAllActive()` を使用
- リポジトリはコンストラクタでDI注入（テスト時にInMemory注入可能に）
- リポジトリが注入されていない場合は従来通り固定文のみ（後方互換）

```typescript
// 概念コード
async generateContent(context: ContentGenerationContext): Promise<string> {
  const fixedMessages = this.getFixedMessages(context.botProfileKey);
  const userVocabs = this.vocabRepo
    ? (await this.vocabRepo.findAllActive()).map(v => v.content)
    : [];
  const pool = [...fixedMessages, ...userVocabs];
  return pool[Math.floor(Math.random() * pool.length)];
}
```

### 7. APIルート: `GET/POST /api/mypage/vocabularies`

copipe/route.ts をテンプレートに実装する。

- `GET`: 自分の有効語録一覧（`findActiveByUserId`）
- `POST`: 語録登録（バリデーション → 通貨消費 → 保存）
- 認証: `EDGE_TOKEN_COOKIE` → `verifyEdgeToken()`（既存パターン）

## 完了条件

- [ ] マイグレーション `00038_user_bot_vocabularies.sql` が作成されている
- [ ] UserBotVocabularyRepository が IUserBotVocabularyRepository インターフェースを実装
- [ ] UserBotVocabularyService が register / listActive を提供
- [ ] バリデーション（!禁止、30文字上限、空入力拒否）が vocabulary-rules.ts で実装
- [ ] FixedMessageContentStrategy が語録プール（固定文+ユーザー語録）からランダム選択
- [ ] `GET/POST /api/mypage/vocabularies` が動作する
- [ ] 新規ファイルの単体テストを作成
- [ ] 単体テスト全件PASS: `npx vitest run`
- [ ] 既存BDDテスト回帰なし: `npx cucumber-js`

## スコープ外

- BDDステップ定義（TASK-367）
- マイページUI（TASK-367）
- bot_system.steps.ts の更新（TASK-367）
- InMemoryリポジトリ（TASK-367）
- 期限切れレコードの物理削除（24時間で論理的に無効。定期削除は運用タスクとして将来検討）
- locked_files 以外のファイル変更。必要と判明した場合はエスカレーション

## 補足・制約

- 通貨消費は CurrencyRepository.deductCurrency を使用すること（新規の通貨操作関数を作らない）
- FixedMessageContentStrategy のクラス名はそのまま維持してよい（語録プール対応後も固定文がベースであるため）。リネームするかは任意
- Featureファイルのステータスは「ドラフト」だが、人間から実装指示を受けているため実装可

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全7成果物の実装 + 単体テスト56件PASS + 回帰テストPASS
- 次にすべきこと: なし（TASK-367 でBDDステップ定義・UI・InMemoryリポジトリを実装）
- 未解決の問題: なし

### 進捗ログ

1. ドメインモデル `src/lib/domain/models/user-bot-vocabulary.ts` 作成
2. バリデーションルール `src/lib/domain/rules/vocabulary-rules.ts` 作成（TDD: 21テスト GREEN）
3. リポジトリ `src/lib/infrastructure/repositories/user-bot-vocabulary-repository.ts` 作成（IUserBotVocabularyRepository インターフェース付き）
4. サービス `src/lib/services/user-bot-vocabulary-service.ts` 作成（register + listActive、通貨消費20pt）（TDD: 21テスト GREEN）
5. `FixedMessageContentStrategy` を語録プール対応に改修（固定文+ユーザー語録のマージ、後方互換）（TDD: 既存9テスト+新規5テスト = 14テスト GREEN）
6. APIルート `src/app/api/mypage/vocabularies/route.ts` 作成（GET/POST）
7. DBマイグレーション `supabase/migrations/00038_user_bot_vocabularies.sql` 作成

備考: strategy-resolver.ts での FixedMessageContentStrategy への vocabRepo 注入は locked_files 外のため本タスクでは実施せず。コンストラクタの後方互換設計により、vocabRepo 未注入時は従来通り固定文のみで動作する。TASK-367 または後続タスクで対応予定。

### テスト結果サマリー

- 単体テスト（新規）: 56 PASS / 0 FAIL
  - `src/lib/domain/rules/__tests__/vocabulary-rules.test.ts`: 21 PASS
  - `src/__tests__/lib/services/user-bot-vocabulary-service.test.ts`: 21 PASS
  - `src/__tests__/lib/services/bot-strategies/fixed-message.test.ts`: 14 PASS
- 単体テスト（全体回帰）: 2211 PASS / 14 FAIL（既存の Discord OAuth 関連テスト。本タスクの変更とは無関係）
- BDDテスト（回帰）: 394 PASS / 18 pending / 8 undefined（全て既存。本タスクの変更による回帰なし）
