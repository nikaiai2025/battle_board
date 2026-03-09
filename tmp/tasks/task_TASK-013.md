---
task_id: TASK-013
sprint_id: Sprint-7
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-09T12:00:00+09:00
updated_at: 2026-03-09T12:00:00+09:00
locked_files:
  - src/app/layout.tsx
  - src/app/page.tsx
  - "[NEW] src/app/(web)/layout.tsx"
  - "[NEW] src/app/(web)/page.tsx"
  - "[NEW] src/app/(web)/_components/Header.tsx"
  - "[NEW] src/app/(web)/_components/ThreadList.tsx"
  - "[NEW] src/app/(web)/_components/ThreadCard.tsx"
  - "[NEW] src/app/(web)/_components/ThreadCreateForm.tsx"
  - "[NEW] src/app/(web)/_components/AuthModal.tsx"
---

## タスク概要

Web UIの共通基盤（レイアウト・ヘッダー）とスレッド一覧ページを実装する。スレッド作成フォーム（認証済みユーザー向け）と、未認証時に表示する認証モーダル（AuthModal）も含む。AuthModalはTASK-014でも再利用される共通コンポーネント。

## 対象BDDシナリオ

- `features/phase1/thread.feature` — スレッド一覧・作成関連
- `features/phase1/authentication.feature` — 認証UI

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/web-ui.md` — Web UI コンポーネント境界設計
2. [必須] `docs/specs/screens/thread-list.yaml` — スレッド一覧画面要素定義
3. [必須] `docs/specs/screens/auth-code.yaml` — 認証コード入力画面要素定義
4. [必須] `docs/specs/openapi.yaml` — API仕様（GET/POST /api/threads, POST /api/auth/auth-code）
5. [参考] `src/app/api/threads/route.ts` — 既存のAPIルート実装（レスポンス形式の確認）
6. [参考] `src/app/api/auth/auth-code/route.ts` — 既存の認証APIルート

## 入力（前工程の成果物）

- 既存APIルート（`src/app/api/threads/route.ts`, `src/app/api/auth/auth-code/route.ts`）が実装済み

## 出力（生成すべきファイル）

- `src/app/layout.tsx` — 修正（metadata更新: title="BattleBoard", lang="ja"）
- `src/app/page.tsx` — 削除（(web)ルートグループに移動するため）
- `src/app/(web)/layout.tsx` — Web UI共通レイアウト（Header含む）
- `src/app/(web)/page.tsx` — スレッド一覧ページ（Server Component）
- `src/app/(web)/_components/Header.tsx` — ヘッダーナビゲーション
- `src/app/(web)/_components/ThreadList.tsx` — スレッド一覧コンポーネント（Server Component）
- `src/app/(web)/_components/ThreadCard.tsx` — スレッドカード（Server Component）
- `src/app/(web)/_components/ThreadCreateForm.tsx` — スレッド作成フォーム（Client Component）
- `src/app/(web)/_components/AuthModal.tsx` — 認証モーダル（Client Component, 6桁コード入力 + Turnstile）

## 完了条件

- [ ] スレッド一覧ページが `/` でアクセス可能
- [ ] スレッド一覧はAPIルート `GET /api/threads` 経由でデータ取得（サービス層を直接importしない）
- [ ] スレッド作成フォームが認証済み時のみ表示
- [ ] AuthModalが6桁コード入力 + Turnstileウィジェットを含む
- [ ] `dangerouslySetInnerHTML` を使用していない
- [ ] 既存テスト: `npx vitest run` で全330テストPASS（既存テストを壊していないこと）
- [ ] ビルド確認: TypeScriptコンパイルエラーなし

## スコープ外

- スレッド閲覧ページ（TASK-014で実装）
- 書き込みフォーム（TASK-014で実装）
- BDDステップ定義の実装
- マイページ（Step 10）
- 管理画面（Step 8）

## 補足・制約

- **ルートグループ**: `(web)` ルートグループを使用。`src/app/(web)/page.tsx` が `/` にマッピングされる
- **既存 `src/app/page.tsx` の扱い**: デフォルトNext.jsテンプレートのため削除する（(web)/page.tsx が `/` を担う）
- **SSR方式**: web-ui.md §2 に従い、スレッド一覧はServer Componentで、APIルート経由のfetchで取得
- **Client Component**: フォーム類（ThreadCreateForm, AuthModal）は `"use client"` ディレクティブを使用
- **スタイリング**: Tailwind CSS（既存のglobals.css + Tailwind設定を活用）。5chライクな掲示板の雰囲気を意識した素朴なUIで良い
- **Turnstile**: AuthModalにはCloudflare Turnstileのウィジェットを配置。`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">` を使用するか、react用ラッパーが必要な場合は追加のnpmパッケージ不要の方法を優先する（scriptタグ + useRef）
- **認証状態の判定**: edge-token CookieはhttpOnlyのため、クライアント側では直接読めない。スレッド作成フォームの表示/非表示は、APIレスポンスの401判定で行うか、または `/api/auth/status` のような軽量エンドポイントがない現状では、フォームは常に表示し送信時に401を受けたらAuthModalを表示する方式を推奨する
- **相対時間表示**: thread-list.yaml のformat "relative"（3分前、1時間前等）は、簡易的な関数で実装（ライブラリ追加不要）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 進行中
- 完了済み: ドキュメント読み込み、既存テスト330件確認
- 次にすべきこと: ファイル実装
- 未解決の問題: なし

### 進捗ログ
- [開始] CLAUDE.md, タスク指示書, 必読ドキュメント読み込み完了
- [確認] 既存テスト 330件 PASS 確認
- [実装中] src/app/layout.tsx 修正、src/app/page.tsx 削除、(web)ルートグループ作成

### テスト結果サマリー
<!-- テスト実行後にワーカーが追記 -->
