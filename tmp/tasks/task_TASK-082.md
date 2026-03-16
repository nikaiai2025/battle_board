---
task_id: TASK-082
sprint_id: Sprint-29
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T16:00:00+09:00
updated_at: 2026-03-16T16:00:00+09:00
locked_files:
  - "e2e/basic-flow.spec.ts"
  - "[NEW] e2e/smoke/navigation.spec.ts"
  - "playwright.config.ts"
---

## タスク概要

E2Eナビゲーションスモークテストを新規作成し、既存の basic-flow.spec.ts をリファクタリングして全体を統合する。全ページの到達性・UI要素存在・JSエラー検出・リンク操作可能性を検証する。

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/bdd_test_strategy.md` §10 — E2Eテスト方針（§10.5 ナビゲーションスモークテスト）
2. [必須] `e2e/basic-flow.spec.ts` — 既存E2Eテスト（ヘルパー関数を参考・共有化）
3. [必須] `playwright.config.ts` — Playwright設定
4. [参考] 全ページの page.tsx — UI要素のIDを確認

## 対象ページ一覧

| # | ルート | ファイル | 認証 | 主要UI要素（確認用ID） |
|---|---|---|---|---|
| 1 | `/` | `src/app/(web)/page.tsx` | 不要 | `#thread-create-form`, ThreadList表示 |
| 2 | `/threads/[threadId]` | `src/app/(web)/threads/[threadId]/page.tsx` | 不要 | `#thread-title`, `#post-1`, `#post-body-input` |
| 3 | `/mypage` | `src/app/(web)/mypage/page.tsx` | 必要 | マイページ固有の要素 |
| 4 | `/auth/verify` | `src/app/(web)/auth/verify/page.tsx` | 不要 | 認証フォーム要素 |

## 出力（生成・変更すべきファイル）

### 1. `e2e/smoke/navigation.spec.ts` — ナビゲーションスモークテスト（新規）

§10.5 に準拠した全ページのスモークテスト。以下を各ページに対して検証:

**共通検証項目（全ページ）:**
- HTTPステータス200で応答する
- `page.on('pageerror')` でJSエラーが発生しない
- ページ固有のランドマーク要素が表示される

**ページ別の検証:**

**(1) トップページ `/`**
- スレッド作成フォーム（`#thread-create-form`）が存在する
- ヘッダーが表示される
- スレッド一覧領域が存在する（スレッドが0件でもエラーにならない）
- マイページへのリンクが存在し、クリック可能

**(2) スレッド詳細 `/threads/[threadId]`**
- テスト前にシードデータ（スレッド+レス）を投入
- スレッドタイトル（`#thread-title`）が表示される
- レス一覧（`#post-1`）が表示される
- 書き込みフォーム（`#post-body-input`）が存在する
- トップへの戻りリンクが存在し、クリック可能

**(3) マイページ `/mypage`**
- 認証が必要なため、テスト内で事前に認証を完了させる
- マイページの主要UI要素が表示される（通貨残高表示等）
- トップへの戻りリンクが存在する

**(4) 認証コード検証ページ `/auth/verify`**
- ページにアクセスできる
- 認証関連のフォームまたはメッセージが表示される

**実装の注意点:**
- JSエラー検出: `test.beforeEach` で `page.on('pageerror', ...)` を設定し、テスト終了時にエラーがなかったことを assert
- Turnstileモック: basic-flow.spec.ts の `mockTurnstile()` を再利用（共有ヘルパーとして切り出すか、同一パターンをコピー）
- DBクリーンアップ: basic-flow.spec.ts の `cleanupDatabase()` を再利用
- 動的ルート用のシードデータ投入: Supabase REST API で直接 INSERT

### 2. `e2e/basic-flow.spec.ts` — リファクタリング

共通ヘルパー関数（mockTurnstile, cleanupDatabase, completeAuth）を外部ファイルに切り出すことを推奨する。ただし、切り出しが困難な場合は各specファイルにコピーしてもよい。

切り出す場合の配置先:
```
e2e/
  helpers/
    turnstile.ts     # mockTurnstile()
    database.ts      # cleanupDatabase()
    auth.ts          # completeAuth(), waitForTurnstileAndEnableButton()
  basic-flow.spec.ts
  smoke/
    navigation.spec.ts
```

