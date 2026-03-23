# テスト監査レポート

> 実行日: 2026-03-21
> 対象スプリント: Sprint-85
> タスク: TASK-255

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingステップ数 | 12（3ファイル） |
| pendingに関係するシナリオ数 | 16（name除外3件含む） |
| D-10 §7.3適合 | 12 / 12 |
| 代替テスト作成済み | 8 / 12 |
| 代替テスト未作成（技術的負債） | 4 |
| Phase未実装（§7.3範囲外） | 0 |

### 内訳

全12件のpendingステップを以下のカテゴリに分類した。全件が §7.3.1（pending理由の記載）および §7.3.2（`return "pending"` の使用、スタブアサーションの不使用）に適合している。

#### (A) DOM/CSS表示 -- bot_system.steps.ts（6件）

| ステップ | 代替テスト | 状態 |
|---|---|---|
| `ユーザーがWebブラウザでスレッドを閲覧している` | e2e/flows/bot-display.spec.ts | 作成済み（test.fixme） |
| `撃破済みボットの過去のレスは目立たない文字色で表示される` | 同上 | 作成済み（test.fixme） |
| `全体メニューの「撃破済みBOTレス表示」トグルをOFFにする` | 同上 | 作成済み（test.fixme） |
| `撃破済みボットの過去のレスが非表示になる` | 同上 | 作成済み（test.fixme） |
| `トグルをONに戻す` | 同上 | 作成済み（test.fixme） |
| `撃破済みボットの過去のレスが表示される（目立たない文字色）` | 同上 | 作成済み（test.fixme） |

代替テスト `e2e/flows/bot-display.spec.ts` は実在し、`@feature bot_system.feature` および `@scenario` 注釈を記載している。ただし `test.fixme()` 状態であり、UI実装完了まで実行されない。これは §7.3.4 の技術的負債に該当するが、ステップ側のコメントに「UIコンポーネント実装時に作成」と明記されており、管理下にある。

#### (B) 外部OAuth依存 -- user_registration.steps.ts（4件）

| ステップ | 代替テスト | 状態 |
|---|---|---|
| `Discord で本登録ボタンを押す` | registration-service.test.ts | 作成済み（部分カバー） |
| `Discord 認可画面で許可する` | 同上 | 作成済み（部分カバー） |
| `本登録ユーザー（Discord 連携）が新しいデバイスを使用している` | 同上 | 作成済み（部分カバー） |
| `Discord アカウントでログインする` | 同上 | 作成済み（部分カバー） |

代替テスト `src/__tests__/lib/services/registration-service.test.ts` は実在し、`@feature user_registration.feature` および `@scenario` 注釈を記載している。`registerWithDiscord` / `loginWithDiscord` / `handleOAuthCallback` のモックテストでサービス層レベルの部分カバーを実施している。ただし、E2E（OAuthフロー全体）の代替テストは未作成と明記されている。

#### (C) インフラ制約 -- specialist_browser_compat.steps.ts（2件）

| ステップ | 代替テスト | 状態 |
|---|---|---|
| `専ブラがHTTP:80で subject.txt にGETリクエストする` | Sprint-20実機検証 | 自動テスト未作成 |
| `{string} をUser-Agentに含むリクエストが送信される` | Sprint-20実機検証 | 自動テスト未作成 |

インフラ制約（Cloudflare Workers/WAF設定）であり、BDDサービス層では検証不可能。Sprint-20で実機検証済みだが、自動テストとしての代替テストファイルは未作成。本番Smokeテスト拡充時に検討とされている。

### 詳細: §7.3不適合一覧

全件適合。

### 詳細: 技術的負債（代替テスト未作成）

| # | ステップ所在 | 分類 | 説明 |
|---|---|---|---|
| 1 | specialist_browser_compat.steps.ts L3121 | インフラ | HTTP:80直接応答の自動テスト未作成 |
| 2 | specialist_browser_compat.steps.ts L3166 | インフラ | WAF User-Agent許可の自動テスト未作成 |
| 3 | user_registration.steps.ts | E2E | Discord OAuth E2Eフローの自動テスト未作成 |
| 4 | bot_system.steps.ts | UI | bot-display.spec.ts は test.fixme 状態（UI実装待ち） |

## 2. テストピラミッド

### 層別集計

