---
task_id: TASK-196
sprint_id: Sprint-73
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T05:30:00+09:00
updated_at: 2026-03-20T05:30:00+09:00
locked_files:
  - src/app/(web)/mypage/page.tsx
---

## タスク概要
D-06 mypage.yaml の更新に対応し、マイページにログアウトボタンを追加する。本登録ユーザーのみ表示、確認ダイアログ付き、POST /api/auth/logout を呼び出す。

## 対象BDDシナリオ
- `features/user_registration.feature` @ログアウトすると書き込みに再認証が必要になる

## 必読ドキュメント（優先度順）
1. [必須] `docs/specs/screens/mypage.yaml` — D-06 画面要素定義（logout-btn の定義）
2. [必須] `src/app/(web)/mypage/page.tsx` — 修正対象のマイページコンポーネント
3. [参考] `src/app/api/auth/logout/route.ts` — 既存のログアウトAPIルート
4. [参考] `features/user_registration.feature` — ログアウトのBDDシナリオ

## 出力（生成すべきファイル）
- `src/app/(web)/mypage/page.tsx` — ログアウトボタン追加

## 完了条件
- [ ] マイページに `id="logout-btn"` のボタンが表示される
- [ ] 本登録ユーザー（`user.isRegistered == true`）のみ表示される
- [ ] ボタンクリック時に確認ダイアログ「ログアウトしますか？」が表示される
- [ ] 確認OK時に `POST /api/auth/logout` が呼ばれる
- [ ] ログアウト成功後にトップページ（/）にリダイレクトされる
- [ ] `npx vitest run` が全件PASS
- [ ] `npx cucumber-js` が既存シナリオを壊していない

## スコープ外
- ログアウトAPI自体の修正（既に実装済み）
- BDDシナリオの変更
- 他ページへの影響

## 補足・制約
- D-06 定義: `style: danger`（赤系のボタンスタイル）
- D-06 定義: `confirm: ログアウトしますか？`（window.confirm または同等のUI）
- D-06 定義: `condition: user.isRegistered == true`（仮ユーザーはログアウトするとユーザーIDを喪失するため非表示）
- ログアウトボタンは既存のプロフィールセクション内に配置する（D-06の要素順序に従う）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. タスク指示書・必読ドキュメント（D-06 mypage.yaml, page.tsx, logout/route.ts, user_registration.feature）を読み込み
2. [TDD Red] `mypage-registration.test.ts` に「ログアウトボタン表示制御 (isPermanentUser)」テストスイート（5件）を追加
3. [TDD Green確認] 既存 `isPermanentUser` で全35件PASS
4. [実装] `src/app/(web)/mypage/page.tsx` を修正:
   - `handleLogout` ハンドラ追加（`window.confirm` + `POST /api/auth/logout` + `window.location.href = "/"`）
   - アカウント情報セクション内の streak-info 後に `id="logout-btn"` ボタン追加
   - `isPermanentUser(mypageInfo)` で本登録ユーザーのみ表示
   - style: danger（`bg-red-600`）
   - ファイルヘッダーコメント・関数コメントにBDDシナリオ参照を追加

### テスト結果サマリー

**単体テスト (npx vitest run):**
- テストファイル: 65 passed (65)
- テスト件数: 1393 passed (1393)
- 追加テスト: 「ログアウトボタン表示制御」5件を `mypage-registration.test.ts` に追加

**BDDテスト (npx cucumber-js):**
- シナリオ: 256 scenarios (16 pending, 240 passed) — 変更前と同一
- ステップ: 1333 steps (16 pending, 37 skipped, 1280 passed)
- FAIL: 0件（既存シナリオを壊していないことを確認）
