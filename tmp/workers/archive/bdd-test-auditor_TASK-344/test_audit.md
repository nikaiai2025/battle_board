# テスト監査レポート

> 実行日: 2026-03-27
> 対象スプリント: Sprint-134
> タスクID: TASK-344-audit

## 1. Pendingシナリオ管理状況

### 概要

command_copipe.feature は全8シナリオが通常実行であり、pendingステップは含まれない。

Sprint-134 の変更ファイル（`features/step_definitions/command_system.steps.ts`）に新規pendingは追加されていない。

プロジェクト全体のpending状況（参考情報、Sprint-134スコープ外のため詳細監査は省略）:

| ファイル | pending数 | 分類 |
|---|---|---|
| bot_system.steps.ts | 6 | DOM/CSS表示 -- D-10 7.3.1準拠。代替: e2e/flows/bot-display.spec.ts |
| specialist_browser_compat.steps.ts | 4 | インフラ制約 -- D-10 7.3.1準拠。Sprint-20実機検証済み |
| user_registration.steps.ts | 4 | 外部OAuth依存 -- D-10 7.3.1準拠 |

Sprint-134 スコープ内のpending: **0件**

## 2. テストピラミッド

| 層 | ファイル数 | テスト数 | 判定 |
|---|---|---|---|
| 単体テスト (Vitest) | 96 | 1,914 | 正常 |
| BDDサービス層 (Cucumber) | 25 steps + 25 features | 394 scenarios | 正常 |
| E2E (Playwright) | 9 | 70 | 正常 |

**判定:** 正常なピラミッド構造。下層（単体テスト 1,914件）> 中層（BDDサービス層 394シナリオ）> 上層（E2E 70件）。逆ピラミッドの兆候なし。

**ドメインルールのテストカバレッジ:**

`src/lib/domain/rules/` 配下12ファイル全てに対応する単体テストが存在する。

| ドメインルール | テストファイル |
|---|---|
| daily-id.ts | `__tests__/daily-id.test.ts` |
| anchor-parser.ts | `__tests__/anchor-parser.test.ts` |
| incentive-rules.ts | `__tests__/incentive-rules.test.ts` |
| grass-icon.ts | `__tests__/grass-icon.test.ts` |
| elimination-reward.ts | `__tests__/elimination-reward.test.ts` |
| pagination-parser.ts | `__tests__/pagination-parser.test.ts` |
| url-detector.ts | `__tests__/url-detector.test.ts` |
| mypage-display-rules.ts | `mypage-registration.test.ts`（全7エクスポート関数をテスト） |
| theme-rules.ts | `__tests__/theme-rules.test.ts` |
| validation.ts | `__tests__/validation.test.ts` |
| accusation-rules.ts | `__tests__/accusation-rules.test.ts` |
| command-parser.ts | `__tests__/command-parser.test.ts` |

下層空洞化の兆候なし。

## 3. Featureカバレッジ: command_copipe.feature

| feature | 総シナリオ | 通常実行 | pending管理下 | 未定義 |
|---|---|---|---|---|
| command_copipe.feature | 8 | 8 | 0 | 0 |

### ステップ定義マッピング詳細

全8シナリオの全ステップに対するステップ定義の存在を確認した。

**Background（3ステップ）:**

| ステップ | 定義場所 |
|---|---|
| コマンドレジストリに以下のコマンドが登録されている: | command_system.steps.ts L98 |
| ユーザーがログイン済みである | common.steps.ts |
| 以下のコピペAAが登録されている: | command_copipe.steps.ts L55 |

**シナリオ固有ステップ:**

| ステップ | 定義場所 |
|---|---|
| 本文に {string} を含めて投稿する | command_system.steps.ts |
| 書き込みがスレッドに追加される | specialist_browser_compat.steps.ts |
| 書き込み本文は {string} がそのまま表示される | command_system.steps.ts L1097 |
| 登録済みAAから1つが選択されレス末尾にマージ表示される | command_copipe.steps.ts L84 |
| /^「(.+)」のAAがレス末尾にマージ表示される$/ (regex) | command_copipe.steps.ts L139 |
| 部分一致したAAからランダムに1件がレス末尾にマージ表示される | command_copipe.steps.ts L180 |
| マージ表示に {string} を含む通知が付与される | command_copipe.steps.ts L222 |
| レス末尾にエラー {string} がマージ表示される | command_system.steps.ts L1390 |

未定義ステップ: **0件**

## 4. ステップ定義の実質性

`features/step_definitions/` 配下で `assert(true)` / `expect(true)` パターンを検索した。**検出件数: 0件。**

command_copipe.steps.ts 内の全ステップ定義を読み取り、アサーション内容を確認した。

| ステップ | アサーション内容 | 判定 |
|---|---|---|
| 以下のコピペAAが登録されている: | InMemoryCopipeRepo._insert を実行 | 実質あり |
| 登録済みAAから1つが選択されレス末尾にマージ表示される | inlineSystemInfo != null, includes("【") && includes("】") | 実質あり |
| /^「(.+)」のAAがレス末尾にマージ表示される$/ | inlineSystemInfo != null, includes(expectedName) | 実質あり |
| 部分一致したAAからランダムに1件がレス末尾にマージ表示される | inlineSystemInfo != null, includes("【") && includes("】") | 実質あり |
| マージ表示に {string} を含む通知が付与される | inlineSystemInfo != null && includes(expectedText) | 実質あり |

**補強テスト:** `src/__tests__/lib/services/handlers/copipe-handler.test.ts` に37件の単体テストが存在し、featureの全8シナリオの検索ロジック（ランダム、完全一致、部分一致、content フォールバック、一致なし）およびエッジケースを網羅的に検証している。

## 5. レビューサマリー

| 重要度 | 件数 | ステータス |
|---|---|---|
| CRITICAL | 0 | pass |
| HIGH | 0 | pass |
| MEDIUM | 0 | pass |
| LOW | 0 | pass |

**判定: APPROVE**

command_copipe.feature の全8シナリオにステップ定義が存在し、pendingなし、スタブアサーションなし。テストピラミッドは健全。ドメインルールのテストカバレッジに空洞なし。
