---
task_id: TASK-144
sprint_id: Sprint-51
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-18T12:00:00+09:00
updated_at: 2026-03-18T12:00:00+09:00
locked_files:
  - "src/app/(senbra)/[boardId]/subject.txt/route.ts"
  - "src/app/(senbra)/[boardId]/subject.txt/__tests__/"
---

## タスク概要

専ブラ subject.txt の 304 Not Modified 判定にバグがある。If-Modified-Since（秒精度）とDB日付（ミリ秒精度）を直接比較しているため、同一秒内のスレッド更新が検出されず304が返され、新規スレッドが一覧に反映されない。DAT route と同様に秒精度に正規化して比較するよう修正する。

## 対象BDDシナリオ

- 既存BDDシナリオの変更は不要（内部バグ修正）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(senbra)/[boardId]/subject.txt/route.ts` — 修正対象
2. [必須] `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` — DAT routeの正しい秒精度比較実装（参考）
3. [参考] `features/constraints/specialist_browser_compat.feature` — 関連BDDシナリオ

## 入力（前工程の成果物）

- DAT route の秒精度比較ロジック（参考実装）

## 出力（生成すべきファイル）

- `src/app/(senbra)/[boardId]/subject.txt/route.ts` — 修正済み
- 該当テストファイル — 304判定のテスト追加/修正

## 完了条件

- [ ] subject.txt の If-Modified-Since 比較をDAT routeと同様に秒精度に正規化
- [ ] Last-Modified ヘッダ出力も秒精度に正規化（ラウンドトリップ一致保証）
- [ ] 既存テスト全PASS（`npx vitest run`）
- [ ] 304判定に関する単体テスト追加（同一秒内更新で200が返ることの検証）

## 修正方針

### 1. If-Modified-Since 比較の秒精度化（必須）

```typescript
// Before（バグ）:
if (!isNaN(sinceDate.getTime()) && latestPostAt <= sinceDate) {
    return new Response(null, { status: 304 });
}

// After（修正）:
if (!isNaN(sinceDate.getTime())) {
    const lastPostAtSec = Math.floor(latestPostAt.getTime() / 1000);
    const sinceSec = Math.floor(sinceDate.getTime() / 1000);
    if (lastPostAtSec <= sinceSec) {
        return new Response(null, { status: 304 });
    }
}
```

### 2. Last-Modified ヘッダの秒精度正規化（推奨）

レスポンスの Last-Modified ヘッダも秒精度に切り捨てることで、ラウンドトリップでの精度ズレを防ぐ。

### 3. テスト追加

- 同一秒内でDB更新が発生した場合に304ではなく200が返ることを検証
- If-Modified-Sinceが古い場合に200が返ることを検証
- If-Modified-Sinceが新しい場合に304が返ることを検証

## スコープ外

- bbs.cgiのスレッド作成処理の変更
- DAT route の修正（既に正しい実装）
- BDDシナリオの追加・変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: バグ修正・テスト追加・全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [完了] subject.txt route.ts のバグ確認: latestPostAt <= sinceDate はDate直接比較でミリ秒精度のまま
- [完了] DAT route の正しい実装確認: Math.floor(t/1000) で秒精度に正規化して比較
- [完了] テストファイル新規作成: `src/__tests__/app/(senbra)/[boardId]/subject.txt/route.test.ts`
- [完了] RED確認: 3テストが期待通り失敗（.999Z/.500Zのミリ秒精度バグ）
- [完了] 実装修正: `src/app/(senbra)/[boardId]/subject.txt/route.ts`
  - If-Modified-Since 比較を秒精度に正規化（Math.floor(t/1000)）
  - Last-Modified コメント追記（toUTCString()が秒精度であることを明示）
- [完了] GREEN確認: 全17テストPASS
- [完了] 全テストスイート実行: 46ファイル 1174テスト全PASS

### テスト結果サマリー
- 新規テストファイル: `src/__tests__/app/(senbra)/[boardId]/subject.txt/route.test.ts`
- 新規テスト数: 17テスト（全PASS）
  - スレッドなし: 2テスト
  - If-Modified-Sinceなし: 1テスト
  - 304判定（更新なし）: 3テスト
  - バグ修正（同一秒内更新）: 3テスト
  - 無効なIf-Modified-Since: 2テスト
  - Last-Modifiedヘッダ: 3テスト
  - Content-Typeヘッダ: 1テスト
  - 境界値テスト: 2テスト
- 既存テスト影響: なし（46ファイル 1174テスト全PASS）
