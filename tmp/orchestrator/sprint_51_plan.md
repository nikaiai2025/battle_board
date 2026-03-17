# Sprint-51 計画書

> 作成日: 2026-03-18

## スプリント目標

専ブラ subject.txt の 304 Not Modified 判定バグを修正し、新規スレッドが即座にスレッド一覧に反映されるようにする。

## 背景

- 新規スレッドを立てても専ブラのスレッド一覧（subject.txt）に追加されない
- Webからは見える。専ブラからのスレ立て自体は成功する
- 原因: subject.txt の If-Modified-Since 比較がミリ秒 vs 秒の精度不一致で、同一秒内の更新を検出できず 304 を返してしまう
- DAT route は秒精度に正規化して比較しているが、subject.txt route にはその処理がない

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-144 | subject.txt 304判定の秒精度修正 + 関連テスト | bdd-coding | なし | **completed** |

## 結果

- **TASK-144**: 完了
  - `src/app/(senbra)/[boardId]/subject.txt/route.ts` — If-Modified-Since比較を秒精度に正規化（DAT routeと同一方式）
  - `src/__tests__/app/(senbra)/[boardId]/subject.txt/route.test.ts` — 17テスト新規作成
  - 全テスト: 46ファイル / 1,174テスト / 全PASS