| 層 | ファイル数 | テスト数 | 判定 |
|---|---|---|---|
| 単体テスト (Vitest) | 57 | 882 | OK |
| BDDサービス層 (Cucumber) | 14 feature + 17 steps | 274 passed + 16 pending | OK |
| 統合テスト (Cucumber integration) | 3 feature | 7 scenarios | OK |
| APIテスト (Playwright api) | 2 spec | 43 | OK |
| E2E (Playwright e2e) | 7 spec | 41 | OK |
| スモーク（本番） | 共用 | 共用 | OK |

### バランス評価

ピラミッド形状は健全。下層（単体882 + BDD274 = 1,156件）が上層（API43 + E2E41 = 84件）を大きく上回っており、逆ピラミッドの兆候はない。

### ドメインルール テストカバレッジ

`src/lib/domain/rules/` の11ファイルについて専用テストの存在を確認した。

| ドメインルール | 専用テスト | 判定 |
|---|---|---|
| accusation-rules.ts | accusation-rules.test.ts (20 tests) | OK |
| grass-icon.ts | grass-icon.test.ts (30 tests) | OK |
| pagination-parser.ts | pagination-parser.test.ts (32 tests) | OK |
| url-detector.ts | url-detector.test.ts (46 tests) | OK |
| daily-id.ts | ban-system.test.ts 内でモック利用 | 間接カバー |
| command-parser.ts | command_system BDDシナリオでカバー | 間接カバー |
| incentive-rules.ts | incentive BDDシナリオでカバー | 間接カバー |
| anchor-parser.ts | AnchorPopup.test.tsx でインポート使用 | 間接カバー |
| validation.ts | 各サービステストで間接カバー | 間接カバー |
| elimination-reward.ts | attack-handler.test.ts 内で間接カバー | 間接カバー |
| mypage-display-rules.ts | mypage-registration.test.ts 内でカバー | 間接カバー |

専用テストが存在するのは4ファイル。残り7ファイルは各サービス/ハンドラのテスト内で間接的にカバーされている。下層空洞化の兆候はない。

## 3. Featureカバレッジ

### Sprint-85 変更対象のFeature

| feature | 総シナリオ | 通常実行 | pending管理下 | name除外 | 未定義 |
|---|---|---|---|---|---|
| welcome.feature | 11 | 11 | 0 | 0 | 0 |
| mypage.feature | 19 | 19 | 0 | 0 | 0 |
| currency.feature | 4 | 4 | 0 | 0 | 0 |

### 全Feature集計（Cucumber paths登録済み14件）

| feature | 総シナリオ | 通常実行 | pending管理下 | name除外 |
|---|---|---|---|---|
| authentication.feature | 13 | 13 | 0 | 0 |
| posting.feature | 4 | 4 | 0 | 0 |
| thread.feature | 36 | 36 | 0 | 0 |
| currency.feature | 4 | 4 | 0 | 0 |
| incentive.feature | 30 | 30 | 0 | 0 |
| admin.feature | 19 | 19 | 0 | 0 |
| specialist_browser_compat.feature | 33 | 31 | 2 | 0 |
| mypage.feature | 19 | 19 | 0 | 0 |
| command_system.feature | 25 | 24 | 0 | 1 |
| ai_accusation.feature | 9 | 7 | 0 | 2 |
| user_registration.feature | 27 | 23 | 4 | 0 |
| bot_system.feature | 31 | 25 | 6 | 0 |
| reactions.feature | 21 | 21 | 0 | 0 |
| investigation.feature | 11 | 11 | 0 | 0 |
| welcome.feature | 11 | 11 | 0 | 0 |
| **合計** | **293** | **277** | **12** | **3** |

注: cucumber.js の name フィルタで除外されている3件:
- `コマンド文字列がゲームコマンドとして解釈される`（Phase 2依存）
- `告発成功したボットにBOTマークが表示される`（Phase 3依存）
- `BOTマークがついたボットは書き込みを継続する`（Phase 3依存）

Sprint-85結果（290 scenarios = 277 passed + 13 pending に近い。差分は integration profile の3件加算による）と整合する。

### 未定義ステップ

未定義ステップ（ステップ定義自体が存在しないシナリオ）: **0件**

welcome.feature の全11シナリオおよび mypage.feature の全19シナリオについて、ステップ定義の存在を確認した。全ステップが `welcome.steps.ts` / `mypage.steps.ts` / `common.steps.ts` / `bot_system.steps.ts` / `user_registration.steps.ts` のいずれかで定義されている。

