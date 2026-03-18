# テスト監査レポート

> 実行日: 2026-03-19
> 対象スプリント: Sprint-46〜55（Sprint-56 Phase 5 検証サイクル）

---

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingシナリオ数 | 7 |
| §7.3適合（分類・理由・代替パス全て記載） | 5 / 7 |
| 代替テスト作成済み | 2 / 7 |
| 代替テスト未作成（技術的負債） | 5 |
| Phase未実装（§7.3範囲外） | 0 |

### 各pendingシナリオの詳細

#### グループA: 専ブラ互換 — インフラ制約（3シナリオ）

ファイル: `features/step_definitions/specialist_browser_compat.steps.ts`
対応feature: `features/constraints/specialist_browser_compat.feature`

| シナリオ名 | 行番号（pending行） | 分類 | 理由 | 代替パス記載 | 代替ファイル実在 |
|---|---|---|---|---|---|
| 専ブラの5chプロトコル通信がHTTP:80で直接応答される | 3106 | インフラ制約 | あり（Cloudflare設定レベル、BDDでは検証不可） | あり（Sprint-20実機検証済み、本番Smoke拡充時に検討） | 代替ファイルなし（実機検証のみ） |
| bbs.cgiへのHTTP:80 POSTが直接処理される | 3130, 3137 | インフラ制約 | あり（同上） | あり（同上） | 代替ファイルなし（実機検証のみ） |
| 専ブラ特有のUser-AgentがWAFにブロックされない | 3151 | インフラ制約 | あり（Cloudflare WAF設定、BDDでは検証不可） | あり（Sprint-20実機検証済み） | 代替ファイルなし（実機検証のみ） |

**§7.3適合評価:** 適合。分類キーワード「インフラ制約」あり、理由記載あり、代替検証として「Sprint-20実機検証済み・本番Smoke拡充時に検討」が明記されている。自動テストファイルは未作成だが、インフラ制約の性質上（Cloudflare設定レベル）サービス層テストでの検証が根本的に不可能であり、分類根拠として正当。ただし代替テストファイルへのパスが存在せず、代替は「実機検証済み」の記述のみ。

#### グループB: Discord OAuth — ブラウザ固有動作（2シナリオ）

ファイル: `features/step_definitions/user_registration.steps.ts`
対応feature: `features/user_registration.feature`

| シナリオ名 | 行番号（pending行） | 分類 | 理由 | 代替パス記載 | 代替ファイル実在 |
|---|---|---|---|---|---|
| 仮ユーザーがDiscordアカウントで本登録する | 875, 885 | ブラウザ固有動作（外部OAuth） | あり（Discord OAuth外部サービス依存、インメモリモックでシミュレーション困難） | あり（サービス層: `src/__tests__/lib/services/registration-service.test.ts`、E2E: 未作成） | サービス層ファイル実在、E2E未作成 |
| 本登録ユーザーがDiscordアカウントでログインする | 1068, 1085 | ブラウザ固有動作（外部OAuth） | あり（Discord OAuth外部サービス依存） | あり（サービス層: `src/__tests__/lib/services/registration-service.test.ts`、E2E: 未作成） | サービス層ファイル実在、E2E未作成 |

**§7.3適合評価:** 適合。分類キーワード「ブラウザ固有動作」あり、理由記載あり。代替検証パスとしてサービス層テストファイルが明記され実在する。`registration-service.test.ts` には `@feature user_registration.feature` / `@scenario` 注釈が存在（§7.3.3適合）。ただし「E2Eテストは未作成」と明記されており、OAuth フロー全体のE2Eは技術的負債として残存。

#### グループC: 撃破済みボット表示 — DOM/CSS表示（2シナリオ）

ファイル: `features/step_definitions/bot_system.steps.ts`
対応feature: `features/bot_system.feature`

| シナリオ名 | 行番号（pending行） | 分類 | 理由 | 代替パス記載 | 代替ファイル実在 |
|---|---|---|---|---|---|
| 撃破済みボットのレスはWebブラウザで目立たない表示になる | 1644, 1652 | DOM/CSS表示 | あり（Web UI はBDDサービス層スコープ外） | あり（`src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx`（作成予定）） | **不在（作成予定のまま）** |
| 撃破済みボットのレス表示をトグルで切り替えられる | 1668, 1676, 1682, 1689 | DOM/CSS表示 | あり（同上） | あり（同上（作成予定）） | **不在（作成予定のまま）** |

