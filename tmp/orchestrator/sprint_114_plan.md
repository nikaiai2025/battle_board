# Sprint-114 計画書

> 作成: 2026-03-25

## 目的

テーマ・フォントのプレミアム→無料ダウングレード時のロールバック修正。
BDDテスト失敗2件の解消 + 本番環境でのテーマロールバック未実行の修正。

## 問題分析

### 問題1: BDDステップ定義のテストデータ誤り
- `theme.steps.ts` が `mincho` を有料フォントとして使用しているが、`mincho` は `isFree: true`
- 正しい有料フォント（例: `noto-sans-jp`）に修正すれば解決

### 問題2: 本番環境でテーマがロールバックしない
- `layout.tsx` が `resolveTheme(themeId, true)` と常に `isPremium=true` で呼んでいる
- Cookie `bb-theme` に有料テーマIDが残っていると、ダウングレード後もそのまま表示される
- 設計意図: GET /api/mypage がフォールバック済みIDを返し、フロントがCookie更新するフロー
- 実態: GET /api/mypage のレスポンスでCookieが更新される仕組みが未実装

## タスク分解

| TASK_ID | 内容 | 担当 | 状態 |
|---|---|---|---|
| TASK-310 | テーマ/フォントダウングレードロールバック修正 + BDDテスト修正 | bdd-coding | completed |

## 結果

### TASK-310
- theme.steps.ts: mincho → noto-sans-jp に5箇所修正（テストデータ誤り解消）
- GET /api/mypage: Set-Cookie ヘッダー追加（bb-theme/bb-font のダウングレード時Cookie同期）
- 単体テスト: route.test.ts 新規8テスト追加（認証・正常系・Cookie検証）
- Vitest: 1790/1794 PASS（4 failed は既存 registration-service）
- BDD: 324/344 PASS（theme.feature 全13シナリオ PASS、残4 failed は user_registration）
