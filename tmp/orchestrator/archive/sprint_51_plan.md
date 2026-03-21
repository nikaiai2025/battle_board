# Sprint-51 計画書

> 作成日: 2026-03-18

## スプリント目標

専ブラ互換ルートのHTTPキャッシュ不具合を修正し、新規スレッドが即座にスレッド一覧に反映されるようにする。

## 背景

- 新規スレッドを立てても専ブラのスレッド一覧（subject.txt）に追加されない
- Webからは見える。専ブラからのスレ立て自体は成功する
- 原因1: subject.txt の If-Modified-Since 比較がミリ秒 vs 秒の精度不一致（TASK-144で修正済み）
- 原因2（主因）: Cache-Controlヘッダが未設定のため、専ブラがHTTPヒューリスティックキャッシュを適用し、サーバーに問い合わせずにローカルキャッシュを返す

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-144 | subject.txt 304判定の秒精度修正 + 関連テスト | bdd-coding | なし | **completed** |
| TASK-145 | 専ブラルートにCache-Control: no-cache追加 | bdd-coding | なし | **completed** |
| TASK-146 | 固定スレッドlastPostAt=2099年による永久304問題修正 | bdd-coding | なし | assigned |

## 結果

- **TASK-144**: 完了
  - `src/app/(senbra)/[boardId]/subject.txt/route.ts` — If-Modified-Since比較を秒精度に正規化
  - `src/lib/infrastructure/adapters/http-cache.ts` — 304判定ロジック共通化
  - `src/__tests__/app/(senbra)/[boardId]/subject.txt/route.test.ts` — 17テスト新規作成
- **TASK-145**: 完了
  - subject.txt / DAT route の全レスポンスに `Cache-Control: no-cache` 追加
  - `src/__tests__/app/(senbra)/[boardId]/dat/[threadKey]/route.test.ts` — 12テスト新規作成
  - 全テスト: 47ファイル / 1,186テスト / 全PASS
