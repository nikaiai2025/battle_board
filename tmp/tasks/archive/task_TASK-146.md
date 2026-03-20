---
task_id: TASK-146
sprint_id: Sprint-51
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-18T13:00:00+09:00
updated_at: 2026-03-18T13:00:00+09:00
locked_files:
  - "src/app/(senbra)/[boardId]/subject.txt/route.ts"
  - "src/__tests__/app/(senbra)/[boardId]/subject.txt/route.test.ts"
---

## タスク概要

固定スレッド（isPinned: true）の `lastPostAt` が `2099-01-01` に設定されているため、subject.txt の Last-Modified が2099年になり、専ブラが `If-Modified-Since: 2099年` を送ることで永遠に304が返される。

subject.txt の304判定に使う「最終更新時刻」の算出から、固定スレッドの異常なlastPostAtを除外する修正を行う。

## 対象BDDシナリオ

- 既存BDDシナリオの変更は不要（内部バグ修正）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(senbra)/[boardId]/subject.txt/route.ts` — 修正対象
2. [参考] DBの固定スレッドデータ: `lastPostAt = 2099-01-01T00:00:00.000Z`, `isPinned = true`

## 出力（生成すべきファイル）

- `src/app/(senbra)/[boardId]/subject.txt/route.ts` — 修正済み
- `src/__tests__/app/(senbra)/[boardId]/subject.txt/route.test.ts` — テスト追加

## 完了条件

- [x] subject.txtの304判定・Last-Modifiedヘッダで固定スレッドの異常なlastPostAtが使われない
- [x] 固定スレッドしかない場合（通常スレッド0件）も正しく動作する
- [x] 既存テスト全PASS（`npx vitest run`）
- [x] 固定スレッド混在ケースのテスト追加

## 修正方針

### 問題の詳細

1. 固定スレッド（案内板）: `lastPostAt = 2099-01-01T00:00:00.000Z`, `isPinned = true`
2. `ThreadRepository.findByBoardId` は `last_post_at DESC` でソート → 固定スレッドが常に `threads[0]` に来る
3. `threads[0].lastPostAt` が304判定とLast-Modifiedヘッダに使われる → 2099年
4. 専ブラが次回 `If-Modified-Since: Thu, 01 Jan 2099 00:00:00 GMT` を送る
5. 新しいスレッドのlastPostAtは現在時刻（2026年） → 2099年より小さい → 常に304

### 修正方法

subject.txt route内で、304判定・Last-Modifiedヘッダ用の「最終更新時刻」を算出する際に、**現在時刻より未来のlastPostAtを除外**する。

```typescript
// 304判定/Last-Modified用の最終更新時刻を決定する
// isPinnedスレッドのlastPostAtが未来（2099年等）の場合を除外する
const now = new Date();
const latestPostAt = threads.find(t => t.lastPostAt <= now)?.lastPostAt
    ?? threads[threads.length - 1]?.lastPostAt
    ?? new Date(0);
```

理由: `isPinned` フラグを直接参照するよりも、「未来の日時を除外」の方が汎用的で、isPinnedの仕様変更に依存しない。

### DAT routeへの影響

DAT routeは個別スレッドのlastPostAtを使うため、固定スレッドの問題は影響しない（固定スレッドのDATを取得する場合はlastPostAt=2099年が正しくLast-Modifiedに使われても問題ない）。

## スコープ外

- 固定スレッドのlastPostAt値自体の修正（DBデータ変更）
- DAT routeの修正
- BDDシナリオの追加・変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: route.ts修正 + テスト追加（5件）
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 既存テスト20件すべてPASS確認
- テスト追加（RED確認済み）: 固定スレッド混在ケース5件（うち2件が修正前にFAIL）
- route.ts修正: resolveLatestPostAt() 関数を追加し、未来日時を除外してlatestPostAtを決定
  - threads[0].lastPostAt を直接参照していた箇所（304判定・Last-Modifiedヘッダ）を latestPostAt に変更
- 全テストPASS確認: 47ファイル 1191テスト

### テスト結果サマリー
- 単体テスト: 47ファイル 1191テスト 全PASS
- 新規追加テスト（固定スレッド混在ケース）: 5件追加、全PASS
  - 固定スレッド(2099年)+通常スレッド混在で通常スレッドlastPostAtで304判定
  - 固定スレッド(2099年)+通常スレッドに新着投稿がある場合200を返す
  - Last-Modifiedヘッダが固定スレッドの2099年ではなく通常スレッドの日時を返す
  - 固定スレッドのみの場合に200が返される
  - 固定スレッドのみでIf-Modified-Since=2099年の場合304が返される（フォールバック動作）
