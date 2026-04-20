# PAT優先化・senbra→web正規化 実装計画

作成日: 2026-04-19
対象: 専ブラ認証後の Web 本登録導線断絶、および PAT による復帰不全
前提:
- `docs/architecture/components/user-registration.md` の改訂案を採用する
- `docs/architecture/components/authentication.md` の改訂案を採用する
- `docs/architecture/components/web-ui.md` の改訂案を採用する
- `features/user_registration.feature` および `features/specialist_browser_compat.feature` の改訂ドラフトを受け入れ基準として採用する

## 1. 目的

以下の2点を同時に解決する。

1. 専ブラの認証URLを通常ブラウザで開いた後、同一ユーザーのまま Web 本登録導線へ自然接続できるようにする
2. 専ブラの mail 欄に PAT が入力された場合、Cookie の状態にかかわらず PAT を本人性主張の正本として扱い、必要なら Cookie を上書きして復帰できるようにする

## 2. 非目的

- 管理者認証の変更
- `mypage` の `web` channel 制約の緩和
- 専ブラ互換 Cookie 属性の変更
- PAT の複数発行対応

## 3. 実装方針

### 3.1 認証の基本方針

- Web UI の会員機能は `web` channel の edge-token のみを認可根拠とする
- 専ブラ投稿では、mail 欄に PAT がある場合は PAT を最優先で評価する
- `/api/auth/verify` は `senbra -> web` の唯一の正規化ポイントとする

### 3.2 認証優先順位

専ブラ投稿時の認証順序は以下に変更する。

1. PAT
2. edge-token Cookie
3. write_token
4. 未認証

### 3.3 PAT の扱い

- PAT が有効で、現在の Cookie が同一ユーザーなら Cookie を再利用する
- PAT が有効で、現在の Cookie が欠落・失効・別ユーザーなら PAT 所有者向けの新しい `senbra` token を発行し Cookie を上書きする
- PAT が無効なら、既存 Cookie が有効でも失敗とする

## 4. 作業分解

### W1. edge-token の channel 対応を実装

目的:
- 認証判定が `channel` を返せる状態にする
- token 発行時に `web` / `senbra` を明示できるようにする

主な対象:
- `src/lib/services/auth-service.ts`
- `src/lib/repositories/*` または `src/lib/infrastructure/*` の token 参照箇所
- DB マイグレーション定義

作業内容:
- `verifyEdgeToken()` の返却値に `channel` を追加
- edge-token 発行 API もしくは内部関数に `channel` 指定を追加
- `edge_tokens.channel` が未実装ならマイグレーションを追加
- 既存データ移行方針をコードへ反映する

完了条件:
- `web` token と `senbra` token を区別して検証できる

### W2. `/api/auth/verify` の `senbra -> web` 正規化を実装

目的:
- 専ブラの認証URLを通常ブラウザで開いた後、同一ユーザーで Web 導線へ進めるようにする

主な対象:
- `src/app/api/auth/verify/route.ts`
- 必要に応じて `src/app/(web)/auth/verify/page.tsx`

作業内容:
- Turnstile 成功後、入力 token が `senbra` channel の場合は同一 `user_id` に対する新しい `web` token を発行
- ブラウザ Cookie を新しい `web` token で上書き
- redirect 後に `mypage` / 本登録 API が同一ユーザーとして継続することを確認
- `senbra` token をそのまま Web Cookie に残し続ける経路を閉じる

完了条件:
- 専ブラ認証リンク経由のブラウザ認証で新規仮ユーザーが作られない
- 認証後に `mypage` へ到達できる

### W3. bbs.cgi の PAT 優先化を実装

目的:
- Cookie 分岐時でも PAT で同一ユーザーへ復帰できるようにする

主な対象:
- `src/app/(senbra)/test/bbs.cgi/route.ts`
- `src/lib/services/registration-service.ts` または PAT 関連サービス
- `src/lib/services/auth-service.ts`

作業内容:
- mail 欄の PAT 抽出を Cookie 判定より前に実行
- `loginWithPat(patToken, currentEdgeToken?)` 相当のサービス処理を追加
- PAT 所有者と Cookie 所有者が一致する場合だけ Cookie 再利用
- 不一致なら新しい `senbra` token を発行し、Cookie を上書き
- 無効 PAT は即時エラー

完了条件:
- 別ユーザー Cookie が残っていても PAT 所有者として投稿される
- stale cookie があっても PAT で復帰できる

### W4. Web UI を channel-aware にする

目的:
- `senbra` token のまま Web 会員機能が見えてしまう不整合を解消する

