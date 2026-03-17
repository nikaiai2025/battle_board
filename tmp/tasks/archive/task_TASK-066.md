---
task_id: TASK-066
sprint_id: Sprint-23
status: completed
assigned_to: bdd-coding
depends_on: [TASK-065]
created_at: 2026-03-16T12:00:00+09:00
updated_at: 2026-03-16T12:00:00+09:00
locked_files:
  - src/app/(senbra)/__tests__/route-handlers.test.ts
  - src/app/api/auth/auth-code/__tests__/route.test.ts
  - src/lib/domain/rules/__tests__/validation.test.ts
  - src/lib/infrastructure/adapters/__tests__/dat-formatter.test.ts
  - src/lib/infrastructure/repositories/post-repository.ts
  - src/lib/services/__tests__/admin-service.test.ts
  - src/lib/services/__tests__/incentive-service.test.ts
  - src/lib/services/__tests__/mypage-service.test.ts
  - src/lib/services/__tests__/post-service.test.ts
  - src/lib/services/post-service.ts
---

## タスク概要

Post型に `inlineSystemInfo: string | null` フィールドを追加した（TASK-065）ことで、既存のテストコード・実装コードでTypeScriptコンパイルエラーが56件発生している。全エラーを修正しビルドを通す。

## 対象エラー

`npx tsc --noEmit` で検出される全エラー。主な原因:
1. テストコード内のPostオブジェクトリテラルに `inlineSystemInfo` フィールドが不足（大半）
2. post-repository.ts / post-service.ts のPost構築箇所に `inlineSystemInfo` が不足

## 修正方針

1. **テストコード**: 既存のPostオブジェクトリテラルに `inlineSystemInfo: null` を追加
2. **post-repository.ts**: DB→Postマッピングに `inlineSystemInfo: row.inline_system_info ?? null` を追加
3. **post-service.ts**: Post構築箇所に `inlineSystemInfo: null` を追加（Phase 2実装前なので常にnull）

注意: Phase 2のコマンド実行ロジック実装はスコープ外。現時点では全て `null` で統一する。

## 完了条件

- [x] `npx tsc --noEmit` がエラー0件で完了
- [x] `npx vitest run` が全テストPASS

## スコープ外

- Phase 2のコマンド実行ロジック実装
- inlineSystemInfoに値を設定するロジックの実装
- BDDシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全修正完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- post-repository.ts: PostRow型に `inline_system_info` 追加、rowToPost関数に `inlineSystemInfo: row.inline_system_info ?? null` を追加
- post-service.ts: createPost呼び出し箇所と firstPost構築箇所に `inlineSystemInfo: null` を追加
- route-handlers.test.ts: makePostファクトリに `inlineSystemInfo` 追加、makeShiftJisBody の戻り値型を `string` に変更（Bufferの型エラーも解消）
- dat-formatter.test.ts: makePostファクトリに `inlineSystemInfo: null` を追加
- admin-service.test.ts: makePostファクトリに `inlineSystemInfo: null` を追加
- incentive-service.test.ts: makeUserに `isVerified: false` 追加、makePostに `inlineSystemInfo: null` を追加
- mypage-service.test.ts: FREE_USER/PREMIUM_USERに `isVerified: true` 追加、SAMPLE_POSTに `inlineSystemInfo: null` を追加
- post-service.test.ts: mockPost・anchorTargetPost・anonymousPost・post1・post3 に `inlineSystemInfo: null` を追加
- auth-code/route.test.ts: mockCookies/mockHeadersのキャストに `unknown` を中継して型エラーを解消
- validation.test.ts: 不要な `@ts-expect-error` コメント10箇所を削除（関数がunknown型を受け付けるため）

### テスト結果サマリー

- `npx tsc --noEmit`: エラー0件
- `npx vitest run`: 18テストファイル / 601テスト 全PASS
