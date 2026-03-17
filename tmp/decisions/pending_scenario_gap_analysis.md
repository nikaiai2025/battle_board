# Pendingシナリオ ギャップ分析レポート

> 作成日: 2026-03-17
> 基準: D-10 §7.3 BDDシナリオの検証層マッピング

---

## 1. 現状サマリー

| 指標 | 値 |
|---|---|
| pendingシナリオ数 | 9 |
| pendingステップ数 | 22 |
| §7.3.2 適合（Cucumber側コメント完備） | 4 / 9 シナリオ |
| §7.3.3 適合（代替テスト側 @feature 注釈あり） | 0 / 9 シナリオ |
| §7.3.4 代替テスト未作成（技術的負債） | 2 シナリオ |

---

## 2. 全pendingシナリオ一覧

### A. DOM/CSS表示 — Vitestコンポーネントテストで検証すべきもの

| # | feature | シナリオ名 | steps数 |
|---|---|---|---|
| E | bot_system.feature | 撃破済みボットのレスはWebブラウザで目立たない表示になる | 2 (Given共有) |
| F | bot_system.feature | 撃破済みボットのレス表示をトグルで切り替えられる | 4 (Given共有) |

- **ステップ定義**: `features/step_definitions/bot_system.steps.ts` L1574-1625
- **§7.3.1分類**: DOM/CSS表示 → Vitestコンポーネントテスト
- **代替テスト**: **未作成**（UIコンポーネント自体が未実装）

### B. ブラウザ固有動作（外部OAuth） — E2Eで検証すべきもの

| # | feature | シナリオ名 | steps数 |
|---|---|---|---|
| A | user_registration.feature | 仮ユーザーが Discord アカウントで本登録する | 2 |
| B | user_registration.feature | 本登録ユーザーが Discord アカウントでログインする | 2 |

- **ステップ定義**: `features/step_definitions/user_registration.steps.ts` L868-882, L1058-1079
- **§7.3.1分類**: ブラウザ固有動作（外部OAuth） → E2E
- **代替テスト（部分的）**: `src/__tests__/lib/services/registration-service.test.ts` にサービス層テストあり（registerWithDiscord, loginWithDiscord, handleOAuthCallback）。ただしOAuthフロー全体のE2Eテストは未作成

### C. インフラ制約 — CF Smoke / 本番Smokeで検証すべきもの

| # | feature | シナリオ名 | steps数 |
|---|---|---|---|
| G | specialist_browser_compat.feature | 専ブラの5chプロトコル通信がHTTP:80で直接応答される | 2 |
| H | specialist_browser_compat.feature | bbs.cgiへのHTTP:80 POSTが直接処理される | 3 |
| I | specialist_browser_compat.feature | 専ブラ特有のUser-AgentがWAFにブロックされない | 3 |

- **ステップ定義**: `features/step_definitions/specialist_browser_compat.steps.ts` L2726-2799
- **§7.3.1分類**: インフラ制約 → CF Smoke / 本番Smoke
- **代替テスト**: Sprint-20で実機検証済み（手動）。自動テストは本番環境でしか検証できない性質のため、本番Smoke（D-10 §14）の範囲
- **既存の近接テスト**: `e2e/cf-smoke/workers-compat.spec.ts` はWorkers Runtime互換性の検証であり、HTTP:80直接応答やWAFの検証ではない（検証対象が異なる）

### D. Phase 3未実装（§7.3の範囲外）

| # | feature | シナリオ名 | steps数 |
|---|---|---|---|
| C | bot_system.feature | 荒らし役ボットは1〜2時間間隔で書き込む | 2 |
| D | bot_system.feature | 荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ | 2 |

- **ステップ定義**: `features/step_definitions/bot_system.steps.ts` L737-808
- **分類**: ビジネスロジック（サービス層で検証可能）。pendingの理由は検証層の不一致ではなく、機能自体が未実装
- **対処**: Phase 3実装時にpendingを解除し通常実行に移行する。§7.3の対象外

---

## 3. §7.3.2 適合状況（Cucumber側コメント）

ルール: 各pendingステップに (1) pending理由 (2) 代替テストパス を記載する。

