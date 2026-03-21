---
task_id: TASK-202
sprint_id: Sprint-75
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T12:00:00+09:00
updated_at: 2026-03-20T12:00:00+09:00
locked_files:
  - src/__tests__/app/(web)/mypage/mypage-registration.test.ts
  - src/__tests__/app/api/auth/pat.test.ts
  - src/__tests__/integration/schema-consistency.test.ts
  - src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - src/__tests__/lib/services/bot-service-scheduling.test.ts
  - src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts
  - src/__tests__/lib/services/registration-service.test.ts
  - src/app/(senbra)/__tests__/route-handlers.test.ts
  - src/lib/infrastructure/adapters/__tests__/subject-formatter.test.ts
  - src/lib/services/__tests__/admin-service.test.ts
  - src/lib/services/__tests__/auth-service.test.ts
  - src/lib/services/__tests__/incentive-service.test.ts
  - src/lib/services/__tests__/mypage-service.test.ts
  - src/lib/services/__tests__/post-service.test.ts
  - package.json
  - "[NEW] .husky/pre-commit"
---

## タスク概要
`npx tsc --noEmit` で検出される型エラー（約74件・13テストファイル）を全て解消し、pre-commit hookを導入して再発を防止する。エラーは全てテストファイル内のモック/フィクスチャがモデル型の変更に追従していないことが原因。プロダクションコードの変更は不要。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/tsc-type-errors-remediation.md` — エラー内訳・修正方針の詳細
2. [必須] `src/lib/domain/models/thread.ts` — Thread型の現在のフィールド
3. [参考] `src/lib/domain/models/user.ts` — User型の現在のフィールド
4. [参考] `src/lib/domain/models/bot.ts` — Bot型の現在のフィールド

## 出力（生成すべきファイル）
- 13テストファイル — 型エラーが解消された状態
- `package.json` — husky devDependency追加
- `.husky/pre-commit` — `npx tsc --noEmit` を実行するフック

## 完了条件
- [x] `npx tsc --noEmit` がエラー0件で終了する
- [x] `npx vitest run` が全件PASS（既存テストを壊していない）
- [x] `npx cucumber-js` が既存シナリオを壊していない
- [x] `.husky/pre-commit` が作成され、`npx tsc --noEmit` を実行する設定になっている

## スコープ外
- プロダクションコード（src/lib/, src/app/）の変更
- テストロジックの変更（不足プロパティの追加のみ。テストの検証内容は変えない）
- BDDシナリオの変更

## 補足・制約

### 修正方針
- 不足プロパティにはモデルのデフォルト値（`null`, `false`, `0` 等）を設定する
- テストの意図を変えない（テスト対象外のプロパティは中立的な値を入れる）
- `makeThread()` / `makeUser()` のようなファクトリ関数がある場合は、ファクトリ側を修正して波及させる（個別フィクスチャを1つずつ直すより効率的）
- 正規表現フラグ (TS1501) の問題は tsconfig の target を `es2018` 以上にするか、正規表現を書き換える
- null チェック (TS18047) は型ガードを追加する

### 作業手順
1. まず `npx tsc --noEmit 2>&1` を実行し、現在のエラー全件を把握する
2. ファクトリ関数を特定し、あればファクトリ側を先に修正する
3. 個別フィクスチャの不足プロパティを追加する
4. `npx tsc --noEmit` でエラー0件を確認する
5. `npx vitest run` で全テストPASSを確認する
6. husky をセットアップする（`npm install --save-dev husky && npx husky init`）
7. `.husky/pre-commit` に `npx tsc --noEmit` を設定する

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全13テストファイルの型エラー解消、huskyセットアップ
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

#### 型エラー修正（13ファイル）

1. `src/lib/services/__tests__/auth-service.test.ts`
   - `makeUser()` ファクトリを `User` 型を返す型付きファクトリに変更
   - Phase 3 (supabaseAuthId, registrationType, registeredAt, patToken, patLastUsedAt)、Phase 4 (grassCount)、Phase 5 (isBanned, lastIpHash) フィールドを追加

2. `src/lib/services/__tests__/post-service.test.ts`
   - `mockUser`, `mockPremiumUser` に Phase 3/4/5 フィールドを追加
   - `mockThread` に `isPinned: false` を追加

3. `src/lib/services/__tests__/mypage-service.test.ts`
   - `FREE_USER`: 本登録済み状態（registrationType: "email", supabaseAuthId 設定）に更新
     - `upgradeToPremium` は本登録済みユーザーのみ課金可能な仕様のため
   - `PREMIUM_USER`: 本登録済み状態に更新
   - Phase 4/5 フィールドを追加

4. `src/lib/services/__tests__/admin-service.test.ts`
   - `makeThread()` ファクトリに `isPinned: false` を追加

5. `src/lib/services/__tests__/incentive-service.test.ts`
   - `makeUser()` に Phase 3/4/5 フィールドを追加
   - `makeThread()` に `isPinned: false` を追加

6. `src/lib/infrastructure/adapters/__tests__/subject-formatter.test.ts`
   - `makeThread()` に `isPinned: false` を追加

7. `src/app/(senbra)/__tests__/route-handlers.test.ts`
   - `makeThread()` ファクトリを `Thread` 型付きに変更し `isPinned: false` を追加

8. `src/__tests__/app/(web)/mypage/mypage-registration.test.ts`
   - `makeTemporaryUserInfo()`, `makeRegisteredUserInfo()` に `grassCount: 0`, `grassIcon: "🌱"` を追加

9. `src/__tests__/app/api/auth/pat.test.ts`
   - `createRegisteredUser()` に Phase 4/5 フィールドを追加

10. `src/__tests__/lib/services/registration-service.test.ts`
    - `createTemporaryUser()` に Phase 4/5 フィールドを追加

11. `src/__tests__/lib/services/bot-service.test.ts`
    - `createMockBotRepository()` に `incrementAccusedCount` を追加
    - `executeBotPost` の `result` に null チェック型ガードを追加（TS18047 解消）

12. `src/__tests__/lib/services/bot-service-scheduling.test.ts`
    - `createMockBotRepository()` に `incrementTotalPosts`, `incrementAccusedCount` を追加

13. `src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts`
    - `createBot()` に `nextPostAt: null` を追加

14. `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts`
    - `BotRepository.create()` の呼び出し引数に `nextPostAt: null` を追加（2箇所）

15. `src/__tests__/integration/schema-consistency.test.ts`
    - 正規表現フラグ `/s`（ES2018以降）を削除（パターン内で `.` を使用していないため等価）

#### husky セットアップ

- `npm install --save-dev husky` でインストール
- `npx husky init` で初期化（`prepare: "husky"` スクリプト追加）
- `.husky/pre-commit` に `npx tsc --noEmit` を設定

### テスト結果サマリー

#### npx tsc --noEmit
- エラー件数: **0件**（修正前: 74件）

#### npx vitest run
- テストファイル: **66 passed** (66)
- テスト件数: **1412 passed** (1412)
- 失敗: **0件**

#### npx cucumber-js
- シナリオ数: **256 scenarios** (16 pending, 240 passed)
- ステップ数: **1333 steps** (16 pending, 37 skipped, 1280 passed)
- 新規失敗: **0件**（pending は元々の状態）
