# テスト監査レポート

> 実行日: 2026-03-27
> 対象スプリント: Sprint-134
> タスクID: TASK-344-audit
> 前回監査: P5-TA-S97（Sprint-96/97完了時点）

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingステップ数 | 14 |
| D-10 S7.3適合 | 14 / 14 |
| 代替テスト作成済み | 8 / 14 |
| 代替テスト未作成（技術的負債） | 6 |
| Phase未実装（S7.3範囲外） | 0 |

### Sprint-134対象: pending 0件

command_copipe.feature は全8シナリオが通常実行であり、pendingステップは含まれない。Sprint-134 の変更ファイル（`features/step_definitions/command_system.steps.ts`）にも新規pendingは追加されていない。

### プロジェクト全体のpending内訳（参考情報）

| ファイル | ステップ数 | 理由 | 代替テスト | S7.3準拠 |
|---|---|---|---|---|
| bot_system.steps.ts | 6 | DOM/CSS表示（Web限定）: D-10 S7.3.1 | e2e/flows/bot-display.spec.ts 実在 | 適合 |
| specialist_browser_compat.steps.ts | 4 | インフラ制約（HTTP:80/WAF）: Cloudflare設定レベル | Sprint-20実機検証済み | 適合 |
| user_registration.steps.ts | 4 | Discord OAuth外部依存: サービス層でシミュレーション困難 | 代替テスト未作成 | 適合 |

### 詳細: S7.3不適合一覧

全件適合。

### 詳細: 技術的負債（代替テスト未作成）

| ステップ | 分類 | 備考 |
|---|---|---|
| user_registration.steps.ts: Discord OAuth 4ステップ | ブラウザ固有動作 | 前回から継続 |
| specialist_browser_compat.steps.ts: HTTP:80 + WAF 2ステップ | インフラ制約 | 前回から継続 |

## 2. テストピラミッド

| 層 | ファイル数 | テスト数 | 前回比 | 判定 |
|---|---|---|---|---|
| 単体テスト (Vitest) | 96 | 1,914 | +39ファイル/多数 | 正常 |
| BDDサービス層 (Cucumber) | 25 steps / 25 features | 394 scenarios | +4ファイル/+70 | 正常 |
| E2E (Playwright) | 9 | 70 | +2ファイル | 正常 |

**判定:** 正常なピラミッド構造。下層（単体テスト 1,914件）> 中層（BDDサービス層 394シナリオ）> 上層（E2E 70件）。逆ピラミッドの兆候なし。

### ドメインルールのテストカバレッジ

`src/lib/domain/rules/` 配下12ファイル全てに対応する単体テストが存在する。

前回指摘（MEDIUM-2）の `mypage-display-rules.ts` は、`mypage-registration.test.ts` が全7エクスポート関数（isTemporaryUser, isPermanentUser, getAccountTypeLabel, getRegistrationMethodLabel, buildPatCopyValue, formatPatLastUsedAt, canUpgrade）をテストしており、**解消**と判定する。ファイルの配置が `rules/__tests__/` ではなく `__tests__/app/(web)/mypage/` だが、カバレッジとしては充足している。

下層空洞化の兆候なし。

## 3. Featureカバレッジ: command_copipe.feature

| feature | 総シナリオ | 通常実行 | pending管理下 | 未定義 |
|---|---|---|---|---|
| command_copipe.feature | 8 | 8 | 0 | 0 |

### ステップ定義マッピング

**Background（3ステップ）:**

| ステップ | 定義場所 |
|---|---|
| コマンドレジストリに以下のコマンドが登録されている: | command_system.steps.ts L98 |
| ユーザーがログイン済みである | common.steps.ts |
| 以下のコピペAAが登録されている: | command_copipe.steps.ts L55 |

**シナリオ固有ステップ（8ステップ定義で全8シナリオをカバー）:**

| ステップ | 定義場所 | 使用シナリオ |
|---|---|---|
| 本文に {string} を含めて投稿する | command_system.steps.ts | 全8シナリオ |
| 書き込みがスレッドに追加される | specialist_browser_compat.steps.ts | S1 |
| 書き込み本文は {string} がそのまま表示される | command_system.steps.ts L1097 | S1 |
| 登録済みAAから1つが選択されレス末尾にマージ表示される | command_copipe.steps.ts L84 | S1 |
| /^「(.+)」のAAがレス末尾にマージ表示される$/ | command_copipe.steps.ts L139 | S2, S3, S4, S6 |
| 部分一致したAAからランダムに1件がレス末尾にマージ表示される | command_copipe.steps.ts L180 | S5, S7 |
| マージ表示に {string} を含む通知が付与される | command_copipe.steps.ts L222 | S5, S7 |
| レス末尾にエラー {string} がマージ表示される | command_system.steps.ts L1390 | S8 |

未定義ステップ: **0件**

## 4. ステップ定義の実質性

### assert(true) / expect(true) スタブアサーション

`features/step_definitions/` 全体を検索: **0件検出**。D-10 S7.3.2 準拠。

### command_copipe.steps.ts のアサーション品質

全ステップ定義に実質的なアサーションが含まれていることを確認した。

| ステップ | アサーション内容 | 判定 |
|---|---|---|
| 以下のコピペAAが登録されている: | InMemoryCopipeRepo._insert 実行（Givenセットアップ） | 実質あり |
| 登録済みAAから1つが選択されレス末尾にマージ表示される | inlineSystemInfo != null + 【name】形式を含む | 実質あり |
| /^「(.+)」のAAがレス末尾にマージ表示される$/ | inlineSystemInfo != null + includes(expectedName) | 実質あり |
| 部分一致したAAからランダムに1件がレス末尾にマージ表示される | inlineSystemInfo != null + 【name】形式を含む | 実質あり |
| マージ表示に {string} を含む通知が付与される | inlineSystemInfo != null + includes(expectedText) | 実質あり |

### 補強テスト

`src/__tests__/lib/services/handlers/copipe-handler.test.ts` に37件の単体テストが存在し、featureの全8シナリオの検索ロジック（ランダム、完全一致、部分一致、content フォールバック、一致なし）およびエッジケース（データ0件、空文字引数等）を網羅的に検証している。

## 5. 前回監査との差分（P5-TA-S97 -> TASK-344-audit）

| 前回指摘 | 今回の状態 |
|---|---|
| MEDIUM-1: 攻撃コスト/撃破報酬ステップの定数比較のみ | 継続（Sprint-134スコープ外、間接カバー済み） |
| MEDIUM-2: mypage-display-rules.ts 直接単体テスト欠落 | **解消**: mypage-registration.test.ts が全7関数をカバー |
| LOW-1: 代替テスト5ファイルに @feature/@scenario 注釈欠落 | 継続（Sprint-134スコープ外） |

Sprint-134で新規指摘なし。

## 6. レビューサマリー

| 重要度 | 件数 | ステータス |
|---|---|---|
| CRITICAL | 0 | pass |
| HIGH | 0 | pass |
| MEDIUM | 0 | pass |
| LOW | 0 | pass |

**判定: APPROVE**

command_copipe.feature の全8シナリオにステップ定義が存在し、pendingなし、未定義ステップなし、スタブアサーションなし。テストピラミッドは健全。ドメインルールのテストカバレッジに空洞なし。