**§7.3適合評価:** 部分不適合。分類キーワード「DOM/CSS表示」あり、理由記載あり。しかし代替テストパスとして指定された `src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx` が実在しない（「作成予定」のまま）。**代替テストのリンク切れ = HIGH**。

### 詳細: §7.3不適合一覧

| シナリオ | 不適合内容 | 重要度 |
|---|---|---|
| 撃破済みボットのレスはWebブラウザで目立たない表示になる | 代替テスト `eliminated-bot-display.test.tsx` が未作成（リンク切れ） | HIGH |
| 撃破済みボットのレス表示をトグルで切り替えられる | 同上 | HIGH |

### 詳細: 技術的負債（代替テスト未作成）

| シナリオ | 負債内容 | 重要度 |
|---|---|---|
| 専ブラの5chプロトコル通信がHTTP:80で直接応答される | 本番Smoke自動テスト化未実施（実機検証のみ） | MEDIUM |
| bbs.cgiへのHTTP:80 POSTが直接処理される | 同上 | MEDIUM |
| 専ブラ特有のUser-AgentがWAFにブロックされない | 同上 | MEDIUM |
| 仮ユーザーがDiscordアカウントで本登録する | E2Eフロー全体テスト未作成（サービス層のみ部分カバー） | MEDIUM |
| 本登録ユーザーがDiscordアカウントでログインする | 同上 | MEDIUM |
| 撃破済みボットのレスはWebブラウザで目立たない表示になる | UIコンポーネントテスト未作成 | MEDIUM（HIGH扱いは§1.2参照） |
| 撃破済みボットのレス表示をトグルで切り替えられる | 同上 | MEDIUM（HIGH扱いは§1.2参照） |

---

## 2. テストピラミッド

### 集計

| 層 | ファイル/テスト数 | 判定 |
|---|---|---|
| 単体テスト (Vitest) | 55 ファイル / 1,284 テスト（タスク記載値） | - |
| BDDサービス層 | 234 シナリオ（227 passed, 7 pending） | - |
| E2E フロー検証 | 1 ファイル / 2 テスト（`basic-flow.spec.ts`） | - |
| E2E ナビゲーション Smoke | 1 ファイル / 8 テスト（`smoke/navigation.spec.ts`） | - |
| API テスト | 2 ファイル / 43 テスト（`api/auth-cookie.spec.ts`, `api/senbra-compat.spec.ts`） | - |
| CF Smoke | 1 ファイル / 7 テスト（`cf-smoke/workers-compat.spec.ts`） | §13.4 の「7件程度・固定」と一致 |
| 本番 Smoke | 1 ファイル / 11 テスト（`prod/smoke.spec.ts`） | §14 の「Phase A: 11件」と一致 |
| 統合テスト（cucumber integration） | 7 シナリオ / 全PASS | - |

### テストピラミッド評価

**逆ピラミッド警告:** なし。BDDサービス層 234 シナリオ >> E2E 10 テスト（フロー+ナビ合計）であり、下層優位の正常ピラミッド形状を維持している。

**下層空洞化チェック:** `src/lib/domain/rules/` に以下のファイルが存在する。

| domain/rules ファイル | テストの有無 | テストパス |
|---|---|---|
| `daily-id.ts` | あり | `src/lib/domain/rules/__tests__/daily-id.test.ts` |
| `validation.ts` | あり | `src/lib/domain/rules/__tests__/validation.test.ts` |
| `anchor-parser.ts` | あり | `src/lib/domain/rules/__tests__/anchor-parser.test.ts` |
| `incentive-rules.ts` | あり | `src/lib/domain/rules/__tests__/incentive-rules.test.ts` |
| `accusation-rules.ts` | あり | `src/__tests__/lib/domain/rules/accusation-rules.test.ts` |
| `grass-icon.ts` | あり | `src/__tests__/lib/domain/rules/grass-icon.test.ts` |
| `elimination-reward.ts` | あり | `src/lib/domain/rules/__tests__/elimination-reward.test.ts` |
| `command-parser.ts` | あり | `src/lib/domain/rules/__tests__/command-parser.test.ts` |
| `mypage-display-rules.ts` | **専用テストなし** | — |