| # | シナリオ | (1) pending理由 | (2) 代替テストパス |
|---|---|---|---|
| A | Discord本登録 | OK | **欠落** |
| B | Discordログイン | OK | **欠落** |
| C | ボット間隔 | OK | N/A (§7.3範囲外) |
| D | ボット書き込み先 | OK | N/A (§7.3範囲外) |
| E | 撃破済み表示 | **一部欠落** (Given のみ記載、Then に理由なし) | **欠落** (代替テスト未作成) |
| F | トグル切替 | **欠落** (全ステップに理由なし) | **欠落** (代替テスト未作成) |
| G | HTTP:80 GET | OK | **欠落** |
| H | HTTP:80 POST | OK | **欠落** |
| I | WAF | OK | **欠落** |

---

## 4. §7.3.3 適合状況（代替テスト側トレーサビリティ）

ルール: 代替テストのファイル先頭に `@feature` / `@scenario` 注釈を記載する。

| 代替テストファイル | 対応シナリオ | @feature/@scenario 注釈 |
|---|---|---|
| `src/__tests__/lib/services/registration-service.test.ts` | A, B (Discord OAuth) | **なし** (featureへの `See:` 参照はあるが§7.3.3形式ではない) |
| `e2e/cf-smoke/workers-compat.spec.ts` | G, H, I (インフラ制約) | **対応関係なし** (検証対象がHTTP:80/WAFではなくRuntime互換性) |
| (未作成) | E, F (撃破済みボット表示) | — |

---

## 5. 必要なアクション一覧

### 優先度 High: コメント修正（§7.3.2 適合化）

既存コードの修正のみ。テスト追加不要。

| # | 対象ファイル | 行 | 内容 |
|---|---|---|---|
| 1 | bot_system.steps.ts | L1591-1595 | Then「目立たない文字色」に pending理由コメント追加 |
| 2 | bot_system.steps.ts | L1598-1625 | トグル切替の全ステップ（When/Then 4箇所）に pending理由コメント追加 |
| 3 | bot_system.steps.ts | L1570-1572 | セクションコメントに「代替検証: (作成予定)」の記載追加 |
| 4 | user_registration.steps.ts | L857-882 | Discord本登録ステップに「代替検証: registration-service.test.ts (サービス層)」追加 |
| 5 | user_registration.steps.ts | L1047-1079 | Discordログインステップに同上 |
| 6 | specialist_browser_compat.steps.ts | L2726-2799 | 全HTTP:80/WAFステップに「代替検証: Sprint-20実機検証済み / 本番Smoke §14で検証」追加 |

### 優先度 High: 代替テスト側 @feature 注釈追加（§7.3.3 適合化）

| # | 対象ファイル | 内容 |
|---|---|---|
| 7 | `src/__tests__/lib/services/registration-service.test.ts` | ファイル先頭JSDocに Discord関連テストが対応する @feature / @scenario を追記 |

### 優先度 Medium: 代替テスト作成（§7.3.4 技術的負債の解消）

UIコンポーネント実装と同時に対応する。現時点では負債として認識し追跡する。

| # | 作成すべきテスト | 対応シナリオ | 前提条件 |
|---|---|---|---|
| 8 | `src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx` | E, F | Reactコンポーネント実装後 |

### 優先度 Low: 将来対応（Phase 3 / 本番環境）

| # | 内容 | 対応時期 |
|---|---|---|
| 9 | Phase 3実装時にシナリオC, Dのpendingを解除 | Phase 3 |
| 10 | 本番SmokeテストにHTTP:80検証を追加検討（G, H, I） | 本番Smoke拡充時 |

---

## 6. 今回のタスクで実施すべき作業まとめ

アクション #1〜#7 が即時実施可能。コード修正のみでテストの新規作成は不要。

- **修正対象ファイル**: 3ファイル
  - `features/step_definitions/bot_system.steps.ts`
  - `features/step_definitions/user_registration.steps.ts`
  - `features/step_definitions/specialist_browser_compat.steps.ts`
  - `src/__tests__/lib/services/registration-service.test.ts`
- **修正内容**: コメント / JSDoc の追記のみ
- **テスト影響**: なし（コメント変更のため既存テスト結果に影響しない）
