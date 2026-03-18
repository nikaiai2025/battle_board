# テスト監査レポート

> 実行日: 2026-03-20
> 対象スプリント: Sprint-59〜65（UI構造改善 + Phase 5差し戻し修正）
> タスク: TASK-184
> 監査方針: 敵対的・懐疑的視点での厳格監査（全件）

---

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingステップ数（ユニーク） | 33 |
| 総pendingシナリオ数 | 16 |
| §7.3.1 分類あり | 7 / 16 シナリオ |
| §7.3.1 分類なし | **9 / 16 シナリオ** |
| §7.3.2 代替検証コメント準拠 | 7 / 16 |
| 代替テスト作成済み | 12 / 16 |
| 代替テスト未作成（技術的負債） | 2 |
| Phase未実装（§7.3範囲外） | 0 |

### pendingシナリオの内訳

| # | シナリオ | ファイル | §7.3.1分類 | 代替テスト |
|---|---|---|---|---|
| 1 | 撃破済みボットのレスはWebブラウザで目立たない表示になる | bot_system.steps.ts:1644 | DOM/CSS表示 | 未作成 |
| 2 | 撃破済みボットのレス表示をトグルで切り替えられる | bot_system.steps.ts:1668 | DOM/CSS表示 | 未作成 |
| 3 | 仮ユーザーがDiscordアカウントで本登録する | user_registration.steps.ts:875 | ブラウザ固有動作 | registration-service.test.ts |
| 4 | 本登録ユーザーがDiscordアカウントでログインする | user_registration.steps.ts:1068 | ブラウザ固有動作 | registration-service.test.ts |
| 5 | 専ブラの5chプロトコル通信がHTTP:80で直接応答される | specialist_browser_compat.steps.ts:3082 | インフラ制約 | Sprint-20実機検証 |
| 6 | bbs.cgiへのHTTP:80 POSTが直接処理される | specialist_browser_compat.steps.ts:3099 | インフラ制約 | Sprint-20実機検証 |
| 7 | 専ブラ特有のUser-AgentがWAFにブロックされない | specialist_browser_compat.steps.ts:3127 | インフラ制約 | Sprint-20実機検証 |
| 8 | 本文中のアンカーをクリックすると参照先レスがポップアップ表示される | thread.steps.ts:1729 | **なし** | AnchorPopupContext.test.tsx等 |
| 9 | ポップアップ内のアンカーをクリックするとポップアップが重なる | thread.steps.ts:1769 | **なし** | AnchorPopupContext.test.tsx等 |
| 10 | ポップアップの外側をクリックすると最前面のポップアップが閉じる | thread.steps.ts:1819 | **なし** | AnchorPopupContext.test.tsx等 |
| 11 | 存在しないレスへのアンカーではポップアップが表示されない | thread.steps.ts:1864 | **なし** | AnchorPopupContext.test.tsx等 |
| 12 | レス番号が数字のみで表示される | thread.steps.ts:1893 | **なし** | PostItem.test.tsx等 |
| 13 | レス番号をクリックすると返信テキストがフォームに挿入される | thread.steps.ts:1923 | **なし** | PostFormInsertText.test.tsx |
| 14 | 入力済みのフォームにレス番号クリックで追記される | thread.steps.ts:1953 | **なし** | PostFormInsertText.test.tsx |
| 15 | 最新ページ表示時のみポーリングで新着レスを検知する | thread.steps.ts:1678 | **なし** | PostListLiveWrapper.test.tsx |
| 16 | 過去ページ表示時はポーリングが無効である | thread.steps.ts:1710 | **なし** | PostListLiveWrapper.test.tsx |

### 詳細: §7.3不適合一覧

#### [HIGH-01] thread.steps.ts 全pendingステップ（9シナリオ分）に §7.3.1 分類キーワード欠落

対象: `features/step_definitions/thread.steps.ts` L1667〜L1963 の全28pendingステップ（9シナリオに属する）

D-10 §7.3.1 は pendingステップのコメントに `DOM/CSS表示` / `ブラウザ固有動作` / `インフラ制約` のいずれかの分類キーワードを要求する。thread.steps.ts のpending群は全て `@pending: UI操作テスト` という非標準表記のみで、§7.3.1 の分類キーワードを一切含まない。

対照的に他3ファイルは正しく分類されている:
- bot_system.steps.ts: `分類: DOM/CSS表示 -- Cucumberサービス層では検証不可（D-10 §7.3.1）`
- user_registration.steps.ts: `分類: ブラウザ固有動作（外部OAuth） -- Cucumberサービス層では検証不可（D-10 §7.3.1）`
- specialist_browser_compat.steps.ts: `分類: インフラ制約 -- Cucumberサービス層では検証不可（D-10 §7.3.1）`

pendingの性質を精査した結果、正しい分類は以下のとおり:
- anchor_popup系 (4シナリオ): `DOM/CSS表示` -- ポップアップのDOM操作
- post_number_display系 (3シナリオ): `DOM/CSS表示` -- レス番号表示・クリックのDOM操作
- polling系 (2シナリオ): `ブラウザ固有動作` -- ブラウザ環境のsetInterval依存

