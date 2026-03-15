---
task_id: TASK-056
sprint_id: Sprint-20
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T06:00:00+09:00
updated_at: 2026-03-15T06:00:00+09:00
locked_files:
  - src/app/(senbra)/test/bbs.cgi/route.ts
---

## タスク概要

ChMate毎回認証問題の根本原因を特定するため、bbs.cgi route handlerに診断ログを追加する。
併せて、eddistとの整合性を確保するため、通常の成功レスポンスにもSet-Cookie: edge-tokenを設定する。

## 必読ドキュメント（優先度順）
1. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — 修正対象
2. [参考] `src/lib/infrastructure/adapters/bbs-cgi-parser.ts` — extractEdgeTokenの実装

## 出力（生成すべきファイル）
- `src/app/(senbra)/test/bbs.cgi/route.ts` — 診断ログ追加 + Set-Cookie追加

## 完了条件
- [ ] POST handler内の以下の判定ポイントにconsole.logを追加:
  1. Cookie header受信時: `[bbs.cgi] Cookie header: <rawValue>`
  2. extractEdgeToken結果: `[bbs.cgi] edgeToken from cookie: <value|null>`
  3. write_token検出時: `[bbs.cgi] write_token detected: <true|false>`
  4. write_token検証結果: `[bbs.cgi] write_token verification: <valid|invalid>`
  5. resolveAuth結果（handleCreateThread/handleCreatePost内）: `[bbs.cgi] resolveAuth result: authenticated=<true|false>, reason=<null|not_found|not_verified>`
  6. Set-Cookie設定時: `[bbs.cgi] Setting edge-token cookie: <tokenPrefix>...`
- [ ] handleCreateThread/handleCreatePostの成功レスポンス（write_token経由でない通常パス）にもsetEdgeTokenCookie()を追加（eddistは全成功レスポンスでSet-Cookieを設定する）
  - 注意: `parsed.edgeToken` がnullの場合（authRequiredパスで先にreturnされる）、成功パスには到達しないためnullチェック不要
- [ ] ログにedge-tokenの全文は出力しない（セキュリティ配慮: 先頭8文字+...）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外
- bbs-cgi-parser.ts, post-service.ts, auth-service.tsの変更
- BDDシナリオの変更
- ログ基盤の導入（console.logのみ使用）

## 補足・制約

### ログフォーマット
```
[bbs.cgi] POST received - Cookie: <present|absent>, edgeToken: <prefix...|null>
[bbs.cgi] write_token: detected=<bool>, valid=<bool|N/A>
[bbs.cgi] auth result: authenticated=<bool>, reason=<reason|N/A>
[bbs.cgi] response: type=<success|authRequired|error>, setCookie=<bool>
```

### 成功レスポンスへのSet-Cookie追加

現在の通常成功パス（write_tokenなし・Cookie認証済み）:
```typescript
// handleCreatePost L350-352
const successHtml = responseBuilder.buildSuccess(parsed.threadKey, boardId);
return buildShiftJisHtmlResponse(successHtml, 200);
// ← Set-Cookieなし
```

eddist整合後:
```typescript
const successHtml = responseBuilder.buildSuccess(parsed.threadKey, boardId);
const response = buildShiftJisHtmlResponse(successHtml, 200);
// 認証済みユーザーのedge-tokenをSet-Cookieで更新（eddist整合）
return parsed.edgeToken ? setEdgeTokenCookie(response, parsed.edgeToken) : response;
```

handleCreateThreadの成功パス（L290-293）も同様に変更する。

### 注意事項
- console.logはCloudflare Workers/Vercelの両方でログとして記録される
- edge-tokenのフル値をログに出力しない（セキュリティリスク）。先頭8文字のみ

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み:
  - [x] POST handler内の診断ログ追加（6箇所）
  - [x] handleCreateThread/handleCreatePostの成功レスポンスへのSet-Cookie追加
  - [x] edge-tokenのセキュリティ配慮（先頭8文字のみログ出力）
  - [x] npx vitest run 全PASS
  - [x] npx cucumber-js 全PASS（95シナリオ）
- 次にすべきこと: なし
- 未解決の問題: なし（incentive feature の「30分以内に他ユーザーのレスが付かなければボーナスは付与されない」シナリオは本変更前から単体実行時に失敗する既存問題。全スイート実行時は通過する）

### 進捗ログ
- 2026-03-15: タスク指示書読み込み、対象ファイル確認
- 2026-03-15: `src/app/(senbra)/test/bbs.cgi/route.ts` に診断ログ追加と成功レスポンスへのSet-Cookie追加を実装
- 2026-03-15: テスト実行確認

### テスト結果サマリー
- Vitest: 18ファイル / 589テスト 全PASS
- Cucumber-js: 95シナリオ 全PASS（全スイート実行時）
  - 注意: incentive feature の「30分以内に他ユーザーのレスが付かなければボーナスは付与されない」シナリオは本変更前から単体実行時にも失敗する既存問題。今回の変更とは無関係。
