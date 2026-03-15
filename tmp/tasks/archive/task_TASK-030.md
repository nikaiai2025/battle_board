---
task_id: TASK-030
sprint_id: Sprint-11
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-14T10:00:00+09:00
updated_at: 2026-03-14T10:00:00+09:00
locked_files:
  - "[NEW] playwright.config.ts"
  - "[NEW] e2e/basic-flow.spec.ts"
  - "package.json"
  - "package-lock.json"
  - ".gitignore"
  - "src/app/api/threads/route.ts"
  - "src/app/api/threads/[threadId]/posts/route.ts"
  - "src/app/(web)/_components/ThreadCreateForm.tsx"
---

## タスク概要

Playwright環境をセットアップし、Phase 1の基本機能を縦断するE2Eテストを1本実装する。
「通常の掲示板として使用可能であること」を自動検証する卒業試験的なテスト。

## E2Eテストシナリオ

以下の一連フローを1テストケースで検証する:

1. トップページにアクセス → スレッド一覧ページが表示される
2. スレッド作成フォームにタイトルと本文を入力して送信
3. 未認証のため401 → AuthModalが表示される
4. AuthModalに表示された認証コードを読み取り、入力欄に入力して認証ボタンを押す
5. 認証成功 → スレッド作成がリトライされ成功する
6. 作成したスレッドが一覧に表示される
7. スレッドをクリックして開く → 本文（>>1）が表示される
8. レス書き込みフォームに本文を入力して送信（認証済みなので直接成功）
9. 書き込んだレスが表示される

## Turnstileの扱い

- クライアント側: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`を設定しない → フォールバックでCloudflare公式テストキー `1x00000000000000000000AA` が使用される（ウィジェットが自動パスする）
- サーバー側: `TURNSTILE_SECRET_KEY`を設定しない → `turnstile-client.ts`の開発環境フォールバックで常に`true`を返す
- テスト内でTurnstileウィジェットの自動パス完了を待機する必要がある（トークン発行まで数秒）

## UI要素の特定方法（実装時の参照用）

認証フロー関連:
- AuthModal: `role="dialog"` + `aria-modal="true"`
- 認証コード表示: `#auth-code-display`
- 認証コード入力: `#auth-code-input`
- 認証ボタン: `#auth-submit-btn`
- Turnstileコンテナ: `#turnstile-widget`

スレッド作成:
- タイトル入力: `#thread-title-input`
- 本文入力: `#thread-body-input`
- 送信ボタン: `#thread-submit-btn`

スレッド閲覧:
- スレッドタイトル: `#thread-title`
- レス一覧: 各レスは `.post-item` や `#post-list` 等（PostList/PostItem参照）

