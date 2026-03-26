# R-004 Attack Report

レビュアー: Red Team
対象スプリント: Sprint-119 / Phase 3 本登録機能

---

## ATK-R004-1

**重大度**: CRITICAL

**問題の要約**: `GET /api/mypage` が PAT（パーソナルアクセストークン）を平文で全クライアントに返却するため、XSS・中間者攻撃・ログ漏洩で PAT が奪われると本人として永続的に書き込みが可能になる。

**詳細**:

`MypageInfo` インターフェースに `patToken: string | null` が含まれ（`mypage-service.ts:73`）、`getMypage` はそれを `patToken: user.patToken` として直接セットする（`mypage-service.ts:264`）。`GET /api/mypage` のルートは `NextResponse.json(mypageInfo, { status: 200 })` でこのオブジェクトをそのままレスポンスボディに流す（`src/app/api/mypage/route.ts:81`）。

PAT は専ブラのメール欄に `#pat_<token>` 形式で設定するだけで edge-token Cookie を再発行できる認証資格情報である（`user_registration.feature:189-192`）。BDDシナリオ「マイページで PAT を確認できる」は「PAT が常に表示されている」と規定しているが、これはマイページ UI への表示を意味する。API レスポンスが PAT 平文を含む点は別問題であり、`authToken` を CR-002 で除去した設計意図（`mypage-service.ts:39-41`）と矛盾する。

Cookie の `HttpOnly` フラグや HTTPS が守る edge-token と異なり、PAT は JSON ペイロードとして JavaScript から直接読み取り可能な状態で返却される。

**再現条件**:
- 本登録済みユーザーが `GET /api/mypage` を呼ぶ、または XSS により同エンドポイントへの fetch が実行される
- レスポンスボディの `patToken` フィールドを読み取るだけで PAT が入手可能

---

## ATK-R004-2

**重大度**: CRITICAL

**問題の要約**: `upgradeToPremium` のサービス層は仮ユーザーを `NOT_REGISTERED` で弾くが、API ルートはそのコードを `404 Not Found` にマッピングしており、フロントエンドが課金失敗を「ユーザー不存在」と誤判定して課金ブロックを解除できる。

**詳細**:

`upgradeToPremium` は仮ユーザー（`registrationType === null`）に対して `{ success: false, code: "NOT_REGISTERED" }` を返す（`mypage-service.ts:370-376`）。`POST /api/mypage/upgrade` のルートはこのエラーコードを `ALREADY_PREMIUM` 以外の catch-all として `404` にマッピングする（`src/app/api/mypage/upgrade/route.ts:73-76`）。

レスポンスのステータスコードは `404` であり、エラーコードは `"NOT_REGISTERED"` だが、フロントエンドが `result.code` を文字列比較せず `status === 409`（`ALREADY_PREMIUM`）のみをブロック条件にしている場合、`404` を「ユーザーが見つからない・再ロードが必要」と解釈してエラーダイアログを閉じた後に再試行が通ることになる。

加えて、BDDステップ「課金ボタンは無効化されている」（`mypage.steps.ts:517-537`）は `ALREADY_PREMIUM` または `NOT_REGISTERED` のいずれかを許容するが、route.ts はこの区別を消し去る。シナリオ「仮ユーザーは課金できない」はサービス層レベルでのみ成立し、HTTP API レベルでの課金阻止は壊れている。

**再現条件**:
- 仮ユーザーがマイページで課金ボタンを押す（`POST /api/mypage/upgrade` が呼ばれる）
- フロントエンドが HTTP ステータスコードで制御フローを分岐しており、`404` を「ブロック対象外」として扱う実装になっている場合

---

## ATK-R004-3

**重大度**: HIGH

**問題の要約**: 単体テスト `mypage-service.test.ts` は「仮ユーザーは課金できない」ケースを完全に欠落しており、`upgradeToPremium` の `NOT_REGISTERED` パスはテストで未検証のためリグレッションが検出されない。

**詳細**:

`mypage-service.test.ts` の `upgradeToPremium` テストスイートに `NOT_REGISTERED` を検証するケースが存在しない（ファイル全体を検索した結果 `NOT_REGISTERED` への言及はゼロ）。`FREE_USER` フィクスチャは `registrationType: "email"` を持つ本登録済みユーザーとして定義されており（`mypage-service.test.ts:74-75`）、仮ユーザー（`registrationType: null`）のフィクスチャは定義されていない。

`upgradeToPremium` の `NOT_REGISTERED` 分岐（`mypage-service.ts:370-376`）は、BDDシナリオ「仮ユーザーは課金できない」の中核をなすビジネスルールであるにもかかわらず、単体テストによる保護がない。将来の `upgradeToPremium` リファクタリングやフィールド名変更（例: `registrationType` → `isRegistered`）で当該分岐が壊れてもテストはグリーンのままである。

BDD ステップ「課金ボタンは無効化されている」（`mypage.steps.ts:517`）は統合テストとして存在するが、インメモリリポジトリを使った BDD レベルの検証と、モックを使ったサービス層単体テストは独立した防衛層であり、後者の欠落は許容できない。

**再現条件**:
- `upgradeToPremium` に変更が加わったとき（単体テストはグリーンのままリグレッションが混入する）
- CI で `npx vitest run` のみを実行し、`npx cucumber-js` をスキップした場合、仮ユーザーの課金制約の破壊が全く検出されない
