# テスト監査レポート

> 実行日: 2026-03-22
> 対象スプリント: Sprint-96 / Sprint-97 (!aori + !newspaper 実装)
> タスク: P5-TA-S97
> 前回監査: TASK-231（Sprint-80完了時点）

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingステップ数 | 12 |
| D-10 S7.3適合 | 12 / 12 |
| 代替テスト作成済み | 6 / 12 |
| 代替テスト未作成（技術的負債） | 6 |
| Phase未実装（S7.3範囲外） | 0 |

### 対象featureのpending: 0件

`command_aori.steps.ts` および `command_newspaper.steps.ts` には `return "pending"` が存在しない。全12シナリオが通常実行ステップで実装されている。

### プロジェクト全体のpending内訳

前回(TASK-231)の16件から4件減少。原因は、前回カウントに含まれていたシナリオの一部がname除外（S6）対象であったための再集計差分であり、実質的な変化は以下の通り。

| ファイル | ステップ数 | 理由 | 代替テスト | S7.3準拠 |
|---|---|---|---|---|
| bot_system.steps.ts | 6 | DOM/CSS表示（Web限定）: D-10 S7.3.1 | `e2e/flows/bot-display.spec.ts` 実在。ただし `test.fixme()` でスキップ中（UIコンポーネント未実装のため） | 適合 |
| user_registration.steps.ts | 4 | Discord OAuth外部依存: サービス層でシミュレーション困難 | 代替テスト未作成 | 適合（理由記載あり。ブラウザ固有動作に該当） |
| specialist_browser_compat.steps.ts | 2 | インフラ制約（HTTP:80/WAF）: Cloudflare設定レベル | 代替テスト未作成（Sprint-20実機検証済み） | 適合（理由記載あり。インフラ制約に該当） |

### 詳細: S7.3不適合一覧

全件適合。

### 詳細: 技術的負債（代替テスト未作成）

| ステップ | 分類 | 備考 |
|---|---|---|
| user_registration.steps.ts: Discord OAuth 4ステップ | ブラウザ固有動作 | E2Eテストで代替検証が可能だが未作成（前回から継続） |
| specialist_browser_compat.steps.ts: HTTP:80 + WAF 2ステップ | インフラ制約 | Cloudflare設定で保証。自動テスト化は困難（前回から継続） |

## 2. テストピラミッド

| 層 | ファイル数 | シナリオ/テスト概数 | 前回比 | 判定 |
|---|---|---|---|---|
| 単体テスト (Vitest) | 57ファイル | 多数 | - | OK |
| BDDサービス層 (Cucumber default) | 21 stepsファイル / 20 feature | 324シナリオ（ドラフト除外。name除外3件別途） | +47 | OK |
| 統合テスト (Cucumber integration) | 1 feature | 3シナリオ | +/-0 | OK |
| APIテスト (Playwright api) | 2ファイル | - | +/-0 | OK |
| E2Eテスト (Playwright e2e) | 7ファイル | - | +/-0 | OK |

**判定: 健全なピラミッド構造。** 下層（単体57 + BDD 21ステップ定義ファイル）が上層（API 2 + E2E 7）を大きく上回る。Sprint-96/97で BDD 12シナリオ + 単体テスト3ファイルが追加され、下層がさらに強化された。

### ドメインルール単体テストカバレッジ

`src/lib/domain/rules/` に11ファイル。直接の単体テストは10ファイル（`rules/__tests__/` に6件 + `src/__tests__/lib/domain/rules/` に4件）。

