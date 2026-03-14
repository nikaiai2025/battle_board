# Sprint-14 計画書

## 概要

専ブラ互換エンドポイントが本番環境（Vercel）で404になる問題の修正。
Next.js App Routerが拡張子付きURLを静的ファイルリクエストとして処理するため、専ブラからのアクセスがルートハンドラに到達しない。

## 背景

- 人間から報告: 本番環境で `GET /battleboard/kako/1773/17734/1773436607.dat` が404
- 根本原因: Next.js/Vercelが `.dat`, `.txt`, `.TXT`, `.html` 等の拡張子付きURLをApp Routerに通さない
- Sprint-13のAPIテスト時に `.dat` の問題は検知済みだったが、テスト側で回避しており本番は未修正
- `kako` 形式URLは `.dat` が404になったことで専ブラが過去ログ倉庫を探索した副次的現象

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 |
|---|---|---|---|
| TASK-033 | next.config.ts にrewrites追加 + 全専ブラエンドポイント疎通確認 | bdd-coding | completed |
| TASK-034 | DATルートフォルダリネーム（[threadKey].dat → [threadKey]） | bdd-coding | assigned |

## 結果

- TASK-033: **completed**
- `next.config.ts` にrewrites追加（`.dat`拡張子 + kako形式）
- `subject.txt` / `SETTING.TXT` / `bbsmenu.html` はApp Router固定パスのため問題なし（リライト不要）
- APIテストを拡張子付きURLに修正（本来のURL形式でテスト）
- 全テストPASS（BDD 1件失敗は既存バグ: incentive.feature「スレッド復興ボーナスは付与されない」）
