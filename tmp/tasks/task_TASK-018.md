---
task_id: TASK-018
sprint_id: Sprint-8
status: escalated
assigned_to: bdd-coding
depends_on: [TASK-016]
created_at: 2026-03-12T14:00:00+09:00
updated_at: 2026-03-12T22:35:00+09:00
locked_files:
  - "[NEW] features/step_definitions/incentive.steps.ts"
---

## タスク概要

incentive.feature の30シナリオに対応するBDDステップ定義を実装し、`npx cucumber-js` で全シナリオをPASSさせる。

## 対象BDDシナリオ

- `features/phase1/incentive.feature` — 全30シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `features/phase1/incentive.feature` — 対象シナリオ全文（279行、最大ボリューム）
2. [必須] `docs/architecture/bdd_test_strategy.md` — D-10 テスト戦略（方針の正本）
3. [必須] `tmp/orchestrator/sprint_8_bdd_guide.md` — Sprint-8固有の実装ガイド（incentive feature別注意点）
4. [必須] `features/support/world.ts` — TASK-016で実装済みのWorldクラス
5. [必須] `features/support/hooks.ts` — フック定義
6. [必須] `features/support/mock-installer.ts` — モック機構
7. [必須] `features/step_definitions/common.steps.ts` — 共通ステップ定義（重複定義を避ける）
8. [必須] `src/lib/services/post-service.ts` — テスト対象サービス（createPost, createThread）
9. [必須] `src/lib/services/incentive-service.ts` — テスト対象サービス（evaluateOnPost）
10. [必須] `src/lib/services/currency-service.ts` — 通貨操作（残高検証で利用）
11. [必須] `src/lib/domain/rules/incentive-rules.ts` — インセンティブ判定ルール
12. [必須] `src/lib/domain/models/incentive.ts` — IncentiveLog, IncentiveResult 型定義
13. [参考] `features/support/in-memory/incentive-log-repository.ts` — インメモリ実装（重複ガードの動作把握）
14. [参考] `features/support/in-memory/currency-repository.ts` — インメモリ実装
15. [参考] `src/lib/domain/models/*.ts` — ドメインモデルの型定義

## 入力（前工程の成果物）

- TASK-016で構築済みのBDDインフラ（World, Hooks, モック機構, 共通ステップ）

## 出力（生成すべきファイル）

- `features/step_definitions/incentive.steps.ts`

## 完了条件

- [ ] `npx cucumber-js` で incentive.feature の30シナリオが全てPASSED
- [ ] `npx vitest run` が引き続き全PASS（既存テストを壊さない）
- [ ] テストコマンド: `npx cucumber-js` および `npx vitest run`

## スコープ外

- authentication / posting / thread / currency のステップ定義（TASK-017で実施）
- features/support/ 配下のインフラファイルの変更（必要な場合はエスカレーション）
- common.steps.ts の変更（必要な場合はエスカレーション）
- featureファイルの変更（禁止）
- locked_files外のファイル変更（必要な場合はエスカレーション）

## 補足・制約

- D-10の方針に従い、IncentiveServiceを直接呼ばず **PostService.createPost / createThread 経由** でインセンティブを発火させること
- 30シナリオと大量だが、ステップ文言のパラメータ化で定義数を圧縮すること。Cucumber Expression の `{string}` / `{int}` パラメータ型やOptional構文を活用する
- 遅延評価ボーナス（hot_post, thread_revival, thread_growth）は複数ユーザーの連続書き込みを時系列でシミュレーションする必要がある
- 時間制約（60分以内、30分以内、24時間以上等）はWorldの時刻制御機構で境界値を再現する
- incentive-log-repositoryのインメモリ実装はuserId + eventType + contextId + contextDateの一意制約を再現済み。偽陽性に注意
- 共通ステップ（common.steps.ts）の「ユーザーがログイン済みである」「通貨残高が {int} である」等は既に定義済み。重複定義しないこと

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: ESC-TASK-018-2 起票済み（escalated）、作業中断
- 完了済み:
  - 必読ドキュメントの読み込み完了
  - `features/step_definitions/incentive.steps.ts` の実装完了（全30シナリオのステップ定義）
  - `npx cucumber-js --dry-run` で incentive.feature の全30シナリオを認識（ステップ undefined ゼロ）
  - ESC-TASK-018-1 解決後に `npx cucumber-js` で各シナリオの失敗原因を調査・修正
  - 56シナリオ中 54 PASS まで改善（残り2 FAIL）
  - `npx vitest run` は全330テストPASS（既存テスト影響なし）
- 次にすべきこと: ESC-TASK-018-2 の解決を待ち、`incentive-service.ts` の修正後に再テスト
- 未解決の問題:
  1. `new_thread_join` 不発火: `incentive-service.ts` の `isFirstTimeInThread` が `ctx.postId` を除外していないバグ
  2. `thread_revival` 不発火: `revivalPost.createdAt` と `followupPost.createdAt` の比較で同時刻問題、または `evaluateThreadRevivalBonus` の問題