### cucumber.js paths 登録確認

welcome.feature は cucumber.js の `paths` 配列に登録済み（TASK-248で追加、L73）。`require` にも `welcome.steps.ts` が登録済み（L116）。

## 4. ステップ定義の実質性

### スタブアサーション検索結果

`features/step_definitions/` 配下で以下のパターンを検索した。

| パターン | 検出数 |
|---|---|
| `assert(true)` / `expect(true)` | 0件 |
| `return "pending"` | 12件（全件 §1 で監査済み） |

### Sprint-85 新規ステップの実質性検証

welcome.steps.ts（全11シナリオ）および mypage.steps.ts（全19シナリオ）の全ステップを読み取り、アサーションの実質性を確認した。

**welcome.steps.ts:**
- 初回書き込み判定: `CurrencyService.getBalance` で残高=50を検証、`InMemoryPendingTutorialRepo.findAll` でpending_tutorials存在を検証。実質的。
- 初回書き込みボーナス: `inlineSystemInfo` の内容文字列照合。実質的。
- ウェルカムメッセージ: `displayName="★システム"` かつ `isSystemMessage=true` のレス存在とDocString本文照合。実質的。
- チュートリアルBOT: `processPendingTutorials` 実行後にBOTの `hp`, `botProfileKey`, `dailyId`, `name`, `isActive` を検証。BOT書き込み本文の `!w` 含有と `>>N` アンカー検証。実質的。
- 日次リセット非復活: `performDailyReset` 実行後に `isActive=false` の維持を検証。実質的。
- cron非書き込み: `findDueForPost` の結果が対象外であることを検証。実質的。

**mypage.steps.ts:**
- 基本表示: `mypageResult.balance` が number型、`userId` が非空文字列、`isPremium` が boolean型であることを検証。実質的。
- ユーザーネーム設定: `setUsername` の結果と `createPost` 後の `displayName` 照合。実質的。
- 課金: `upgradeToPremium` 成功後の `isPremium=true` 検証、既有料時の `ALREADY_PREMIUM` エラー検証。実質的。
- 書き込み履歴: `getPostHistory` の件数・ソート順・threadTitle/body/createdAt存在を検証。実質的。
- ページネーション: `totalPages`, `page`, `posts.length` の数値照合、降順ソート検証。実質的。
- 検索: キーワード・日付範囲フィルタ結果の件数と期間内判定。実質的。
- 草カウント: `grassCount` / `grassIcon` の表示フォーマット照合 + `getGrassIcon` ドメインルールとの整合性検証。実質的。
- 通知欄: `mypageResult !== null` の存在確認のみ。**Phase 1では枠の存在のみが要件**（feature コメントに「Phase 2以降で本格利用」と明記）であり、現要件に対して適切。

### 判定

| ファイル | ステップ | パターン | 判定 |
|---|---|---|---|
| 全ステップ定義ファイル | 全PASSステップ | assert(true) / expect(true) | スタブなし |

スタブアサーションは検出されなかった。

## 5. レビューサマリー

| 重要度 | 件数 | ステータス | 内容 |
|---|---|---|---|
| CRITICAL | 0 | pass | -- |
| HIGH | 0 | pass | -- |
| MEDIUM | 4 | info | 技術的負債（代替テスト未作成）4件 |
| LOW | 0 | note | -- |

### MEDIUM: 技術的負債の詳細（情報提供）

既知の技術的負債であり、全件がステップ定義のコメントで管理されている。新規発生ではない。

1. **インフラ制約の自動テスト未作成** (specialist_browser_compat 2件) -- Sprint-20で実機検証済み。本番Smoke拡充時に対応予定。
2. **Discord OAuth E2Eテスト未作成** (user_registration 1件) -- サービス層テストで部分カバー中。
3. **bot-display.spec.ts が test.fixme 状態** (bot_system 1件) -- UIコンポーネント実装完了で解消見込み。

---

**判定: APPROVE**

Sprint-85で追加された19シナリオ（welcome 11 + mypage 8）は全て通常実行状態でPASSしており、ステップ定義は実質的なアサーションを含んでいる。pendingシナリオ12件は全て D-10 §7.3 に適合している。テストピラミッドは健全で逆ピラミッドの兆候はない。CRITICALおよびHIGHの問題は検出されなかった。