レス書き込み:
- 本文入力: `#post-body-input`
- 書き込みボタン: `#post-submit-btn`

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/bdd_test_strategy.md` §10 — E2Eテスト方針
2. [必須] `src/app/(web)/_components/AuthModal.tsx` — 認証モーダル実装
3. [必須] `src/app/(web)/_components/ThreadCreateForm.tsx` — スレッド作成フォーム
4. [必須] `src/app/(web)/_components/PostForm.tsx` — 書き込みフォーム
5. [参考] `src/app/(web)/page.tsx` — トップページ
6. [参考] `src/app/(web)/threads/[threadId]/page.tsx` — スレッド閲覧ページ
7. [参考] `src/lib/infrastructure/external/turnstile-client.ts` — Turnstile検証ロジック

## 出力（生成すべきファイル）

- `playwright.config.ts` — Playwright設定ファイル（webServer設定含む）
- `e2e/basic-flow.spec.ts` — 基本機能E2Eテスト
- `package.json` — devDependenciesに `@playwright/test` を追加
- `.gitignore` — Playwright関連の出力を除外追加

## 完了条件

- [ ] `npx playwright install` でブラウザがインストールされている
- [ ] `npx playwright test` で `e2e/basic-flow.spec.ts` がPASS
- [ ] テストがSupabase Local実DBに対して実行される（InMemoryではない）
- [ ] テスト実行前提: Docker + Supabase Local起動済み、`npm run dev` or `npm run build && npm start`

## 環境前提

- Supabase Localは起動済み（`npx supabase start`）
- マイグレーション適用済み
- `.env.local`にSupabase Local用のURL・キーが設定済み
- `.env.local`の`NEXT_PUBLIC_TURNSTILE_SITE_KEY`と`TURNSTILE_SECRET_KEY`は**設定しない**（テストキー自動フォールバック）

## スコープ外

- 統合テスト基盤（BDDリポジトリ切替）— 別タスク
- APIテスト — 別タスク
- 複数ブラウザでのテスト — Chromiumのみで十分
- CI統合 — 本タスクではローカル実行のみ

## 補足・制約

- `.env.local`のTurnstile関連キーがE2Eを妨害する可能性がある。Playwright設定でTurnstile環境変数を除外するか、`.env.test`を用意して対処すること
- 認証フローでは、AuthModalに**表示された認証コード**（`#auth-code-display`）をテストコードから読み取り、そのままinput欄に入力する。ハードコードしない
- 各シナリオ前にDBをクリーンアップすること（テスト間の独立性）
- page.tsxのfetchThreadsはServer Componentから内部APIを絶対URLで呼ぶ設計。`playwright.config.ts`のwebServer設定でNext.jsを起動する際にこれが正常動作することを確認

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み:
  - 必読ドキュメント・ソースコード読み込み
  - @playwright/test インストール（v1.58.2）
  - Chromium ブラウザインストール
  - dotenv インストール
  - `playwright.config.ts` 作成（webServer設定・Turnstileキー除去）
  - `e2e/basic-flow.spec.ts` 作成（基本フロー縦断テスト）
  - `package.json` に test:e2e / test:e2e:ui スクリプト追加
  - `.gitignore` に playwright-report/ / test-results/ を追加
  - ESC-TASK-030-1 解決: `src/app/api/threads/route.ts` に `authCode: result.authRequired.code` 追加
  - ESC-TASK-030-1 解決: `src/app/api/threads/[threadId]/posts/route.ts` に `authCode: result.code` 追加
  - Turnstileモック実装: `e2e/basic-flow.spec.ts` に `page.route()` でCloudflareスクリプトをモック
  - `playwright.config.ts` の `webServer.env` に `TURNSTILE_SECRET_KEY: ""` を追加（サーバー側フォールバック有効化）
  - テスト実行: 2回目 FAIL（#auth-code-display タイムアウト → APIルート修正で解消）
  - テスト実行: 3回目 FAIL（Turnstile接続エラー → モック追加で解消）
  - テスト実行: 4回目 FAIL（スレッド作成後一覧が更新されない）
- 次にすべきこと: ESC-TASK-030-2 解決後、ThreadCreateForm.tsx に router.refresh() を追加してテスト再実行
- 未解決の問題:
  - `ThreadCreateForm.tsx` でスレッド作成成功後に `router.refresh()` が呼ばれていないため、一覧が更新されない
  - `page.tsx` が `<ThreadCreateForm />` に `onCreated` を渡していない
  - `src/app/(web)/_components/ThreadCreateForm.tsx` は locked_files 外のため変更不可
  - エスカレーション ESC-TASK-030-2 を起票済み

### escalation_resolution (ESC-TASK-030-2)

**解決方針**: 選択肢A採用。`ThreadCreateForm.tsx`に`useRouter` + `router.refresh()`を追加する。

**修正内容**:
`src/app/(web)/_components/ThreadCreateForm.tsx`:
1. `import { useRouter } from 'next/navigation'` を追加
2. コンポーネント内で `const router = useRouter()` を追加
3. `submitThread()` の成功時（L57-60付近）に `router.refresh()` を追加:
```typescript
if (res.ok) {
  setTitle("");
  setBody("");
  onCreated?.();
  router.refresh();  // ← 追加: Server Componentの一覧を再フェッチ
  return true;
}
```

**判断根拠**: `PostForm.tsx`では既に同じパターンで`router.refresh()`を実装しており、`ThreadCreateForm.tsx`だけ抜けているバグ。BDDシナリオ・API仕様の変更なし。

### escalation_resolution (ESC-TASK-030-1)

**解決方針**: 選択肢A採用。APIルートのバグ修正として、401レスポンスに`authCode`を含める。

**修正対象**:
1. `src/app/api/threads/route.ts` — L138-143: `authCode: result.authRequired.code` を追加
   - `result.authRequired` は `{ code: string; edgeToken: string }` 型
2. `src/app/api/threads/[threadId]/posts/route.ts` — L117-122: `authCode: result.authCode` を追加
   - `result` は `{ authRequired: true; code: string; edgeToken: string }` 型なので `result.code` を使用

**具体的な修正**:

`src/app/api/threads/route.ts` L138-143:
```typescript
// 修正前
{ message: '認証コードを入力してください', authCodeUrl: '/auth/auth-code' }
// 修正後
{ message: '認証コードを入力してください', authCodeUrl: '/auth/auth-code', authCode: result.authRequired.code }
```

