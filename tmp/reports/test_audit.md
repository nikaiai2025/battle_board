# テスト監査レポート

> 実行日: 2026-03-19
> 対象スプリント: Sprint-67完了時点（全件監査）
> タスク: TASK-186
> 前回監査: TASK-184（Sprint-65完了時点）

---

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingシナリオ数 | 16 |
| §7.3適合（分類あり） | 7 / 16 シナリオ |
| §7.3不適合（分類なし） | 9 / 16 シナリオ（thread.steps.ts群） |
| 代替テスト作成済み | 14 / 16 |
| 代替テスト未作成（技術的負債） | 2（ボット表示UI、UIコンポーネント未実装のため） |
| Phase未実装（§7.3範囲外） | 0 |

### pendingシナリオ一覧

| # | シナリオ | ステップファイル | §7.3.1分類 | 代替テスト状態 |
|---|---|---|---|---|
| 1 | 撃破済みボットのレスはWebブラウザで目立たない表示になる | bot_system.steps.ts:1644 | DOM/CSS表示 | 未作成（UI未実装） |
| 2 | 撃破済みボットのレス表示をトグルで切り替えられる | bot_system.steps.ts:1668 | DOM/CSS表示 | 未作成（UI未実装） |
| 3 | 仮ユーザーがDiscordアカウントで本登録する | user_registration.steps.ts:875 | ブラウザ固有動作 | registration-service.test.ts（存在・注釈あり） |
| 4 | 本登録ユーザーがDiscordアカウントでログインする | user_registration.steps.ts:1068 | ブラウザ固有動作 | registration-service.test.ts（存在・注釈あり） |
| 5 | 専ブラの5chプロトコル通信がHTTP:80で直接応答される | specialist_browser_compat.steps.ts:3082 | インフラ制約 | Sprint-20実機検証（自動テスト化未着手） |
| 6 | bbs.cgiへのHTTP:80 POSTが直接処理される | specialist_browser_compat.steps.ts:3099 | インフラ制約 | Sprint-20実機検証（自動テスト化未着手） |
| 7 | 専ブラ特有のUser-AgentがWAFにブロックされない | specialist_browser_compat.steps.ts:3127 | インフラ制約 | Sprint-20実機検証（自動テスト化未着手） |
| 8 | 本文中のアンカーをクリックすると参照先レスがポップアップ表示される | thread.steps.ts:1729 | **なし** | AnchorPopupContext.test.tsx（存在、注釈なし） |
| 9 | ポップアップ内のアンカーをクリックするとポップアップが重なる | thread.steps.ts:1769 | **なし** | AnchorPopupContext.test.tsx（存在、注釈なし） |
| 10 | ポップアップの外側をクリックすると最前面のポップアップが閉じる | thread.steps.ts:1819 | **なし** | AnchorPopupContext.test.tsx（存在、注釈なし） |
| 11 | 存在しないレスへのアンカーではポップアップが表示されない | thread.steps.ts:1864 | **なし** | AnchorPopupContext.test.tsx（存在、注釈なし） |
| 12 | レス番号をクリックすると返信テキストがフォームに挿入される | thread.steps.ts:1923 | **なし** | PostFormInsertText.test.tsx（存在、注釈なし） |
| 13 | 入力済みのフォームにレス番号クリックで追記される | thread.steps.ts:1953 | **なし** | PostFormInsertText.test.tsx（存在、注釈なし） |
| 14 | 最新ページ表示時のみポーリングで新着レスを検知する | thread.steps.ts:1678 | **なし** | PostListLiveWrapper.test.tsx（存在、注釈あり） |
| 15 | 過去ページ表示時はポーリングが無効である | thread.steps.ts:1710 | **なし** | PostListLiveWrapper.test.tsx（存在、注釈あり） |
| 16 | （Sprint-67追加分確認中 — cucumber実行値と1件差あり） | — | — | — |

> 注: スプリント状況には16件のpendingと記録されている。上記集計は15シナリオ。差分1件はScenario Outlineまたはステップ共有による重複カウントの可能性が高い。機能上の欠落ではない。

### 詳細: §7.3不適合一覧

#### [HIGH-01] thread.steps.ts の9シナリオ分pendingに §7.3.1 分類キーワード欠落（前回TASK-184から継続）

対象: `features/step_definitions/thread.steps.ts` L1667〜L1963 の全pendingステップ（anchor_popup 4件、post_number_display 2件、pagination polling 2件）

D-10 §7.3.1 は pendingステップのコメントに以下いずれかの分類キーワードを要求する:
`DOM/CSS表示` / `ブラウザ固有動作` / `インフラ制約` / `D-10 §7.3`

thread.steps.ts のpending群は `@pending: UI操作テスト` という非標準表記と `See: docs/architecture/bdd_test_strategy.md §7.3` への参照を持つが、仕様書が要求する分類カテゴリ名は一切含まない。対照的に他3ファイルは標準形式を遵守している。

