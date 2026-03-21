---
task_id: TASK-204
sprint_id: Sprint-75
status: completed
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-204
depends_on: []
created_at: 2026-03-20T16:00:00+09:00
updated_at: 2026-03-20T16:00:00+09:00
locked_files: []
---

## タスク概要
本番スモークテストでスレッドページ（`/battleboard/{threadKey}/`）に React hydration mismatch (#418) が検出された。ページUIは正常描画されているが、サーバーレンダリングとクライアントレンダリングの出力不一致がJSコンソールエラーとして発生している。原因を特定し、修正方針を策定する。

## 症状
- 影響テスト: 3件（スレッドページUI確認 × 2 + 旧URLリダイレクト × 1）
- エラー: `Minified React error #418` (text content does not match server-rendered HTML)
- ページは正常に表示されている（スクリーンショット確認済み）
- ローカルE2Eテスト（playwright navigation）では発生していない（19件全PASS）
- 本番（Cloudflare Workers）でのみ発生

## 調査対象ファイル
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — スレッドページ
- `src/app/(web)/_components/PostListLiveWrapper.tsx` — ポーリング付きリストラッパー
- `src/app/(web)/_components/PostItem.tsx` — レス表示コンポーネント
- スクリーンショット: `ゴミ箱/test-results-prod/navigation-スレッドページ-battleb-25925-*/test-failed-1.png`

## 出力
- `tmp/workers/bdd-architect_TASK-204/analysis.md` — 原因分析と修正方針

## 完了条件
- [x] hydration mismatch の具体的な原因を特定（どの要素のサーバー/クライアント出力が不一致か）
- [x] 修正方針を策定
- [x] 本番のみで発生する理由の説明

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 原因特定・修正方針策定・分析レポート出力
- 次にすべきこと: coding担当が修正を実装
- 未解決の問題: なし

### 調査結果サマリー

**原因:** `PostItem.tsx` の `formatDateTime` 関数がタイムゾーン依存の Date メソッド（`getFullYear()`, `getHours()` 等）を使用。Cloudflare Workers（UTC）とブラウザ（JST）で9時間のズレが生じ、SSR HTML とクライアント再レンダリングの出力が不一致。

**具体例:** `createdAt = "2026-03-19T23:45:58.719Z"` に対し
- SSR（UTC）: `2026/03/19(木) 23:45:58`
- Client（JST）: `2026/03/20(金) 08:45:58`

**ローカルで発生しない理由:** ローカルの Node.js サーバーもブラウザもJSTで動作するため、出力が一致する。

**修正方針:** `formatDateTime` 内で UTC メソッド + 9時間オフセットに変更し、環境非依存で JST 固定出力にする。修正対象は `PostItem.tsx` の1関数のみ。

**詳細:** `tmp/workers/bdd-architect_TASK-204/analysis.md`