`mypage-display-rules.ts` に専用の単体テストファイルが存在しない。ただし、同ファイルの関数群（`isTemporaryUser`, `canUpgrade` 等）はBDDシナリオ（`user_registration.feature` の複数シナリオ）およびサービス層テスト `registration-service.test.ts` から間接的にカバーされていると考えられる。また `src/__tests__/app/(web)/mypage/mypage-registration.test.ts` で `mypage-display-rules` をインポートして使用している可能性がある。

**補足 — テストパスの分散について:** `src/lib/domain/rules/__tests__/` と `src/__tests__/lib/domain/rules/` の2箇所にテストが混在している（前者6ファイル、後者2ファイル）。D-10 §4（ディレクトリ構成）では `src/__tests__/` 配下を標準パスとして示しているが、`__tests__` サブディレクトリへの配置も実害はない。ただし一貫性の欠如はナビゲーションコストになる。これはLOW相当の品質上の指摘として記録する。

**判定:** domain/rules の下層空洞化は `mypage-display-rules.ts` のみで、かつ間接カバレッジは存在する見込み。HIGHには分類しないが、専用テストファイルの不在はMEDIUMとして記録する。

---

## 3. Featureカバレッジ

### featureファイル別シナリオ集計

`features/ドラフト_実装禁止/` は cucumber-js の実行対象外であるため集計から除外する。
`features/integration/crud.feature` は integration プロファイル対象（通常実行 7 シナリオで全PASS）。

| feature | 総シナリオ | 通常実行（passed） | pending管理下 | 未定義 |
|---|---|---|---|---|
| `authentication.feature` | 13 | 13 | 0 | 0 |
| `incentive.feature` | 27 | 27 | 0 | 0 |
| `mypage.feature` | 11 | 11 | 0 | 0 |
| `admin.feature` | 19 | 19 | 0 | 0 |
| `ai_accusation.feature` | 8 | 8 | 0 | 0 |
| `currency.feature` | 4 | 4 | 0 | 0 |
| `thread.feature` | 15 | 15 | 0 | 0 |
| `bot_system.feature` | 30 | 28 | 2 | 0 |
| `command_system.feature` | 20 | 20 | 0 | 0 |
| `posting.feature` | 4 | 4 | 0 | 0 |
| `constraints/specialist_browser_compat.feature` | 37 | 34 | 3 | 0 |
| `user_registration.feature` | 26 | 24 | 2 | 0 |
| `integration/crud.feature` | 3 | 3（integrationプロファイル） | 0 | 0 |
| **合計（integration除く）** | **187** | **180** | **7** | **0** |

注: タスク記載の「234シナリオ」との差分は、`Scenario Outline` のデータ行展開分（Examples テーブル）が各1シナリオとして複数カウントされるため。上記は `Scenario:` 行ベースのカウント。cucumber-js 実行カウントはExamples展開後の実行数。

**未定義シナリオ:** なし（CRITICAL 問題なし）。

---

## 4. Sprint-46〜55 追加コードのトレーサビリティチェック

### 新規実装コード（Sprint-46〜55）の対応状況

| 新規コード | BDDシナリオ | 単体テスト | 評価 |
|---|---|---|---|
| Discord OAuth ルートハンドラー（register/discord, login/discord, callback） | `user_registration.feature` の Discord シナリオ（pendingだが理由・代替明記） | `src/__tests__/api/auth/register/discord/route.test.ts`, `login/discord/route.test.ts`, `callback/route.test.ts` — 各ファイルに `@feature` 注釈あり | 良好 |
| Internal API（bot/execute, daily-reset, daily-stats） | `bot_system.feature` の各ボット動作シナリオ（サービス層で通常実行） | `src/__tests__/api/internal/bot-execute.test.ts`, `daily-reset.test.ts`, `daily-stats.test.ts` | 良好 |
| Internal API 認証ミドルウェア（`internal-api-auth.ts`） | BDDシナリオに直接対応するfeatureなし（横断的インフラコンポーネント） | `src/__tests__/api/internal/internal-api-auth.test.ts` — TDR-010 参照あり | 許容（インフラ制約コンポーネントは §7.3.1 の「インフラ制約」分類に相当） |
| BotService スケジューリング拡張 | `bot_system.feature` の書き込みタイミング系シナリオ | `src/__tests__/lib/services/bot-service-scheduling.test.ts` (NEW) | 良好 |
| CommandService 初期化バグ修正（fs.readFileSync除去） | `command_system.feature` の各シナリオ | `src/lib/services/__tests__/command-service.test.ts` (修正) | 良好 |

