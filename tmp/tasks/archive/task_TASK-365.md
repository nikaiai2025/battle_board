---
task_id: TASK-365
sprint_id: Sprint-142
status: completed
assigned_to: bdd-coding
depends_on: [TASK-364]
created_at: 2026-03-29T18:00:00+09:00
updated_at: 2026-03-29T18:00:00+09:00
locked_files:
  - src/app/(admin)/admin/threads/page.tsx
  - src/app/(admin)/admin/layout.tsx
  - features/step_definitions/admin.steps.ts
  - features/support/in-memory/bot-repository.ts
  - features/support/in-memory/bot-post-repository.ts
  - "[NEW] src/app/(admin)/admin/bots/page.tsx"
  - "[NEW] src/app/(admin)/admin/bots/[botId]/page.tsx"
---

## タスク概要

管理画面のBOT管理機能のUI（スレッド詳細BOTバッジ、BOT一覧、BOT詳細）と、
admin.feature v5 BOT管理シナリオ4件のBDDステップ定義を実装する。
TASK-364で作成済みのAPIを呼び出すフロントエンドを構築する。

## 対象BDDシナリオ

- `features/admin.feature` @管理者がスレッド詳細で投稿者の種別を識別できる
- `features/admin.feature` @管理者が活動中のBOT一覧を閲覧できる
- `features/admin.feature` @管理者が撃破済みのBOT一覧を閲覧できる
- `features/admin.feature` @管理者がBOTの詳細を確認できる

## 必読ドキュメント（優先度順）

1. [必須] `features/admin.feature` — 対象シナリオ（v5 BOT管理セクション）
2. [必須] `src/app/(admin)/admin/threads/page.tsx` — 改修対象のスレッド詳細UI
3. [必須] `src/app/(admin)/admin/layout.tsx` — ナビゲーション追加対象
4. [必須] `features/step_definitions/admin.steps.ts` — 既存ステップ定義（追記先）
5. [必須] `features/support/in-memory/bot-repository.ts` — InMemory BOTリポジトリ
6. [必須] `features/support/in-memory/bot-post-repository.ts` — InMemory BOT投稿リポジトリ
7. [参考] `src/app/(admin)/admin/users/page.tsx` — 既存の管理者UIパターン参考
8. [参考] `src/app/(admin)/admin/users/[userId]/page.tsx` — 詳細画面のパターン参考
9. [参考] TASK-364の成果物 — API実装（レスポンス形式の確認）

## 入力（前工程の成果物）

- TASK-364で実装済みのAPI:
  - `GET /api/admin/threads/[threadId]` — BOT情報付きレスポンス
  - `GET /api/admin/bots?status=active|eliminated` — BOT一覧
  - `GET /api/admin/bots/[botId]` — BOT詳細+投稿履歴

## 実装内容

### 1. スレッド詳細UI改修: `threads/page.tsx`

レス一覧テーブルに投稿者種別の表示を追加する。

- 各投稿行に種別バッジを表示:
  - 人間: 表示なし or 控えめなバッジ（既存デザインを崩さない）
  - BOT: 🤖 バッジ + BOT名 + BOT詳細リンク（`/admin/bots/[botId]`）
  - システム: ★ バッジ（既存の isSystemMessage を利用）
- TASK-364のAPIレスポンスから `botInfoMap` を取得して表示に反映

### 2. BOT一覧ページ新設: `/admin/bots`

既存の管理者ページ（`users/page.tsx` 等）のパターンに合わせて実装する。

- Client Component
- 「活動中」「撃破済み」の切り替えタブ or ボタン
- テーブル表示:
  - 活動中: 名前、プロファイル、HP/最大HP、生存日数、投稿数、告発回数
  - 撃破済み: 名前、プロファイル、生存日数、撃破日時、撃破者
- 各行からBOT詳細（`/admin/bots/[botId]`）へのリンク

### 3. BOT詳細ページ新設: `/admin/bots/[botId]`

- BOT基本情報表示（稼働状態・統計）
- 投稿履歴テーブル（アクティブスレッドの投稿のみ。APIが休眠除外済み）
  - 各投稿: スレッド名、本文（先頭50文字）、投稿日時
  - スレッド名からスレッド詳細（`/admin/threads?selected=[threadId]`）へのリンク

### 4. ナビゲーション更新: `layout.tsx`

`NAV_LINKS` に BOT管理を追加:
```typescript
{ href: "/admin/bots", label: "BOT管理" }
```

### 5. BDDステップ定義: `admin.steps.ts`

4シナリオ分のステップ定義を追加。InMemoryリポジトリを使用したサービス層テスト。

**必要なInMemoryリポジトリ拡張:**
- `bot-repository.ts`: 撃破済みBOT取得（`findEliminated` 相当）が必要なら追加
- `bot-post-repository.ts`: `findByPostIds` が未実装なら追加

**ステップ実装方針:**
- Given: InMemoryリポジトリにBOT・投稿データをセットアップ
- When: サービス層 or リポジトリ層を直接呼び出してデータ取得
- Then: 取得結果のアサーション

## 完了条件

- [ ] スレッド詳細にBOT/人間/システムバッジが表示される
- [ ] BOT一覧ページで活動中/撃破済みを切り替えて閲覧できる
- [ ] BOT詳細ページで稼働状態・統計・投稿履歴が表示される
- [ ] admin.feature BOT管理シナリオ4件すべてのステップ定義が実装済み
- [ ] BDDテスト全件PASS: `npx cucumber-js`
- [ ] 単体テスト回帰なし: `npx vitest run`

## スコープ外

- API実装（TASK-364で完了済み）
- locked_files 以外のファイル変更。必要と判明した場合はエスカレーション

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全6項目
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. InMemory bot-repository に `findEliminated` / `findByIds` を追加
2. admin.steps.ts に BOT管理4シナリオのステップ定義を追加（import に InMemoryBotRepo, InMemoryBotPostRepo を追加）
3. layout.tsx の NAV_LINKS に `{ href: "/admin/bots", label: "BOT管理" }` を追加
4. threads/page.tsx にBOT/人間/システム種別バッジ列を追加（posterTypeMap, botInfoMap をAPIから取得）
5. bots/page.tsx 新設: 活動中/撃破済み切り替えタブ付きBOT一覧
6. bots/[botId]/page.tsx 新設: BOT基本情報 + 投稿履歴（アクティブスレッドのみ）
7. Cucumber ステップ定義で `HP/最大HP` の `/` エスケープ問題を修正

### テスト結果サマリー

**BDD テスト (`npx cucumber-js`):**
- 420 scenarios: 399 passed, 18 pending, 3 undefined (pre-existing)
- 2277 steps: 2208 passed, 21 pending, 42 skipped, 6 undefined (pre-existing)
- 対象4シナリオすべてPASS:
  - 管理者がスレッド詳細で投稿者の種別を識別できる: PASS
  - 管理者が活動中のBOT一覧を閲覧できる: PASS
  - 管理者が撃破済みのBOT一覧を閲覧できる: PASS
  - 管理者がBOTの詳細を確認できる: PASS

**単体テスト (`npx vitest run`):**
- 116 files: 111 passed, 5 failed (pre-existing: schema-consistency, registration-service, auth/callback)
- 2225 tests: 2211 passed, 14 failed (pre-existing)
- 管理画面/BOT関連の回帰なし
