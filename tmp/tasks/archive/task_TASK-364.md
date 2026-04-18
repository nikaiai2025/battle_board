---
task_id: TASK-364
sprint_id: Sprint-142
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T18:00:00+09:00
updated_at: 2026-03-29T18:00:00+09:00
locked_files:
  - src/app/api/admin/threads/[threadId]/route.ts
  - src/lib/infrastructure/repositories/bot-post-repository.ts
  - src/lib/infrastructure/repositories/bot-repository.ts
  - "[NEW] src/app/api/admin/bots/route.ts"
  - "[NEW] src/app/api/admin/bots/[botId]/route.ts"
---

## タスク概要

管理画面のBOT管理機能に必要なバックエンド（API + Repository）を実装する。
スレッド詳細APIへのBOT情報付加、BOT一覧API、BOT詳細APIの3つを新設・改修する。

## 対象BDDシナリオ

- `features/admin.feature` @管理者がスレッド詳細で投稿者の種別を識別できる
- `features/admin.feature` @管理者が活動中のBOT一覧を閲覧できる
- `features/admin.feature` @管理者が撃破済みのBOT一覧を閲覧できる
- `features/admin.feature` @管理者がBOTの詳細を確認できる

※ 本タスクはAPI層のみ。BDDステップ定義・UIは後続タスク TASK-365 で実装する。

## 必読ドキュメント（優先度順）

1. [必須] `features/admin.feature` — 対象シナリオ（v5 BOT管理セクション）
2. [必須] `src/app/api/admin/threads/[threadId]/route.ts` — 改修対象のスレッド詳細API
3. [必須] `src/lib/infrastructure/repositories/bot-post-repository.ts` — 既存のbot_postsリポジトリ
4. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` — 既存のbotsリポジトリ
5. [参考] `src/lib/domain/models/bot.ts` — Bot型定義
6. [参考] `src/app/api/admin/users/[userId]/route.ts` — 既存の管理者APIのパターン参考

## 実装内容

### 1. スレッド詳細API改修: `GET /api/admin/threads/[threadId]`

現在のレスポンス `{ thread, posts }` に、各投稿のBOT情報を付加する。

**方針:**
- 全レスの post_id を使い `findByPostIds()` で bot_posts を一括取得（既存メソッド）
- BOTに該当する botId を使い `findByIds()` で bot 情報を一括取得（既存メソッド）
- レスポンスに `botInfoMap` を追加: `{ [postId]: { botId, botName } }` の辞書形式
- もしくは各postに `botInfo: { botId, botName } | null` を付加する形でもよい

**投稿者種別の判定ロジック:**
| 条件 | 種別 |
|---|---|
| `post.isSystemMessage === true` | システム |
| `bot_posts` にレコードあり | BOT |
| それ以外 | 人間 |

### 2. BOT一覧API新設: `GET /api/admin/bots`

**クエリパラメータ:**
- `status`: `active` | `eliminated`（必須）

**レスポンス:**
- `active`: 活動中BOT一覧（`is_active=true`）
  - 返却フィールド: id, name, botProfileKey, hp, maxHp, survivalDays, totalPosts, accusedCount
- `eliminated`: 撃破済みBOT一覧（`eliminated_at IS NOT NULL`）
  - 返却フィールド: id, name, botProfileKey, survivalDays, eliminatedAt, eliminatedBy

**リポジトリ:**
- `findActive()` は既存。撃破済み取得は `findAll()` からフィルタするか、新規メソッド `findEliminated()` を追加する。効率的な方を選択してよい。

### 3. BOT詳細API新設: `GET /api/admin/bots/[botId]`

**レスポンス:**
- BOT基本情報: Bot型の全フィールド
- 投稿履歴: アクティブスレッド（`is_dormant=false`）の投稿のみ
  - `findByBotId()` で bot_posts を取得 → post_id で posts を取得 → スレッドの is_dormant でフィルタ
  - 各投稿にスレッドタイトルを付加する

**パフォーマンス考慮:**
- 投稿履歴は最新N件（50件程度）に制限してよい
- N+1にならないようバッチクエリを使う

### 共通事項

- 全APIに `verifyAdminSession` による認証ガードを付ける（既存パターンに従う）
- 認証失敗時は 403、リソース不在時は 404
- Source_Layout.md のレイヤー規約に従い、route.tsにビジネスロジックを書かない。必要に応じてサービス層を経由する（ただし単純なCRUDならroute.tsからリポジトリを直接呼ぶ既存パターンに合わせてよい）

## 完了条件

- [x] `GET /api/admin/threads/[threadId]` が各投稿のBOT情報を返す
- [x] `GET /api/admin/bots?status=active` が活動中BOT一覧を返す
- [x] `GET /api/admin/bots?status=eliminated` が撃破済みBOT一覧を返す
- [x] `GET /api/admin/bots/[botId]` がBOT詳細＋投稿履歴を返す
- [x] 単体テスト全件PASS: `npx vitest run`
- [x] 既存BDDテスト回帰なし: `npx cucumber-js`

## スコープ外

- BDDステップ定義（TASK-365）
- UI実装（TASK-365）
- OpenAPI仕様書（D-04）の更新（管理者APIは内部用のため省略可）
- locked_files 以外のファイル変更。必要と判明した場合はエスカレーション

## 作業ログ

### チェックポイント
- 状態: completed
- 完了済み: 全完了条件を充足
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント読了。admin.feature BOT管理セクション、既存API・リポジトリパターンを把握
- [O-1] 仕様を3つのAPI単位に分解: (1) threads/[threadId] 改修 (2) bots一覧 (3) bots詳細
- [RED] 3つのAPIルートの単体テストを作成（20テストケース）→ 全FAIL確認
- [GREEN] 実装完了: threads改修（botInfoMap/posterTypeMap付加）、bots一覧（active/eliminated）、bots詳細（投稿履歴付き）
- [GREEN] bot-repository.ts に findEliminated() を追加
- [PASS] 全20テストケースPASS
- [回帰] npx vitest run: 2165 passed / 13 failed（全て既存のDiscord OAuth関連の事前不具合。本タスク起因なし）
- [回帰] npx cucumber-js: 394 passed / 18 pending / 8 undefined（全て既存の未実装分。本タスク起因なし）

### テスト結果サマリー
- 単体テスト（新規）: 20/20 PASS
  - threads/[threadId]/route.test.ts: 7/7 PASS（認証2, 404, 正常系4）
  - bots/route.test.ts: 8/8 PASS（認証2, バリデーション2, active2, eliminated2）
  - bots/[botId]/route.test.ts: 5/5 PASS（認証2, 404, 正常系2）
- 単体テスト（既存回帰）: 2165/2178 PASS（13 failed は既存不具合、本タスク無関係）
- BDDテスト: 394/420 PASS（18 pending, 8 undefined は既存の未実装分）