| ルールファイル | 直接テスト | 状態 |
|---|---|---|
| daily-id.ts | rules/__tests__/daily-id.test.ts | OK |
| validation.ts | rules/__tests__/validation.test.ts | OK |
| anchor-parser.ts | rules/__tests__/anchor-parser.test.ts | OK |
| incentive-rules.ts | rules/__tests__/incentive-rules.test.ts | OK |
| command-parser.ts | rules/__tests__/command-parser.test.ts | OK |
| elimination-reward.ts | rules/__tests__/elimination-reward.test.ts | OK |
| accusation-rules.ts | src/__tests__/.../accusation-rules.test.ts | OK |
| grass-icon.ts | src/__tests__/.../grass-icon.test.ts | OK |
| pagination-parser.ts | src/__tests__/.../pagination-parser.test.ts | OK |
| url-detector.ts | src/__tests__/.../url-detector.test.ts | OK |
| **mypage-display-rules.ts** | **なし** | MEDIUM（前回から継続） |

## 3. Featureカバレッジ

### Sprint-96/97対象feature

| feature | 総シナリオ | 通常実行 | pending管理下 | 未定義 |
|---|---|---|---|---|
| command_aori.feature | 7 | 7 | 0 | 0 |
| command_newspaper.feature | 5 | 5 | 0 | 0 |

### プロジェクト全体

| feature | 総シナリオ | 通常実行 | pending管理下 | 未定義 |
|---|---|---|---|---|
| thread.feature | 36 | 27 | 9 | 0 |
| posting.feature | 4 | 4 | 0 | 0 |
| authentication.feature | 13 | 13 | 0 | 0 |
| currency.feature | 4 | 4 | 0 | 0 |
| incentive.feature | 30 | 30 | 0 | 0 |
| reactions.feature | 21 | 21 | 0 | 0 |
| admin.feature | 19 | 19 | 0 | 0 |
| bot_system.feature | 31 | 29 | 2 | 0 |
| ai_accusation.feature | 9 | 9 | 0 | 0 |
| user_registration.feature | 27 | 25 | 2 | 0 |
| mypage.feature | 19 | 19 | 0 | 0 |
| command_system.feature | 25 | 25 | 0 | 0 |
| investigation.feature | 11 | 11 | 0 | 0 |
| specialist_browser_compat.feature | 33 | 30 | 3 | 0 |
| welcome.feature | 11 | 11 | 0 | 0 |
| command_omikuji.feature | 4 | 4 | 0 | 0 |
| command_iamsystem.feature | 7 | 7 | 0 | 0 |
| command_aori.feature | 7 | 7 | 0 | 0 |
| command_newspaper.feature | 5 | 5 | 0 | 0 |
| dev_board.feature | 5 | - | - | - |
| integration/crud.feature | 3 | 3 | 0 | 0 |
| **合計(BDD対象)** | **319** | **303** | **16** | **0** |

注: `dev_board.feature`(5シナリオ)はcucumber.js pathsに含まれずBDDテスト対象外。UI中心の機能であり、`dev-post-service.test.ts`が単体テストでカバー。name除外3件（command_system 1件 + bot_system 2件）は別途管理。`features/ドラフト_実装禁止/` (23シナリオ)は対象外。

**未定義ステップ: 0件** (CRITICAL問題なし)

## 4. ステップ定義の実質性

### assert(true) / expect(true) スタブアサーション

`features/step_definitions/` 全体を検索: **0件検出**。D-10 S7.3.2 準拠。

### 定数ハードコード検証のみのステップ (MEDIUM)

以下の2ステップは、BDDシナリオが意図する振る舞い（実際の通貨残高変動）を検証せず、仕様定数のハードコード比較のみを行っている。

| ファイル | ステップ | 実装内容 | 問題 |
|---|---|---|---|
| command_aori.steps.ts L732-739 | `攻撃コスト {int} が消費される` | `assert.strictEqual(cost, 5)` のみ | 引数値の確認のみで実残高減少を未検証 |
| command_aori.steps.ts L763-769 | `撃破報酬 {int} がユーザーに付与される` | `assert.strictEqual(reward, 10)` のみ | 引数値の確認のみで実残高増加を未検証 |