既存テストの振る舞いは変えないこと（テスト内容の変更は不可、リファクタリングのみ）。

### 3. `playwright.config.ts` — 必要に応じて更新

- `e2e` プロジェクトの testIgnore に `**/smoke/**` を追加（スモークテストを分離実行可能にする場合）
- または `smoke` プロジェクトを追加して独立実行可能にする
- 判断はコーダーに委ねるが、`npx playwright test` で全テスト実行、`npx playwright test --project=smoke` でスモークのみ実行できるのが理想

## 完了条件
- [ ] `e2e/smoke/navigation.spec.ts` が作成されている
- [ ] 全4ページの到達性・JSエラーなし・主要UI要素の存在が検証されている
- [ ] 共通ヘルパーが切り出しまたはコピーされている
- [ ] 既存 basic-flow.spec.ts が回帰なく動作する
- [ ] テストコマンド: `npx playwright test --project=e2e` および `npx playwright test --project=smoke`（またはプロジェクト構成に応じたコマンド）
- [ ] TypeScriptビルド: `npx tsc --noEmit`

**重要: E2Eテスト実行にはSupabase LocalとNext.js devサーバーが必要です。**
以下のコマンドで事前に起動されているか確認してください:
- Supabase: `npx supabase status`（起動していなければ `npx supabase start`）
- Next.js: playwright.config.ts の webServer 設定により自動起動される

## スコープ外
- APIテスト（e2e/api/）の変更
- CF Smokeテスト（e2e/cf-smoke/）の変更
- features/ 配下の変更
- src/ 配下のプロダクションコードの変更

## 補足・制約
- Supabase Localが起動していない場合、テストは失敗する。エスカレーションせず、テスト前にSupabaseの起動確認を行うこと
- auth/verify ページの詳細なUI要素が不明な場合は、最低限アクセス可能（200応答）であることを確認すればよい
- mypageは認証必須。basic-flow.spec.ts の認証ヘルパーを使用して事前認証する

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] Supabase Local起動確認済み（http://127.0.0.1:54321）
- [確認] basic-flow.spec.ts のヘルパー関数（mockTurnstile, cleanupDatabase, completeAuth, waitForTurnstileAndEnableButton）確認
- [確認] 各ページUI要素のID確認完了
  - トップ: #thread-create-form, #site-title
  - スレッド詳細: #thread-title, #post-1, #post-body-input, #back-to-list
  - マイページ: #account-info, #currency-balance
  - 認証ページ: #auth-verify-form, #auth-code-input, #auth-submit-btn
- [実装] e2e/helpers/turnstile.ts 作成（mockTurnstile切り出し）
- [実装] e2e/helpers/database.ts 作成（cleanupDatabase + seedThreadWithPost）
- [実装] e2e/helpers/auth.ts 作成（completeAuth + waitForTurnstileAndEnableButton切り出し）
- [実装] e2e/smoke/navigation.spec.ts 作成（8テストケース）
- [リファクタ] e2e/basic-flow.spec.ts ヘルパー共有化（振る舞いは変更なし）
- [更新] playwright.config.ts に smoke プロジェクト追加
- [トラブル] DBスキーマキャッシュ問題: migration 00005 の write_token カラムがキャッシュされていなかった
  - 対処: `npx supabase db reset` で全マイグレーション再適用 → 解消
- [トラブル] seedThreadWithPost でのINSERT失敗: board_key → board_id、created_by/thread_key が必須
  - 対処: 正しいカラム名に修正、テスト用ユーザー先行作成ロジックを追加

### テスト結果サマリー
- smoke プロジェクト: 8/8 PASS（30.7秒）
  - トップページ /: 2/2 PASS
  - スレッド詳細 /threads/[threadId]: 2/2 PASS
  - マイページ /mypage（認証必須）: 2/2 PASS
  - 認証コード検証ページ /auth/verify: 2/2 PASS
- e2e プロジェクト（既存basic-flow）: 1/1 PASS（12.0秒）
- TypeScriptビルド（npx tsc --noEmit）: エラーなし