### escalation_resolution
ESC-TASK-018-1 はオーケストレーターが自律判断で解決。`features/support/register-mocks.js` に全リポジトリのキャッシュ事前差し込みを追加済み。モック差し替えは正常に動作する状態になっている。register-mocks.jsの修正はオーケストレーターが直接実施したため、ワーカーは修正不要。`npx cucumber-js` で incentive.feature のシナリオをPASSさせることに集中すること。

### 進捗ログ

**2026-03-12（セッション1）:**
1. 必読ドキュメント（incentive.feature、D-10、sprint_8_bdd_guide、world.ts、hooks.ts、mock-installer.ts、common.steps.ts、post-service.ts、incentive-service.ts、incentive-rules.ts、各インメモリ実装）を全て読み込み完了
2. `features/step_definitions/incentive.steps.ts` を新規作成（全30シナリオ対応の Given/When/Then ステップ定義）
3. `npx cucumber-js --dry-run` で incentive.feature 全30シナリオが認識されることを確認
4. `npx cucumber-js` 実行で全シナリオが `TypeError: Cannot read properties of null` で失敗することを確認
5. 根本原因の特定: `register-mocks.js` が Supabase クライアントのみをモック差し替えしており、リポジトリモジュールは実際の実装が使われる状態
6. エスカレーション `ESC-TASK-018-1` を起票

**2026-03-12（セッション2）:**
7. ESC-TASK-018-1 解決後、`npx cucumber-js` で引き続き全シナリオ失敗（56 failed）を確認
8. オーケストレーター指示の2つの修正を `incentive.steps.ts` に適用:
   - Change 1: BeforeStep の `isWriteStep` 変数と関連ロジックを削除
   - Change 2: When ステップの `_upsert({ balance: 0 })` を条件付きに変更（既存残高がある場合はスキップ）
9. 修正後 36/56 PASS に改善するも 20 FAIL が残存
10. 調査: `world.ts` の `setCurrentTime` バグ（2回呼ぶと `_originalDateNow` が汚染される）を発見
11. `getTodayJst()` を `new Date()` ベースに変更することで `Date.now` スタブの影響を排除 → 51/56 PASS
12. 残り5 FAIL の詳細分析と修正:
    - `今日まだ書き込みもスレッド作成もしていない` ステップの `dailyLoginIntendedWorlds = true` を削除
    - `newThreadJoinTestWorlds` フラグを追加して BeforeStep のダミーレス追加を制御
    - ホットレス When ステップで `reply` ログを事前挿入して重複ガードを有効化
    - スレッド復興ボーナス用の `threadRevivalInactiveTimes` を追加し `lastPostAt` 復元ロジックを実装
    - debug ログを削除
13. 修正後 54/56 PASS に改善
14. 残り2 FAIL は `incentive-service.ts` の実装バグが原因 → ESC-TASK-018-2 起票

**ステップ定義の技術的詳細:**
- 全30シナリオのステップをパラメータ化して定義（重複最小化）
- 日本語+数字の連結（`6日連続`、`10件目`等）は正規表現で対応
- 時刻制御は World の `setCurrentTime/advanceTimeByMinutes` を使用
- 複数ユーザー管理は `namedUsers` Map と `ensureNamedUser` ヘルパー関数で対応
- PostService.createPost / createThread 経由でインセンティブを発火（直接呼び出し禁止に準拠）

### テスト結果サマリー

**npx cucumber-js --dry-run（2026-03-12 実施）:**
```
56 scenarios (1 undefined, 55 skipped)
303 steps (1 undefined, 302 skipped)
```
- 1 undefined は thread.feature の `スレッド "今日の雑談" が存在し 10件のレスがある`（TASK-017のスコープ）
- incentive.feature 30シナリオは全て認識済み

**npx cucumber-js（2026-03-12 初回実施）:**
```
56 scenarios (55 failed, 1 undefined)
303 steps (55 failed, 12 undefined, 228 skipped, 8 passed)
```
- 全シナリオで `TypeError: Cannot read properties of null (reading 'id')` が発生
- 原因: register-mocks.js のモック差し替えがリポジトリに適用されていない（ESC-TASK-018-1 参照）

**npx cucumber-js（2026-03-12 修正後）:**
```
56 scenarios (2 failed, 54 passed)
303 steps (2 failed, 2 skipped, 299 passed)
```
- 54/56 PASS
- 失敗2件:
  1. `未参加のスレッドに初めて書き込むと +3 ボーナスが付与される` — new_thread_join 不発火
  2. `低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと +10 ボーナスが付与される` — thread_revival 不発火
- 原因: `incentive-service.ts` の実装バグ（ESC-TASK-018-2 参照）

**npx vitest run（2026-03-12 実施）:**
```
Test Files  8 passed (8)
Tests       330 passed (330)
```
- 既存テスト全 PASS（Vitest は独自のモック機構を使用するため影響なし）