主な対象:
- `src/lib/services/auth-service.ts`
- `src/app/(web)/layout.tsx`
- `src/app/api/mypage/route.ts`
- `src/app/(web)/mypage/page.tsx`
- Header 系コンポーネント

作業内容:
- Layout 用の認証状態取得に `channel` を含める
- Header / Layout は `web` channel でのみ `mypage` 等の導線を表示
- マイページの PAT 表示を `#pat_<token>` のみに変更
- 生 token 単体表示は廃止

完了条件:
- `senbra` token 状態で Web 会員導線が誤表示されない
- マイページの PAT 表示が要件どおりになる

### W5. テスト更新と追加

目的:
- 仕様変更をテストで固定し、回帰を防ぐ

主な対象:
- `src/__tests__/app/(senbra)/test/bbs.cgi/pat-integration.test.ts`
- `src/__tests__/api/mypage/channel-guard.test.ts`
- `src/app/(senbra)/__tests__/route-handlers.test.ts`
- `/api/auth/verify` 周辺の route test
- 必要なら BDD step / Cucumber シナリオ対応

最低限追加すべきケース:
- `senbra` token を通常ブラウザで認証すると同一 user の `web` token に正規化される
- PAT 入力時に同一ユーザー Cookie は再利用される
- PAT 入力時に別ユーザー Cookie があっても PAT 所有者へ上書きされる
- PAT 無効時は有効 Cookie があっても失敗する
- `mypage` は `web` token のみ通る
- マイページには `#pat_<token>` のみ表示される

完了条件:
- 旧仕様のテスト失敗箇所を新仕様に合わせて更新できている
- 新仕様の分岐を unit / route / integration でカバーしている

## 5. 推奨実装順序

1. W1: token の channel 対応
2. W2: `/api/auth/verify` の正規化
3. W3: bbs.cgi の PAT 優先化
4. W4: Web UI の channel-aware 化
5. W5: テスト更新

理由:
- W2 と W3 は W1 の `channel` 依存が強い
- UI 修正は認証の内部仕様が固まった後の方が安全
- 旧テストは仕様変更で必ず壊れるため、最後にまとめて更新する方が効率的

## 6. 影響ファイルの初期見積もり

実装候補:
- `src/app/api/auth/verify/route.ts`
- `src/app/(senbra)/test/bbs.cgi/route.ts`
- `src/app/api/mypage/route.ts`
- `src/app/(web)/layout.tsx`
- `src/app/(web)/mypage/page.tsx`
- `src/lib/services/auth-service.ts`
- `src/lib/services/registration-service.ts`
- token repository / query 実装
- DB migration files

テスト候補:
- `src/__tests__/app/(senbra)/test/bbs.cgi/pat-integration.test.ts`
- `src/__tests__/api/mypage/channel-guard.test.ts`
- `src/app/(senbra)/__tests__/route-handlers.test.ts`
- `/api/auth/verify` 関連 test

## 7. 技術的リスク

### R1. 既存 token 発行関数が channel 非対応

影響:
- 変更が複数箇所に波及する

対策:
- `issueEdgeToken` 相当の API を単一箇所に寄せ、channel 指定を必須化する

### R2. route test がモック前提で古い仕様を固定している

影響:
- 実装を直してもテストが大量に失敗する

対策:
- 旧期待値を削るのではなく、新仕様の因果に合わせてテスト名と期待値を更新する

### R3. UI が `isAuthenticated` のみで表示制御している

影響:
- API は 403 だが Header は導線を見せる不整合が残る

対策:
- Layout 用 auth status を `channel` 付きに変更し、共通 Header の責務で解消する

### R4. DB に `channel` が未導入またはデータ移行が曖昧

影響:
- ローカルと本番で挙動差が出る

対策:
- migration を必須化し、既存 token の初期 `channel='web'` を明示する

## 8. 完了判定

以下を満たしたら本件の実装完了とする。

- 専ブラ認証リンク経由で通常ブラウザ認証した場合、同一ユーザーで `mypage` / 本登録導線へ進める
- 専ブラ投稿で PAT を入れた場合、別ユーザー Cookie が残っていても PAT 所有者として投稿される
- 無効 PAT は Cookie の有無にかかわらず拒否される
- マイページの PAT 表示は `#pat_<token>` のみである
- 関連 unit / route / integration test が新仕様で通る

## 9. 実装開始時の最初のタスク

最初の1タスクは以下とする。

1. `edge_tokens.channel` の現状実装有無を確認
2. `verifyEdgeToken` と token 発行経路を `channel` 対応にする
3. その差分を前提に `/api/auth/verify` の route test を追加する

理由:
- ここが固まらないと PAT 優先化も Web UI も安全に触れないため
