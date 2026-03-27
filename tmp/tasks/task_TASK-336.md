# タスク指示書: TASK-336

## タスクID
TASK-336

## ステータス
completed

## タスク概要
緊急バグ修正: !hiroyuki >>N ターゲット指定時の無反応

## 原因
`src/lib/services/command-service.ts` の line 708 で、HiroyukiHandler の postRepository DI 解決にメソッド名不一致がある。

`post-repository.ts` は `findByThreadIdAndPostNumber` をエクスポートしているが、
`IHiroyukiPostRepository` は `findPostByNumber` を要求している。
TypeScript の型アサーションは `require()` が `any` を返すため通るが、ランタイムで `findPostByNumber` が `undefined` → `TypeError: postRepository.findPostByNumber is not a function` が発生する。

これが post-service.ts の try-catch で飲まれ、コマンドが無反応になる。

## locked_files
- `src/lib/services/command-service.ts`

## artifacts_dir
なし

## 完了条件
- 修正を適用する
- `npx vitest run` で既存テスト全PASS確認
- BDDテスト `npx cucumber-js` でhiroyukiシナリオ 8/8 PASS確認

## 作業ログ

### チェックポイント
作業完了。

### 進捗ログ
1. `src/lib/services/command-service.ts` line 706-712 を修正
   - `require()` で直接モジュールをロードして `IHiroyukiPostRepository` に型アサーションするコードを廃止
   - `PostRepo.findByThreadIdAndPostNumber` を `IHiroyukiPostRepository.findPostByNumber` にラップするアダプターオブジェクトに変更

### テスト結果サマリー
- Vitest 単体テスト: 102ファイル / 2002テスト全PASS
- BDD hiroyukiシナリオ: 8シナリオ全PASS（修正前後で確認）
- BDD 全体: 371 scenarios (8 failed, 5 undefined, 16 pending, 342 passed)
  - 失敗8件は command_copipe シナリオの既存失敗（今回修正とは無関係。修正前後で同一件数を git stash で確認済み）
