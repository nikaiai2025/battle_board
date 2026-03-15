---
task_id: TASK-062
sprint_id: Sprint-22
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T16:00:00+09:00
updated_at: 2026-03-15T16:00:00+09:00
locked_files:
  - src/app/api/mypage/route.ts
  - src/app/api/mypage/history/route.ts
  - src/app/api/mypage/username/route.ts
  - src/app/api/mypage/upgrade/route.ts
---

## タスク概要

/api/mypage系の全4エンドポイントに `is_verified` チェックを追加する。現在はedge-tokenでユーザーを検索した後にis_verifiedを確認していないため、認証フロー未完了のユーザーがマイページにアクセスできてしまう。

## 対象BDDシナリオ

- `features/phase1/mypage.feature` 全シナリオ（前提:「ログイン済みユーザー」= is_verified=true）
- `features/phase1/authentication.feature`（認証フロー全体の整合性）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/api/mypage/route.ts` — GET /api/mypage
2. [必須] `src/app/api/mypage/history/route.ts` — GET /api/mypage/history
3. [必須] `src/app/api/mypage/username/route.ts` — PUT /api/mypage/username
4. [必須] `src/app/api/mypage/upgrade/route.ts` — POST /api/mypage/upgrade
5. [参考] `src/lib/infrastructure/repositories/user-repository.ts` — findByAuthToken（Userにis_verifiedフィールドあり）

## 出力（生成すべきファイル）

- `src/app/api/mypage/route.ts` — is_verifiedチェック追加
- `src/app/api/mypage/history/route.ts` — 同上
- `src/app/api/mypage/username/route.ts` — 同上
- `src/app/api/mypage/upgrade/route.ts` — 同上

## 完了条件

- [ ] 全4エンドポイントで、findByAuthToken後に `user.isVerified === false` の場合は 401 を返す
- [ ] 401レスポンスのメッセージは `認証が必要です` （既存の未認証レスポンスと同一形式）
- [ ] is_verified=true のユーザーは従来通りアクセス可能
- [ ] テストコマンド: `npx vitest run` && `npx cucumber-js`

## 補足・制約

- 4ファイルとも同一パターンの修正: findByAuthToken直後に `if (!user.isVerified)` チェックを追加するだけ
- UserRepository.findByAuthToken は User 型を返し、User 型は `isVerified: boolean` を持つ（user-repository.ts の rowToUser で変換済み）
- 認証チェックの共通化（ヘルパー関数抽出）は本タスクのスコープ外。4ファイル個別に修正する

## スコープ外

- 認証チェックヘルパーの共通化（将来的にリファクタリング可能だが今回はスコープ外）
- テストファイルの変更（既存のBDDシナリオで検証）
- bbs.cgi側の変更（専ブラ側は既にresolveAuth内でis_verified確認済み）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全4エンドポイントへの is_verified チェック追加、テスト全件PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/app/api/mypage/route.ts`: findByAuthToken直後に `!user.isVerified` チェック追加
- `src/app/api/mypage/history/route.ts`: 同上
- `src/app/api/mypage/username/route.ts`: 同上
- `src/app/api/mypage/upgrade/route.ts`: 同上

### テスト結果サマリー

- Vitest: 18ファイル、601テスト、全PASS
- Cucumber BDD: 106シナリオ中 103 PASS、3 Pending（specialist_browser_compatの未実装シナリオ。本タスクと無関係）