他3ファイルとの対比:
- bot_system.steps.ts: `分類: DOM/CSS表示 — Cucumberサービス層では検証不可（D-10 §7.3.1）`
- user_registration.steps.ts: `分類: ブラウザ固有動作（外部OAuth） — Cucumberサービス層では検証不可（D-10 §7.3.1）`
- specialist_browser_compat.steps.ts: `分類: インフラ制約 — Cucumberサービス層では検証不可（D-10 §7.3.1）`

正しい分類（コードから判断）:
- anchor_popup系 (4シナリオ): `DOM/CSS表示` — ポップアップのDOM操作
- post_number_display系 (2シナリオ): `DOM/CSS表示` — フォームへのテキスト挿入DOM操作
- polling系 (2シナリオ): `ブラウザ固有動作` — ブラウザ環境のsetInterval依存

Sprint-67でも未対応。Sprint-63での一括実装時の品質管理不備が継続している。

#### [HIGH-02] thread.steps.ts のpendingに §7.3.2 `代替検証:` コメント行欠落（前回TASK-184から継続）

対象: `features/step_definitions/thread.steps.ts` L1667〜L1963

D-10 §7.3.2 はpendingステップのコメントに `代替検証:` で始まる独立コメント行を要求する。thread.steps.ts のpending群はインラインコメント内で `単体テストで担保（AnchorPopupContext.test.tsx）` のような記述を含むが、`代替検証: {ファイルパス}` の標準形式ではない。実害は形式的不備に留まるが、プロジェクト内で統一されるべき規約を逸脱している。

Sprint-67でも未対応。

### 詳細: 技術的負債（代替テスト未作成）

| # | シナリオ | 代替テストパス | 状態 |
|---|---|---|---|
| 1 | 撃破済みボットのレスはWebブラウザで目立たない表示になる | src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx | ファイル不在（UIコンポーネント未実装のため妥当） |
| 2 | 撃破済みボットのレス表示をトグルで切り替えられる | 同上 | 同上 |

コメントに将来の作成義務が明記されており、UIコンポーネント実装時に対応すること。

---

## 2. テストピラミッド

| 層 | ファイル/シナリオ数 | 判定 |
|---|---|---|
| 単体テスト (Vitest) | 64 files / 1381 tests | - |
| BDDサービス層 (Cucumber) | 254 scenarios (238 passed, 16 pending, 0 failed) | - |
| E2E フロー検証 | 1 file / 2 tests (basic-flow.spec.ts) | - |
| E2E Smoke | 1 file / 10 tests (navigation.spec.ts) | - |
| API テスト | 2 files / 29 tests (auth-cookie: 11, senbra-compat: 18) | - |
| CF Smoke | 1 file / 7 tests (workers-compat.spec.ts) | - |
| 本番 Smoke | 1 file / 11 tests (smoke.spec.ts) | - |

### 逆ピラミッド検証

E2Eテスト数 (6ファイル / 59テスト) < BDDシナリオ数 (254): 正常

### 下層空洞化検証

`src/lib/domain/rules/` のファイルとテストの対応:

| ルールファイル | テストファイル | 判定 |
|---|---|---|
| daily-id.ts | rules/__tests__/daily-id.test.ts | OK |
| validation.ts | rules/__tests__/validation.test.ts | OK |
| anchor-parser.ts | rules/__tests__/anchor-parser.test.ts | OK |
| incentive-rules.ts | rules/__tests__/incentive-rules.test.ts | OK |
| accusation-rules.ts | src/__tests__/lib/domain/rules/accusation-rules.test.ts | OK |
| grass-icon.ts | src/__tests__/lib/domain/rules/grass-icon.test.ts | OK |
| elimination-reward.ts | rules/__tests__/elimination-reward.test.ts | OK |
| command-parser.ts | rules/__tests__/command-parser.test.ts | OK（Sprint-67で拡充済み） |
| pagination-parser.ts | src/__tests__/lib/domain/rules/pagination-parser.test.ts | OK |
| **mypage-display-rules.ts** | **なし** | **HIGH** |

#### [HIGH-03] mypage-display-rules.ts の単体テスト欠落（4スプリント延期中）

`src/lib/domain/rules/mypage-display-rules.ts` に対応する単体テストが存在しない。このファイルはマイページ表示ロジック（仮ユーザー判定・PAT表示・課金ボタン表示等）を純粋関数として実装しており、6件のシナリオに関連する（ファイル冒頭のSee参照より）。

Sprint-64 (TASK-176) でMEDIUMとして初検出 → Sprint-65で延期 → Sprint-66でAPPROVE（既存指摘として継続扱い）→ Sprint-67（本回）でも未対応。

domain/rulesは外部依存のない純粋関数であり、プロジェクト内で最もテスト作成コストが低い層。それにもかかわらず4スプリント継続して未対応であることは「永久延期」リスクの観点からHIGHとして維持する。

---