分類すべきカテゴリは明確であるにもかかわらず、コメントに記載されていない。

#### [HIGH-02] thread.steps.ts 全pendingステップに §7.3.2 `代替検証:` コメント行欠落

対象: `features/step_definitions/thread.steps.ts` L1667〜L1963

D-10 §7.3.2 はpendingステップのコメントに以下の2点を要求する:
1. pending理由（なぜサービス層で検証できないか）
2. `代替検証:` で始まるコメント行

thread.steps.ts のpending群はインラインコメントで `単体テストで担保（AnchorPopupContext.test.tsx）` のような記述を含むが、`代替検証: {ファイルパス}` の独立コメント行の形式（§7.3.2のコード例に準拠する形式）ではない。

bot_system.steps.ts ではセクションコメントとして `// 代替検証: UI未実装のため代替テスト未作成。UIコンポーネント実装時に...` の形式で正しく記載されている。

実害は形式的不備に留まるが、自動ツールによるトレーサビリティ抽出が困難になる。

### 詳細: §7.3.3 トレーサビリティ違反

#### [LOW-01] 代替テスト6ファイルに `@feature`/`@scenario` 正規注釈欠落

対象ファイル:
- `src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx`
- `src/__tests__/app/(web)/_components/AnchorLink.test.tsx`
- `src/__tests__/app/(web)/_components/AnchorPopup.test.tsx`
- `src/__tests__/app/(web)/_components/PostItem.test.tsx`
- `src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx`
- `src/__tests__/app/(web)/_components/PaginationNav.test.ts`

D-10 §7.3.3 は代替テストのファイル先頭に `@feature` / `@scenario` 注釈を要求する。上記6ファイルは `See: features/thread.feature @anchor_popup` のような自由形式コメントは持つが、正規注釈形式を使っていない。

対照的に `PostListLiveWrapper.test.tsx` と `registration-service.test.ts` は正しく `@feature`/`@scenario` 注釈を使用している。

### 詳細: 技術的負債（代替テスト未作成）

| # | シナリオ | 負債理由 |
|---|---|---|
| 1 | 撃破済みボットのレスはWebブラウザで目立たない表示になる | UI未実装のため代替テスト未作成 |
| 2 | 撃破済みボットのレス表示をトグルで切り替えられる | 同上 |

参照先 `src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx` は存在しない。ただし対応UIコンポーネント自体が未実装のため、テスト未作成は妥当。コメントに将来の作成義務が明記されている。

---

## 2. テストピラミッド

| 層 | ファイル/シナリオ数 | 判定 |
|---|---|---|
| 単体テスト (Vitest) | 43 files (.test.ts: 37, .test.tsx: 6) | - |
| BDDサービス層 (Cucumber) | 252 scenarios (236 passed, 16 pending) | - |
| E2E フロー検証 | 1 file (basic-flow.spec.ts) | - |
| E2E Smoke | 1 file (navigation.spec.ts, 10テストケース) | - |
| API テスト | 2 files (auth-cookie.spec.ts, senbra-compat.spec.ts) | - |
| CF Smoke | 1 file (workers-compat.spec.ts) | - |
| 本番 Smoke | 1 file (smoke.spec.ts) | - |

### 逆ピラミッド検証
E2Eテスト数 (6ファイル) < BDDシナリオ数 (252): 正常

### 下層空洞化検証

domain/rules ファイルとテストの対応:

| ルールファイル | テスト | 判定 |
|---|---|---|
| daily-id.ts | `rules/__tests__/daily-id.test.ts` | OK |
| validation.ts | `rules/__tests__/validation.test.ts` | OK |
| anchor-parser.ts | `rules/__tests__/anchor-parser.test.ts` | OK |
| incentive-rules.ts | `rules/__tests__/incentive-rules.test.ts` | OK |
| accusation-rules.ts | `src/__tests__/.../accusation-rules.test.ts` | OK |
| grass-icon.ts | `src/__tests__/.../grass-icon.test.ts` | OK |
| elimination-reward.ts | `rules/__tests__/elimination-reward.test.ts` | OK |
| command-parser.ts | `rules/__tests__/command-parser.test.ts` | OK |
| pagination-parser.ts | `src/__tests__/.../pagination-parser.test.ts` | OK |
| **mypage-display-rules.ts** | **なし** | **HIGH** |

#### [HIGH-03] mypage-display-rules.ts の単体テスト欠落（3スプリント延期中）

`src/lib/domain/rules/mypage-display-rules.ts` に対応する単体テストが `src/__tests__/lib/domain/rules/` にも `src/lib/domain/rules/__tests__/` にも存在しない。

これはSprint-64 (TASK-176) で MEDIUM として指摘、Sprint-65 で「後続スプリント」として延期された。Sprint-66 の現時点でも未対応。domain/rules は純粋関数でありテスト作成コストが最も低い層であるにもかかわらず、3スプリント延期が続いている。重要度を HIGH に昇格する。

---

## 3. Featureカバレッジ