`src/app/api/threads/[threadId]/posts/route.ts` L117-122:
```typescript
// 修正前
{ message: '認証コードを入力してください', authCodeUrl: '/auth/auth-code' }
// 修正後
{ message: '認証コードを入力してください', authCodeUrl: '/auth/auth-code', authCode: result.code }
```

**判断根拠**: サービス層は認証コードを返しており、UIは`data.authCode`を読む設計。APIルートが値を落としているバグの修正であり、BDDシナリオ・API仕様の変更ではない。

### 進捗ログ

- [完了] 必読ドキュメント読み込み（bdd_test_strategy.md §10, AuthModal.tsx, ThreadCreateForm.tsx, PostForm.tsx, page.tsx, turnstile-client.ts）
- [完了] @playwright/test v1.58.2 インストール
- [完了] npx playwright install chromium でブラウザインストール
- [完了] dotenv インストール（playwright.config.ts での .env.local 読み込みに使用）
- [完了] playwright.config.ts 作成
  - webServer: npm run dev でNext.js自動起動（TURNSTILE キー未設定）
  - .env.local 読み込み後、NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY を delete
  - テストタイムアウト 60秒、Turnstile待機タイムアウト 30秒
- [完了] e2e/basic-flow.spec.ts 作成（9ステップの基本フロー縦断テスト）
- [完了] package.json に test:e2e / test:e2e:ui スクリプト追加
- [完了] .gitignore に playwright-report/ / test-results/ 追加
- [テスト実行] npx playwright test → FAIL
  - エラー: `#auth-code-display` が見つからない（5秒タイムアウト）
  - スクリーンショット確認: AuthModal は表示されているが、認証コード表示エリアがない
  - 原因: POST /api/threads の 401 レスポンスに authCode フィールドが含まれていない
    - レスポンス: `{"message":"認証コードを入力してください","authCodeUrl":"/auth/auth-code"}`
    - ThreadCreateForm.tsx は `data.authCode` を読んでいるが undefined になる
    - AuthModal.tsx は `authCode` プロップが undefined のため `#auth-code-display` を非表示
  - エスカレーション ESC-TASK-030-1 を起票

### テスト結果サマリー

**1回目実行: FAIL (1/1)**
- `スレッド作成→認証→閲覧→レス書き込みの基本フローが完結する`: FAIL
  - ステップ3（AuthModal の認証コード表示待機）で失敗
  - `#auth-code-display` が DOM に存在しない（タイムアウト 5000ms）
  - 原因: `/api/threads` の 401 レスポンスに `authCode` が含まれず、AuthModal に表示されない
  - スクリーンショット: test-results/.../test-failed-1.png（AuthModal表示・Turnstile接続エラーあり）

**2回目実行: FAIL (1/1)** [ESC-TASK-030-1 解決後]
- APIルート修正（authCode追加）は効いた → #auth-code-display が表示されるようになった
- Turnstileが「Unable to connect to website」エラー → auth-submit-btn が disabled のまま（30秒タイムアウト）
- 原因: E2E環境（ヘッドレスChromium）からCloudflareサーバーへの接続不可

**3回目実行: FAIL (1/1)** [Turnstileモック追加後]
- Turnstileクライアント側モック効いた（page.route()でスクリプト差し替え）
- Turnstileサーバー側: `TURNSTILE_SECRET_KEY` が .env.local に設定されていたため検証が走り失敗
- webServer.env に `TURNSTILE_SECRET_KEY: ""` を追加して次回に対応済み

**4回目実行: FAIL (1/1)** [TURNSTILE_SECRET_KEY空文字対応後]
- サーバー側Turnstile検証: フォールバック動作確認（「常にtrueを返します」ログ確認）
- 認証フローが通過し AuthModal が閉じるようになった
- スレッド作成成功（DBに作成確認済み）
- Step 5「スレッドが一覧に表示される」で失敗
- 原因: ThreadCreateForm.tsx で router.refresh() が呼ばれていないため、Server Component の一覧が更新されない
- page.tsx が onCreated を ThreadCreateForm に渡していない実装バグ
- エスカレーション ESC-TASK-030-2 を起票

**5回目実行: PASS (1/1)** [ESC-TASK-030-2 解決後]
- `ThreadCreateForm.tsx` に `useRouter` + `router.refresh()` を追加（ESC-TASK-030-2 解決方針に従い修正）
- E2Eテスト: 1/1 PASS (5.0s / 総実行時間 9.9s)
- 単体テスト（vitest run）: 468/468 PASS（回帰なし）
- BDDテスト（cucumber-js）: 86/87 PASS（1件は既存不具合、今回の変更と無関係）