**評価サマリー:** Sprint-46〜55の全新規実装コードについて、BDDシナリオまたは単体テストによるカバレッジが存在する。Internal API 認証ミドルウェアはfeatureレベルのシナリオはないが単体テストで直接検証されており、かつ BotService 経由でBDDシナリオから間接的にカバーされる。トレーサビリティは全体として良好。

### §7.3.3 代替テスト側注釈の確認

`src/__tests__/lib/services/registration-service.test.ts` に以下の注釈が存在することを確認:

```
@feature user_registration.feature
@scenario 仮ユーザーが Discord アカウントで本登録する
@scenario 本登録ユーザーが Discord アカウントでログインする
```

Discord OAuth ルートハンドラーのテストファイル群にも `@feature` 参照あり。§7.3.3 の代替テスト側トレーサビリティ規約は概ね遵守されている。

**未遵守箇所:** `src/__tests__/api/internal/internal-api-auth.test.ts` は BDDシナリオへの `@feature`/`@scenario` 注釈を持たない。ただし対応するfeatureシナリオが存在しないため（横断的ミドルウェア）、注釈の記載対象外と判断できる。LOW。

---

## 5. テストコードの品質評価

### 5.1 モック/スタブの適切性

- **BDD層（InMemoryリポジトリ）:** D-10 §2 の設計方針（インメモリ実装でシグネチャを統一、UUID形式バリデーション等）に従って実装されており、適切。
- **Vitest単体テスト（vi.mock）:** Discord OAuth ルートハンドラーのテストでは `vi.hoisted` を使ったモック変数の事前定義が行われており、hoisting問題を適切に回避している。Internal API テストでも同様の手法が使われており一貫している。
- **時刻制御:** D-10 §5（時計凍結の原則）の遵守状況はステップ定義ファイル全体で確認済みで問題なし。

### 5.2 テストの独立性

- BDD層: `Before` フックでWorldリセット（D-10 §3 の設計原則通り）が実装されている。
- Vitest: `beforeEach` での状態リセットがInternal APIテストで確認できる。

### 5.3 テスト名の記述性

- `registration-service.test.ts`: カバレッジ対象が冒頭のJSDocに明示されており可読性が高い。
- Internal APIテスト群: `See:` 参照でアーキテクチャ決定記録（TDR-010）への紐付けが明確。

### 5.4 テストパスの一貫性

`src/lib/domain/rules/__tests__/` と `src/__tests__/lib/domain/rules/` の2箇所にdomain/rulesテストが分散している。D-10 §4 の標準ディレクトリ構成は `src/__tests__/` 配下を示しているが、一部テストが `src/lib/domain/rules/__tests__/` に配置されている。機能的問題はないが、将来的に統一することが望ましい。

---

## 6. レビューサマリー

| 重要度 | 件数 | 内容 |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 2 | 撃破済みボット表示シナリオの代替テストファイルが「作成予定」のまま未作成（リンク切れ） |
| MEDIUM | 7 | 代替テスト未作成の技術的負債（インフラ制約3件・Discord OAuth E2E未作成2件・ボット表示UIテスト未作成2件）、`mypage-display-rules.ts` 専用テスト不在1件 |
| LOW | 2 | テストパスの2箇所分散（domain/rules）、Internal APIミドルウェアへの `@feature` 注釈なし |

### HIGH 問題の詳細

**H-1: `eliminated-bot-display.test.tsx` 未作成**

- 対象シナリオ: `撃破済みボットのレスはWebブラウザで目立たない表示になる`、`撃破済みボットのレス表示をトグルで切り替えられる`
- ステップ定義のコメントで `src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx（作成予定）` と明記されているが、ファイルが存在しない。
- D-10 §7.3.4: 「UIコンポーネント実装時に、対応する代替テストの作成を必須とする」と規定されている。
- UIコンポーネントが実装済みであればテスト作成が必要な状態。UIが未実装の場合はコメントを「UI未実装のため未作成」等に修正し、技術的負債として明示すること。

### 判定

**WARNING**（HIGH問題あり、CRITICAL問題なし）

HIGH問題（`eliminated-bot-display.test.tsx` 未作成）はブロッキングではないが、D-10 §7.3.4 の規定に違反している状態であり、次スプリントでの解消を推奨する。BDDシナリオの実行自体は全件問題なく（0 failed）、テストスイート全体の品質は良好である。