| feature | 総シナリオ | 通常実行 | pending管理下 | 未定義 |
|---|---|---|---|---|
| thread.feature | 32 | 23 | 9 | 0 |
| posting.feature | 4 | 4 | 0 | 0 |
| authentication.feature | 12 | 12 | 0 | 0 |
| currency.feature | 4 | 4 | 0 | 0 |
| incentive.feature | 26 | 26 | 0 | 0 |
| ai_accusation.feature | 9 | 9 | 0 | 0 |
| reactions.feature | 17 | 17 | 0 | 0 |
| admin.feature | 18 | 18 | 0 | 0 |
| mypage.feature | 10 | 10 | 0 | 0 |
| command_system.feature | 17 | 17 | 0 | 0 |
| bot_system.feature | 24 | 22 | 2 | 0 |
| user_registration.feature | 28 | 26 | 2 | 0 |
| specialist_browser_compat.feature | 34 | 31 | 3 | 0 |
| **合計** | **235** | **219** | **16** | **0** |

未定義シナリオ: 0件 (CRITICAL該当なし)

### E2Eスモークテスト (navigation.spec.ts) カバレッジ

Sprint-65 (TASK-179) で更新済み:

| ページ | テストケース数 | 判定 |
|---|---|---|
| / (トップ) | 2 | OK |
| /battleboard/ (板トップ) | 2 | OK (Sprint-65追加) |
| /battleboard/{threadKey}/ (スレッド) | 2 | OK (Sprint-65追加、新URL対応) |
| /mypage | 2 | OK |
| /auth/verify | 2 | OK |
| **合計** | **10** | 全ページカバー |

---

## 4. 孤立検出

`@feature`/`@scenario` 注釈を持つテストファイルの参照先確認:

| ファイル | 参照先 | 結果 |
|---|---|---|
| PostListLiveWrapper.test.tsx | `@feature thread.feature` `@scenario スレッドのレスが書き込み順に表示される` | thread.feature に存在、OK |
| registration-service.test.ts | `@feature user_registration.feature` `@scenario 仮ユーザーが Discord アカウントで本登録する` `@scenario 本登録ユーザーが Discord アカウントでログインする` | user_registration.feature に存在、OK |

孤立テスト: 0件

---

## 5. 前回監査との差分

### TASK-176 (Sprint-64) からの変化

| 前回指摘 | 対応状況 |
|---|---|
| HIGH-01: 新ページのE2Eスモークテスト未作成 | 解消 (Sprint-65 TASK-179) |
| HIGH-02: E2Eスモークテストが旧URL参照 | 解消 (Sprint-65 TASK-179) |
| MEDIUM: mypage-display-rules.ts テスト未作成 | **未解消** (HIGH-03として昇格) |
| MEDIUM: 撃破済みボット表示テスト未作成 | 未解消 (MEDIUM-01として維持) |

### TASK-183 (Sprint-65差分監査) からの変化

TASK-183は差分監査であり、Sprint-65修正の確認に限定されていた。本監査 (TASK-184) は全件監査であり、TASK-183では確認対象外だった thread.steps.ts の §7.3 不適合を新たに検出した。

---

## 6. レビューサマリー

### 指摘一覧

| ID | 重要度 | 指摘内容 | 対象 |
|---|---|---|---|
| HIGH-01 | HIGH | thread.steps.ts 9シナリオ分のpendingに §7.3.1 分類キーワード欠落 | features/step_definitions/thread.steps.ts L1667-1963 |
| HIGH-02 | HIGH | thread.steps.ts 9シナリオ分のpendingに §7.3.2 `代替検証:` コメント行欠落 | features/step_definitions/thread.steps.ts L1667-1963 |
| HIGH-03 | HIGH | mypage-display-rules.ts の単体テスト欠落（3スプリント延期中） | src/lib/domain/rules/mypage-display-rules.ts |
| MEDIUM-01 | MEDIUM | 撃破済みボット表示テスト2件未作成（技術的負債、UI未実装のため妥当） | bot_system.steps.ts |
| LOW-01 | LOW | 代替テスト6ファイルに `@feature`/`@scenario` 正規注釈欠落 | src/__tests__/app/(web)/_components/*.test.ts{x} |

### 重要度別集計

| 重要度 | 件数 | ステータス |
|---|---|---|
| CRITICAL | 0 | pass |
| HIGH | 3 | warn |
| MEDIUM | 1 | info |
| LOW | 1 | note |

---

## 判定: WARNING

CRITICALな問題は存在しない。236シナリオがPASS、16シナリオがpending管理下。E2Eスモークテストは全ページをカバー。テストの実質的なカバレッジは健全。

HIGH 3件の内訳:

- **HIGH-01/02 (thread.steps.ts §7.3形式不備):** 代替テスト自体は存在し機能しているため、テスト品質への実害は低い。ただし同じコードベース内の他3ファイルが正しく遵守している規約を thread.steps.ts のみが不遵守であり、Sprint-59〜63での一括追加時の品質管理不備。コメント修正のみで対応可能。

- **HIGH-03 (mypage-display-rules.ts テスト欠落):** 純粋関数のテスト欠落が3スプリント延期されたまま。作成コストが最も低い層であり、「永久延期」化のリスクを指摘する。
