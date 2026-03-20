---
task_id: TASK-206
sprint_id: Sprint-75
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T17:00:00+09:00
updated_at: 2026-03-20T17:00:00+09:00
locked_files:
  - src/app/(web)/_components/PostItem.tsx
---

## タスク概要
`PostItem.tsx` の `formatDateTime` 関数がタイムゾーン依存のDateメソッドを使用しており、Cloudflare Workers(UTC)とブラウザ(JST)で9時間のhydration mismatchが発生している。UTCメソッド + 9時間オフセットに変更し、環境非依存でJST固定出力にする。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-204/analysis.md` — 原因分析と修正方針の詳細
2. [必須] `src/app/(web)/_components/PostItem.tsx` — 修正対象（formatDateTime関数）

## 出力（生成すべきファイル）
- `src/app/(web)/_components/PostItem.tsx` — formatDateTime関数をUTCメソッド + JSTオフセットに修正

## 完了条件
- [ ] `formatDateTime` がUTCメソッド（`getUTCFullYear()`, `getUTCHours()` 等）+ 9時間オフセットでJST固定出力する
- [ ] 曜日計算もUTCベースに変更されている
- [ ] `npx tsc --noEmit` がエラー0件
- [ ] `npx vitest run` が全件PASS
- [ ] `npx playwright test e2e/smoke/navigation.spec.ts` が全件PASS

## スコープ外
- PostItem.tsx以外のファイル変更
- formatDateTime以外のロジック変更
- BDDシナリオの変更

## 補足・制約

### 修正パターン（アーキテクト分析書より）

```typescript
// Before（タイムゾーン依存）:
const year = date.getFullYear();
const hours = date.getHours();

// After（UTC + JSTオフセット）:
const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
const year = jst.getUTCFullYear();
const hours = jst.getUTCHours();
```

- `new Date(date.getTime() + 9 * 60 * 60 * 1000)` でJSTオフセットを適用
- 全てのgetXxx()をgetUTCXxx()に変更
- 曜日（`getDay()`）も `getUTCDay()` に変更
- これによりサーバー(UTC)でもブラウザ(JST)でも同じJST日時文字列を出力する

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を満たした
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. タスク指示書・analysis.md・PostItem.tsx を読み込み、修正内容を把握
2. TDD: `PostItem.test.tsx` に `formatDateTime` のテストスイート（15件）を追加
   - 正常系: UTC → JST変換の検証（日付境界・年末年始境界を含む）
   - 曜日: 7曜日分のパラメータ化テスト
   - フォーマット: 正規表現による出力形式の検証
   - エッジケース: エポック時刻、ゼロ埋めの検証
3. `formatDateTime` 関数を UTC メソッド + 9時間オフセット方式に修正
   - `new Date(date.getTime() + 9 * 60 * 60 * 1000)` で JST を算出
   - 全ての `getXxx()` を `getUTCXxx()` に変更（`getUTCDay()` 含む）
   - コメント追記（修正理由・参照ドキュメント）

### テスト結果サマリー

| テスト種別 | 件数 | 結果 |
|---|---|---|
| 単体テスト（PostItem.test.tsx） | 25件 | 全件PASS |
| 単体テスト（全件） | 1446件（67ファイル） | 全件PASS |
| TypeScript コンパイル（tsc --noEmit） | — | エラー0件 |
| E2E（navigation.spec.ts） | 19件 | 全件PASS |