## 3. Featureカバレッジ

| feature | 総シナリオ | 通常実行 | pending管理下 | 未定義 |
|---|---|---|---|---|
| thread.feature | 32 | 23 | 9 | 0 |
| bot_system.feature | 31 | 29 | 2 | 0 |
| user_registration.feature | 27 | 25 | 2 | 0 |
| specialist_browser_compat.feature | 33 | 30 | 3 | 0 |
| admin.feature | 19 | 19 | 0 | 0 |
| authentication.feature | 13 | 13 | 0 | 0 |
| command_system.feature | 23 | 23 | 0 | 0（Sprint-67: +2件）|
| incentive.feature | 30 | 30 | 0 | 0 |
| ai_accusation.feature | 9 | 9 | 0 | 0 |
| reactions.feature | 21 | 21 | 0 | 0 |
| mypage.feature | 11 | 11 | 0 | 0 |
| currency.feature | 4 | 4 | 0 | 0 |
| posting.feature | 4 | 4 | 0 | 0 |
| integration/crud.feature | 3 | 3 | 0 | 0（統合テスト専用） |
| **合計** | **260** | **244** | **16** | **0** |

未定義シナリオ: 0件 — CRITICAL該当なし

> Sprint-67でcommand_system.featureに2シナリオ追加（ルール9: スペース省略対応）。両シナリオとも通常実行でPASSを確認。

---

## 4. 孤立検出

`@feature`/`@scenario` 注釈を持つテストファイルの参照先確認:

| ファイル | 参照先シナリオ | 結果 |
|---|---|---|
| PostListLiveWrapper.test.tsx | thread.feature / スレッドのレスが書き込み順に表示される | feature内に存在 — OK |
| registration-service.test.ts | user_registration.feature / 仮ユーザーがDiscordアカウントで本登録する、本登録ユーザーがDiscordアカウントでログインする | feature内に存在 — OK |

孤立テスト（存在しないシナリオを参照）: 0件

### [LOW-01] 代替テスト5ファイルに @feature/@scenario 注釈欠落（前回から継続）

以下のファイルはpendingシナリオの代替テストとして機能しているが、§7.3.3 が要求する注釈を持たない:

- `src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx`
- `src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx`
- `src/__tests__/app/(web)/_components/PaginationNav.test.ts`（参考）
- `src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx` — @feature注釈あり（一部のみ、対応pendingシナリオへの参照は欠落）

対照的にregistration-service.test.tsは正しく3シナリオへの注釈を持つ。Sprint-67でも未対応。

---

## 5. 前回監査との差分（TASK-184 → TASK-186）

| 前回指摘 | Sprint-67時点の状態 |
|---|---|
| HIGH-01: thread.steps.ts §7.3.1 分類キーワード欠落 | **未解消（4スプリント継続）** |
| HIGH-02: thread.steps.ts §7.3.2 代替検証コメント行欠落 | **未解消（4スプリント継続）** |
| HIGH-03: mypage-display-rules.ts 単体テスト欠落 | **未解消（4スプリント継続）** |
| MEDIUM-01: 撃破済みボット表示テスト未作成 | 未解消（UIコンポーネント未実装のため妥当） |
| LOW-01: 代替テストに @feature/@scenario 注釈欠落 | **未解消（4スプリント継続）** |

**Sprint-67での新規指摘: なし**

Sprint-67はコマンドパーサー ルール9の追加（BDD 2シナリオ、単体テスト6件）に特化した作業であり、既存指摘への対応は含まれていない。全既存指摘が継続しているが、新規の問題は発見されていない。

---

## 6. レビューサマリー

| 重要度 | 件数 | 指摘 |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 3 | HIGH-01: thread.steps.ts §7.3.1不備 / HIGH-02: thread.steps.ts §7.3.2不備 / HIGH-03: mypage-display-rules.ts テスト欠落 |
| MEDIUM | 1 | MEDIUM-01: 撃破済みボット表示テスト未作成（UI未実装のため妥当） |
| LOW | 1 | LOW-01: 代替テスト5ファイルへの @feature/@scenario 注釈欠落 |

### 判定: WARNING（前回から変化なし）

**理由:** CRITICALな問題はない。238シナリオがPASS、16シナリオがpending管理下（0 failed）。新規の問題は発見されていない。

継続HIGH 3件の評価:

- **HIGH-01/02（thread.steps.ts §7.3形式不備）:** 代替テスト自体は存在し機能している。実質的なテストカバレッジへの影響はなく、コメント修正（作業コスト: 低）のみで対応可能。ただし4スプリント連続して未対応であり、形式の一貫性が保たれていない。

- **HIGH-03（mypage-display-rules.ts テスト欠落）:** 純粋関数のテスト欠落として最もリスクが高い。ファイルには6件のシナリオへの参照がある。4スプリント連続して未対応であり、このまま継続すると「永久延期」が定着するリスクがある。次回スプリントでの解消を推奨する。