**影響度の評価:**
- Whenステップ `"!attack >>7" を実行する` は `command_system.steps.ts` の共有ステップで PostService.createPost を実際に実行しており、通貨消費と報酬付与のロジック自体は動作している
- 別シナリオ「自分で召喚したBOTを自分で撃破してもファーミングできない」が `通貨残高は 95 である` で一連の経済バランスを実残高ベースで検証済み
- 単体テスト `attack-handler.test.ts` が撃破ロジックを個別検証済み
- 以上により、テスト品質としては致命的ではないが、当該シナリオ単体での自己完結性が弱い

### Phase / 実装予定コメント

検出箇所: `mypage.steps.ts` L613-625（「Phase 2以降で使用予定」）。`assert(this.mypageResult !== null)` で実質的な検証を行っており、**スタブではない**（前回から変化なし）。

## 5. テストの独立性とモック適切性

### テスト間の状態共有

- `command_aori.steps.ts`: モジュールスコープの `lastAoriResult`（L69-71）がシナリオ間で共有される。各シナリオのWhenステップで上書きされるため実害なし
- `command_newspaper.steps.ts`: `lastNewspaperResult`（L66-68）と `mockAiAdapter`（L63）をモジュールスコープで保持。`resetMockState()` を各シナリオの Given で明示的に呼んでおり、リセット対策済み

**判定: 問題なし。**

### InMemoryモック適切性

両ステップ定義とも D-10 S2 に従いリポジトリ層をInMemory実装に差し替え。サービス間連携（PostService -> CommandService -> Handler）はモックせず結合テスト。`InMemoryGoogleAiAdapter` による AI API モック化は外部サービス依存の適切な分離。

**判定: 適切。**

## 6. 前回監査との差分（TASK-231 -> P5-TA-S97）

| 前回指摘 | 今回の状態 |
|---|---|
| MEDIUM-1: mypage-display-rules.ts 直接単体テスト不足 | **継続** |
| LOW-1: 代替テスト5ファイルに @feature/@scenario 注釈欠落 | **継続** |

Sprint-96/97で新規MEDIUM指摘1件追加（定数ハードコード検証のみのステップ）。

## 7. レビューサマリー

| 重要度 | 件数 | ステータス | 内容 |
|---|---|---|---|
| CRITICAL | 0 | pass | - |
| HIGH | 0 | pass | - |
| MEDIUM | 2 | info | (1) 定数ハードコード検証ステップ2件（間接カバー済み） (2) mypage-display-rules.ts単体テスト欠落（継続） |
| LOW | 1 | note | 代替テスト5ファイルでS7.3.3 @feature/@scenarioタグ未使用（継続） |

### MEDIUM-1（新規）: 攻撃コスト/撃破報酬ステップの定数比較のみ

**対象:** `features/step_definitions/command_aori.steps.ts` L732-739, L763-769

**内容:** シナリオ「煽りBOTを !attack で撃破すると報酬を得る」において、`攻撃コスト 5 が消費される` と `撃破報酬 10 がユーザーに付与される` が引数値の定数比較のみで、実際の残高変動を検証していない。

**緩和要因:** 別シナリオ「自分で召喚したBOTを自分で撃破してもファーミングできない」が `通貨残高は 95 である` で合算残高を検証済み。単体テスト `attack-handler.test.ts` が個別ロジックを検証済み。

**推奨:** 当該シナリオの末尾に `通貨残高は 105 である`（= 100 - 5 + 10）の検証を追加する。または既存の2ステップを実残高ベースのアサーションに改修する。

### MEDIUM-2（継続）: mypage-display-rules.ts の直接単体テスト欠落

前回から変化なし。間接カバーあり。

---

**判定: APPROVE**

CRITICAL / HIGH の問題は検出されなかった。Sprint-96/97で追加された !aori 7シナリオ + !newspaper 5シナリオは全て通常実行ステップで実装済み、pendingなし、未定義ステップなし、スタブアサーションなし。テストピラミッドも健全。
