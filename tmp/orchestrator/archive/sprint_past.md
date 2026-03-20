# スプリント過去情報アーカイブ

> sprint_current.md から移植した、今後のスプリントで参照不要な履歴情報。

## 完了済みスプリント成果（Sprint-44〜74）

### Sprint-74の成果
- TASK-198: 8ページ分のE2Eスモークテスト追加（/dev, /register/email, /register/discord, /admin×4, /threads/[threadId]）+ カバレッジスクリプト更新
- TASK-199: admin-user-repository.ts loginWithPassword RLSバグ修正（signInWithPassword後のセッション汚染）+ 単体テスト17件
- TASK-200: cleanupLocal から edge_tokens 削除を除外（フィクスチャ作成データの消失防止）
- TASK-201: mypage API 4ルートの認証方式統一（findByAuthToken → verifyEdgeToken）+ auth.fixture is_verified修正
- テスト: vitest 1412件全PASS / cucumber-js 240 passed, 16 pending / playwright navigation 19件全PASS

### Sprint-73の成果
- TASK-196: マイページにログアウトボタン追加（本登録ユーザーのみ表示、確認ダイアログ付き）+ 単体テスト5件
- TASK-197: IBotRepository に incrementAccusedCount 追加 + AccusationService.accuse() 内呼び出し追加 + InMemory版実装 + 単体テスト2件 + LL-010追記

### Sprint-72の成果
- TASK-195: IBotRepository に incrementTotalPosts 追加 + executeBotPost 内呼び出し追加 + InMemory版実装 + 単体テスト2件

### Sprint-71の成果
- TASK-194: package.json `"next": "~16.1.6"`（実インストール 16.1.7）+ TD-ARCH-001 更新
- インシデント記録: `tmp/reports/INCIDENT-CF1101.md`
- 備忘: issue #1157 の対応状況を 2026-03-24 頃にチェック（ウォッチリスト登録済み）

### Sprint-70の成果
- TASK-191: CommandHandlerResult に eliminationNotice フィールド追加 + PostService で★システム名義の独立レス投稿ロジック実装 + BDDステップ実検証化
- TASK-192: bot_system.steps.ts の assert(true) 空検証を InMemory リポジトリ実検証に格上げ
- TASK-193: /register/email（メール本登録フォーム）と /register/discord（Discord連携開始ページ）を新規作成

### Sprint-69の成果
- TASK-190: 重複テスト削除（-26テスト）

### Sprint-68の成果
- TASK-187/188: Thread型統合実装
- TASK-186: test-auditor全件監査（再構成版）

### Sprint-67の成果
- TASK-185: コマンドパーサー ルール9 検証・バグ修正

### Sprint-66の成果（Phase 5再検証）
- 全APPROVE

### Sprint-65の成果
- TASK-177/178/179: AnchorPopup配置 + web-ui.md修正 + E2Eスモークテスト更新

### Sprint-64の成果（Phase 5検証サイクル）
- WARNING → Sprint-65で修正済

### Sprint-63〜59の成果
- UI構造改善（設計〜BDDステップ定義）

### Sprint-58の成果
- BOT稼働ブロッカー全解消

### Sprint-57〜56の成果
- Phase 5差し戻し修正 + 検証サイクル

### Sprint-55の成果
- Discord OAuth ルートハンドラー実装

### Sprint-54の成果
- 荒らし役BOT本番稼働基盤（Internal API + cron）

### Sprint-53〜44の成果
- PostListLiveWrapper修正、CommandService本番修正、subject.txt 304修正、UUID修正、command-parser改善、固定スレッド自動デプロイ、統合テスト拡充、Phase 5検証+修正

## 完了済み人間タスク

### HUMAN-005: 本番管理者登録 + .env.prod.smoke 設定 → 完了（2026-03-20）
`.env.prod.smoke` の全必要変数設定済み。本番スモークテスト 23/23 全PASS。

### HUMAN-001: 荒らし役BOT本番稼働のための仕様決定 → 確定済み（2026-03-18）
TDR-010 として D-07 に記録済み。議論経緯: `tmp/archive/discussion_bot_cron_design.md`

### HUMAN-002: Discord OAuth設定 → 完了（2026-03-19）
Sprint-55で実装完了。

## 完了済みAI側アクション

| 人間タスク完了 | AI側で実行するスプリント |
|---|---|
| HUMAN-001 完了 | → Sprint-54で実装完了（Internal API + cron + DB） |
| HUMAN-002 完了 | → Sprint-55で /api/auth/callback + Discord登録/ログインルート実装完了 |

## 解決済みバグ

- `>>N → UUID`変換未実装 → Sprint-50で解消
- 専ブラsubject.txtで新規スレッドが反映されない → Sprint-51で解消（本番確認済み）
- CF Workers Error 1101 → Sprint-71で解消（Next.js ダウングレード。issue #1157 修正後に再アップグレード予定）

## 設計書陳腐化レビュー（2026-03-19 人間実施）

### 即時修正（完了）
- D-10 §2: Cucumber.js ESM記述の事実訂正（コミット 2f3d146）
- TDR-006: Next.js 16でのキャッシュデフォルト変更を注記追記（コミット 2f3d146）

## 専ブラ実機テスト状況

| 専ブラ | ホスト | 読み取り | 書き込み | 備考 |
|---|---|---|---|---|
| Siki | Vercel | OK | OK | 正常動作 |
| Siki | Cloudflare | OK | OK | 正常動作 |
| ChMate | Vercel | NG | NG | HTTP:80→308リダイレクト（既知。Vercel仕様） |
| ChMate | Cloudflare | OK | OK | 正常動作 |
