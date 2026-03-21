---
task_id: TASK-120
sprint_id: Sprint-41
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T13:00:00+09:00
updated_at: 2026-03-17T13:00:00+09:00
locked_files:
  - features/未実装/bot_system.feature
  - features/未実装/user_registration.feature
  - config/bot_profiles.yaml
  - docs/specs/user_registration_state_transitions.yaml
  - docs/architecture/components/user-registration.md
  - features/bot_system.feature
  - features/user_registration.feature
  - features/mypage.feature
  - features/support/in-memory/attack-repository.ts
  - src/lib/infrastructure/repositories/user-repository.ts
  - src/lib/services/bot-service.ts
  - src/lib/infrastructure/repositories/edge-token-repository.ts
  - src/lib/infrastructure/repositories/bot-repository.ts
  - src/lib/domain/models/user.ts
  - src/app/(web)/mypage/page.tsx
  - src/lib/services/mypage-service.ts
  - src/lib/services/handlers/attack-handler.ts
  - src/__tests__/lib/services/handlers/attack-handler.test.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - src/lib/domain/rules/elimination-reward.ts
  - src/lib/domain/rules/__tests__/elimination-reward.test.ts
  - src/lib/infrastructure/repositories/attack-repository.ts
  - src/__tests__/lib/infrastructure/repositories/attack-repository.test.ts
  - src/lib/domain/models/bot.ts
  - src/__tests__/app/(senbra)/test/bbs.cgi/pat-integration.test.ts
  - src/lib/domain/rules/mypage-display-rules.ts
  - src/app/(senbra)/test/bbs.cgi/route.ts
  - src/__tests__/app/(web)/mypage/mypage-registration.test.ts
  - src/__tests__/lib/services/registration-service.test.ts
  - src/__tests__/app/api/auth/pat.test.ts
  - src/__tests__/app/api/auth/logout.test.ts
  - src/__tests__/app/api/auth/login.test.ts
  - src/__tests__/app/api/auth/register.test.ts
  - src/app/api/auth/pat/route.ts
  - src/app/api/auth/logout/route.ts
  - src/app/api/auth/login/route.ts
  - src/app/api/auth/register/route.ts
  - src/lib/services/registration-service.ts
---

## タスク概要

`features/未実装/` ディレクトリの2ファイルを削除し、全ソースファイル内の `features/未実装/` パス参照を `features/` に修正する。

`features/` 直下と `features/未実装/` に同一内容のファイルが重複しているため、未実装ディレクトリ側を削除する（正本は `features/` 直下）。

## 対象BDDシナリオ

- なし（パス参照のコメント修正のみ）

## 必読ドキュメント（優先度順）

- なし（機械的な置換作業）

## 入力（前工程の成果物）

- なし

## 出力（生成すべきファイル）

### 削除対象
- `features/未実装/bot_system.feature` — 削除
- `features/未実装/user_registration.feature` — 削除
- `features/未実装/` ディレクトリ — 空になったら削除

### 修正対象（コメント/JSDoc内のパス参照を一括置換）

以下の全ファイル内で `features/未実装/bot_system.feature` → `features/bot_system.feature`、`features/未実装/user_registration.feature` → `features/user_registration.feature` に置換する。

**設定・ドキュメント:**
- `config/bot_profiles.yaml`
- `docs/specs/user_registration_state_transitions.yaml`
- `docs/architecture/components/user-registration.md`

**featureファイル:**
- `features/bot_system.feature` — 先頭行のパスコメント修正
- `features/user_registration.feature` — 先頭行のパスコメント修正
- `features/mypage.feature`

**BDDサポート:**
- `features/support/in-memory/attack-repository.ts`

**ソースコード:**
- `src/lib/infrastructure/repositories/user-repository.ts`
- `src/lib/services/bot-service.ts`
- `src/lib/infrastructure/repositories/edge-token-repository.ts`
- `src/lib/infrastructure/repositories/bot-repository.ts`
- `src/lib/domain/models/user.ts`
- `src/app/(web)/mypage/page.tsx`
- `src/lib/services/mypage-service.ts`
- `src/lib/services/handlers/attack-handler.ts`
- `src/lib/domain/rules/elimination-reward.ts`
- `src/lib/infrastructure/repositories/attack-repository.ts`
- `src/lib/domain/models/bot.ts`
- `src/lib/domain/rules/mypage-display-rules.ts`
- `src/app/(senbra)/test/bbs.cgi/route.ts`
- `src/app/api/auth/pat/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/lib/services/registration-service.ts`

**テストファイル:**
- `src/__tests__/lib/services/handlers/attack-handler.test.ts`
- `src/__tests__/lib/services/bot-service.test.ts`
- `src/lib/domain/rules/__tests__/elimination-reward.test.ts`
- `src/__tests__/lib/infrastructure/repositories/attack-repository.test.ts`
- `src/__tests__/app/(senbra)/test/bbs.cgi/pat-integration.test.ts`
- `src/__tests__/app/(web)/mypage/mypage-registration.test.ts`
- `src/__tests__/lib/services/registration-service.test.ts`
- `src/__tests__/app/api/auth/pat.test.ts`
- `src/__tests__/app/api/auth/logout.test.ts`
- `src/__tests__/app/api/auth/login.test.ts`
- `src/__tests__/app/api/auth/register.test.ts`

### 対象外（修正しない）
- `tmp/` 配下のアーカイブファイル — 歴史的記録のためそのまま残す

## 完了条件

- [ ] `features/未実装/` ディレクトリが削除されていること
- [ ] ソースコード/設定ファイル内に `features/未実装/` への参照が残っていないこと（`tmp/` 配下を除く）
- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` 219 passed
- [ ] テストコマンド: `npx vitest run && npx cucumber-js`

## スコープ外

- `tmp/` 配下のアーカイブファイルの修正
- コメント以外のコード変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: features/未実装/ 2ファイル削除 + ディレクトリ削除、全ファイルのパス参照置換完了、テスト全件PASS
- 次にすべきこと: なし
- 未解決の問題: なし
- 備考: locked_files外のsrc/__tests__/lib/infrastructure/repositories/edge-token-repository.test.tsも完了条件（tmp/外の参照ゼロ）を満たすため修正

### 進捗ログ
- features/未実装/ 削除: bot_system.feature, user_registration.feature, ディレクトリ本体
- パス参照置換完了: 設定・ドキュメント3件、featureファイル3件、BDDサポート1件、ソースコード18件、テスト12件
  - 合計37ファイル修正
  - tmp/ 配下は対象外（歴史的記録として保持）

### テスト結果サマリー
- npx vitest run: 39 test files, 1047 tests PASS
- npx cucumber-js: 228 scenarios (9 pending, 219 passed), 1226 steps (9 pending, 20 skipped, 1197 passed)
- 完了条件をすべて満たした
