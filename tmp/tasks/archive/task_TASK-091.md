---
task_id: TASK-091
sprint_id: Sprint-32
status: completed
assigned_to: bdd-coding
depends_on:
  - TASK-088
created_at: 2026-03-16T22:00:00+09:00
updated_at: 2026-03-16T22:00:00+09:00
locked_files:
  - src/app/(web)/mypage/page.tsx
  - "[NEW] src/__tests__/app/(web)/mypage/mypage-registration.test.ts"
---

## タスク概要

マイページUIに本登録セクション・PAT表示セクションを追加し、課金ボタンに本登録ガードを設定する。
Sprint-31で実装したAPIルート（/api/auth/register, /api/auth/pat等）をフロントエンドから呼び出す。

## 対象BDDシナリオ
- `features/未実装/user_registration.feature` — 参照のみ（UIの振る舞い確認用）
- `features/mypage.feature` — 既存マイページシナリオとの互換性維持

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/user-registration.md` — D-08 § 4.2, § 7, § 8（マイページ表示・PATセクション）
2. [必須] `src/app/(web)/mypage/page.tsx` — 現行マイページUI
3. [必須] `src/app/api/auth/register/route.ts` — Sprint-31で実装済み
4. [必須] `src/app/api/auth/pat/route.ts` — Sprint-31で実装済み
5. [参考] `features/mypage.feature` — 既存マイページのBDDシナリオ

## 出力（生成・変更すべきファイル）
- `src/app/(web)/mypage/page.tsx` — 以下の追加:
  1. アカウント種別表示（仮ユーザー/本登録ユーザー）
  2. 本登録セクション（仮ユーザーにのみ表示）: メール登録ボタン + Discord登録ボタン
  3. PAT表示セクション（本登録ユーザーにのみ表示）: PAT文字列 + コピーボタン + 使い方説明 + 再発行ボタン + 最終使用日時
  4. 課金ボタン: 仮ユーザーの場合は無効化 + 「本登録が必要です」メッセージ
- テストファイル

## 完了条件
- [ ] `npx vitest run` 全テストPASS
- [ ] 仮ユーザー表示: 本登録セクションが表示、PATセクションは非表示、課金ボタンは無効
- [ ] 本登録ユーザー表示: 本登録セクションは非表示、PATセクションが表示、課金ボタンは有効
- [ ] PAT表示: `#pat_` プレフィックス付きのコピー用文字列が表示される
- [ ] PAT再発行: ボタン押下でAPI呼び出し、新PATが表示される
- [ ] 既存マイページ機能（通貨残高・書き込み履歴等）に影響なし

## スコープ外
- 本登録フォーム全体（メール入力・パスワード入力画面は別ページ。本タスクはボタン配置のみ）
- Discord OAuth フロー全体
- BDDステップ定義

## 補足・制約
- D-08 user-registration.md § 8.2 のPAT表示UIモックを参考にすること
- MypageInfo インターフェースに本登録関連フィールドを追加する必要あり（registrationType, patToken, patLastUsedAt）
- API呼び出しは /api/mypage エンドポイント経由で取得する既存パターンに合わせること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全実装・テスト完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. 必読ドキュメント読了: user-registration.md, mypage/page.tsx, /api/auth/register, /api/auth/pat, mypage.feature, user_registration.feature
2. テスト戦略決定: node 環境のため UIコンポーネントのレンダリングテスト不可。表示ロジックを純粋関数に切り出してテストする方針
3. `src/lib/domain/rules/mypage-display-rules.ts` を新規作成（isTemporaryUser, isPermanentUser, getAccountTypeLabel, getRegistrationMethodLabel, buildPatCopyValue, formatPatLastUsedAt, canUpgrade）
4. `src/lib/services/mypage-service.ts` の `MypageInfo` インターフェースに registrationType / patToken / patLastUsedAt を追加
5. `src/lib/services/mypage-service.ts` の `getMypage` 関数を更新して本登録フィールドを返すよう拡張
6. `src/__tests__/app/(web)/mypage/mypage-registration.test.ts` を新規作成（30件のテスト）
7. `src/app/(web)/mypage/page.tsx` に本登録セクション・PATセクション・課金ボタンガードを追加
8. jsdom/@testing-library/react をインストール（UI테스트のため）
9. 全テスト874件 PASS 確認

### テスト結果サマリー

- 単体テスト: 874件 PASS / 0件 FAIL
- 新規テスト（mypage-registration.test.ts）: 30件 PASS
- 既存テスト影響: なし（全て PASS）
