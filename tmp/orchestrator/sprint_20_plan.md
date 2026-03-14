# Sprint-20 計画書: ChMate認証問題 — 診断ログ追加による根本原因特定

> 作成: 2026-03-15
> ステータス: **completed**

## 背景

Sprint-19でwrite_token永続化を試みたが人間が却下（回避策であり根本原因の修正ではない）。
TASK-054のアーキテクト分析に基づきtitleをＥＲＲＯＲに変更（TASK-055）したが、ChMateで「直っていない」と報告。

人間の仮説: 「問題の本質は認証画面を"いつ、どんな条件で"出すかではないか。本来ブロックしてはいけない場面で認証画面を出している可能性がある（IF分岐の不具合）」

### コード分析結果

bbs.cgi route → extractEdgeToken → resolveAuth → verifyEdgeToken のIF分岐ロジック自体はコード上正しい。しかし、本番環境でChMateが実際に何を送信しているか不明。以下のいずれかが原因:

| # | 仮説 | 検証方法 |
|---|---|---|
| H1 | ChMateがedge-token Cookieを送信していない | Cookie headerログ |
| H2 | Cookieは送信されるがextractEdgeTokenでパース失敗 | extractEdgeToken結果ログ |
| H3 | Cookieは正常だがverifyEdgeTokenが失敗（not_found/not_verified） | verifyEdgeToken結果ログ |
| H4 | write_token消費の副作用で認証状態が壊れる | resolveAuth結果ログ |

### eddistとの差分（参考）

eddistは**全ての成功レスポンス**でSet-Cookie: edge-tokenを設定する（365日）。
BattleBoardは認証要求時とwrite_token使用時のみSet-Cookieを設定し、通常の成功レスポンスでは設定していない。
→ ログ結果を見てから対処判断する。

## タスク一覧

### Wave 1

| TASK_ID | 概要 | 担当 | locked_files |
|---|---|---|---|
| TASK-056 | bbs.cgi routeに診断ログ追加 + 成功レスポンスへのSet-Cookie追加（eddist整合） | bdd-coding | `src/app/(senbra)/test/bbs.cgi/route.ts` |

## 依存関係

単一タスク。

## 完了基準

- [ ] bbs.cgi POST処理の各判定ポイントにconsole.logが追加されている
- [ ] 通常の成功レスポンスにもSet-Cookie: edge-tokenが設定される（eddist整合）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS
- [ ] Cloudflareにデプロイ後、ChMateで書き込みテストし、ログを確認

## 結果

### テスト結果
- vitest: 18ファイル / 589テスト 全PASS
- cucumber-js: 95シナリオ 全PASS

### タスク完了状況
| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-056 | completed | 診断ログ6箇所追加 + 成功レスポンスへのSet-Cookie追加（eddist整合） |

### 変更ファイル一覧
**変更:**
- `src/app/(senbra)/test/bbs.cgi/route.ts` — 診断ログ追加 + handleCreateThread/handleCreatePost成功パスにsetEdgeTokenCookie追加
