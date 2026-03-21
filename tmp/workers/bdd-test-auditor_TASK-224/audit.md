# テスト監査レポート

> 実行日: 2026-03-21
> 対象スプリント: Sprint-75 ~ Sprint-79
> タスク: TASK-224
> 前回監査: TASK-186（Sprint-67完了時点）

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingシナリオ数 | 16 |
| D-10 §7.3適合 | 16 / 16 |
| 代替テスト作成済み | 13 / 16 |
| 代替テスト未作成（技術的負債） | 0 |
| インフラ制約pending（§7.3範囲外） | 3 |

### 分類別内訳

| ファイル | カテゴリ | シナリオ数 | 代替テスト |
|---|---|---|---|
| thread.steps.ts | DOM/CSS表示 (@anchor_popup) | 4 | e2e/flows/thread-ui.spec.ts + Vitest 3ファイル |
| thread.steps.ts | DOM/CSS表示 (@post_number_display) | 3 | e2e/flows/thread-ui.spec.ts + PostFormInsertText.test.tsx + PostItem.test.tsx |
| thread.steps.ts | ブラウザ固有動作 (@pagination ポーリング) | 2 | e2e/flows/polling.spec.ts + PostListLiveWrapper.test.tsx |
| bot_system.steps.ts | DOM/CSS表示 (撃破BOT表示) | 2 | e2e/flows/bot-display.spec.ts |
| user_registration.steps.ts | 外部OAuth依存 (Discord) | 2 | registration-service.test.ts (サービス層で部分カバー) |
| specialist_browser_compat.steps.ts | インフラ制約 (HTTP:80/WAF) | 3 | 該当なし（Sprint-20実機検証済み） |

### 詳細: §7.3不適合一覧

全件適合。全pendingステップに以下が記載されている:
- pending理由（分類: DOM/CSS表示 / ブラウザ固有動作 / 外部OAuth / インフラ制約）
- D-10 §7.3.1 への参照
- 代替テストのファイルパス（§7.3.2 準拠の `return "pending"` 形式）

**前回指摘 HIGH-01/02 の解消を確認:** thread.steps.ts の全pendingステップに `分類: DOM/CSS表示` / `分類: ブラウザ固有動作` と `代替検証: {ファイルパス}` が追加された。4ファイル全てが同一の標準形式に統一されている。

### 詳細: 代替テストの実質性検証

代替テストの中身を読み、BDDシナリオの意図を実質的にカバーしているか確認した。

| 代替テスト | 判定 | 根拠 |
|---|---|---|
| e2e/flows/thread-ui.spec.ts | 実質あり | 7シナリオ分のE2E。アンカークリック→ポップアップ表示→内容確認→スタック→閉じるまで網羅。レス番号クリック→フォーム挿入も検証 |
| e2e/flows/polling.spec.ts | 実質あり | DB直接INSERT後のポーリング検知。waitForResponseでポーリング実行を待機し、新レスDOM出現を確認 |
| e2e/flows/bot-display.spec.ts | 実質あり | opacity検証 + トグルOFF/ON切替。BDDシナリオの「目立たない表示」「トグル切替」を直接アサート |
| AnchorPopupContext.test.tsx | 実質あり | popupStack管理のロジック（push/closeTop/存在しないレス拒否）を検証 |
| AnchorPopup.test.tsx | 実質あり | ポップアップ内のレス番号・表示名・日次ID・本文の表示をアサート |
| AnchorLink.test.tsx | 実質あり | アンカークリックでopenPopupが呼ばれることを検証 |
| PostFormInsertText.test.tsx | 実質あり | Context経由のinsertText→フォーム内容変化を検証（空フォーム・非空フォーム） |
| PostItem.test.tsx | 実質あり | レス番号表示（">>"なし）とクリックハンドラを検証 |
| PostListLiveWrapper.test.tsx | 実質あり | initialLastPostNumber prop変化時のstate同期を検証 |
| registration-service.test.ts | 実質あり | registerWithDiscord/loginWithDiscord/handleOAuthCallbackの正常系・異常系を34テストで網羅 |

### 詳細: 技術的負債（代替テスト未作成）

なし。前回MEDIUM-01（撃破済みボット表示テスト未作成）はe2e/flows/bot-display.spec.tsの作成により解消。

## 2. テストピラミッド

| 層 | ファイル数 | テスト数 | 判定 |
|---|---|---|---|
| 単体テスト (Vitest) | 72 | 1511 | OK |
| BDDサービス層 (Cucumber) | 15 features | 277 scenarios (261 passed, 16 pending) | OK |
| E2E (Playwright e2e) | 5 | 16 | OK |
| APIテスト (Playwright api) | 2 | 29 | OK |
| スモーク/ナビゲーション | 2 | 26 | OK |

### ピラミッドバランス判定

```
        [Smoke: 26]
       [E2E: 16]
      [API: 29]
   [BDD: 277 scenarios]
  [Unit: 1511 tests]
```

正常なピラミッド形状。下層（単体+BDD）が厚く、上層（E2E+Smoke）が薄い。逆ピラミッドの兆候なし。

### ドメインルール単体テストカバレッジ

`src/lib/domain/rules/` に11ファイル。直接の単体テストは10ファイル（2箇所に分散）。

| ルールファイル | 直接テスト | テスト数 |
|---|---|---|
| daily-id.ts | rules/__tests__/daily-id.test.ts | 14 |
| validation.ts | rules/__tests__/validation.test.ts | 55 |
| anchor-parser.ts | rules/__tests__/anchor-parser.test.ts | 33 |
| incentive-rules.ts | rules/__tests__/incentive-rules.test.ts | 62 |
| command-parser.ts | rules/__tests__/command-parser.test.ts | 51 |
| elimination-reward.ts | rules/__tests__/elimination-reward.test.ts | 12 |
| accusation-rules.ts | src/__tests__/.../accusation-rules.test.ts | 20 |
| grass-icon.ts | src/__tests__/.../grass-icon.test.ts | 30 |
| pagination-parser.ts | src/__tests__/.../pagination-parser.test.ts | 32 |
| url-detector.ts | src/__tests__/.../url-detector.test.ts | 46 |
| **mypage-display-rules.ts** | **なし** | **0** |

**所見 (MEDIUM):** `mypage-display-rules.ts` のみ直接の単体テストが存在しない。前回監査 TASK-186 (Sprint-67) でHIGH-03として初出後6スプリント継続。mypage-registration.test.ts (35テスト) がサービス層レベルで間接的にカバーしている。純粋関数のテスト欠落としてMEDIUMを維持する（前回HIGHからの降格理由は後述）。

## 3. Featureカバレッジ

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
| mypage.feature | 11 | 11 | 0 | 0 |
| command_system.feature | 25 | 25 | 0 | 0 |
| investigation.feature | 11 | 11 | 0 | 0 |
| specialist_browser_compat.feature | 33 | 30 | 3 | 0 |
| integration/crud.feature | 3 | 3 | 0 | 0 |
| **合計** | **277** | **261** | **16** | **0** |

注: `features/ドラフト_実装禁止/image_upload.feature` (8シナリオ) は実装禁止ディレクトリのため対象外。

未定義ステップ: **0件** (CRITICAL問題なし)

Sprint-75~79での変動:
- thread.feature: +4シナリオ (画像URLサムネイル @image_preview)。全4件が通常実行でPASS。
- command_system.feature: +2シナリオ (Sprint-67で追加済み、本期間でステップ定義が安定)。
- investigation.feature: +11シナリオ (調査コマンド)。全件通常実行でPASS。

## 4. ステップ定義の実質性

### assert(true) / expect(true) スタブアサーション

`features/step_definitions/` 全体を検索: **0件検出**。D-10 §7.3.2 準拠。

### Phase / 実装予定 コメント付きステップ

検出箇所:
- `mypage.steps.ts` L649-662: 「Phase 2以降で使用予定」コメントあり

**検証:** 該当ステップ（`Then "通知欄が表示される"`）は `assert(this.mypageResult !== null)` でmypageResultの存在を検証している。Phase 1では通知欄が「空の枠」として存在すればよいとの設計判断が明記されており、アサーションは現フェーズの要件に対して実質的。**スタブではない。**

## 5. 前回監査との差分（TASK-186 → TASK-224）

| 前回指摘 | 今回の状態 |
|---|---|
| HIGH-01: thread.steps.ts §7.3.1 分類キーワード欠落 | **解消** -- 全pendingに標準分類キーワード追加済み |
| HIGH-02: thread.steps.ts §7.3.2 代替検証コメント行欠落 | **解消** -- `代替検証:` 形式に統一済み |
| HIGH-03: mypage-display-rules.ts 単体テスト欠落 | **継続** -- MEDIUMに降格（理由: 間接カバーが確認され、テスト欠落による実害リスクが低い） |
| MEDIUM-01: 撃破済みボット表示テスト未作成 | **解消** -- e2e/flows/bot-display.spec.ts 作成済み |
| LOW-01: 代替テスト5ファイルに @feature/@scenario 注釈欠落 | **継続** -- See:形式でトレーサビリティ確保済みだが、JSDocタグ形式は未使用 |

## 6. レビューサマリー

| 重要度 | 件数 | ステータス | 内容 |
|---|---|---|---|
| CRITICAL | 0 | pass | -- |
| HIGH | 0 | pass | -- |
| MEDIUM | 1 | info | mypage-display-rules.ts に直接単体テストなし（6スプリント継続、間接カバーあり） |
| LOW | 1 | note | 代替テスト5ファイルで §7.3.3 の `@feature`/`@scenario` JSDocタグ未使用 |

### MEDIUM-1: mypage-display-rules.ts の直接単体テスト不足（継続）

**対象:** `src/lib/domain/rules/mypage-display-rules.ts`

**前回からの変化:** 前回HIGHからMEDIUMに降格。降格理由: (1) mypage-registration.test.ts (35テスト) がサービス層を経由して間接的にカバーしている。(2) 他の10ルールファイルは全て直接テストを持ち、本ファイルが唯一の例外であることから「テスト文化の欠如」ではなく「タスク優先順位の結果」と判断できる。

**推奨:** 次回の軽量タスクとして対応。推定作業量: 30分以内。

### LOW-1: 代替テストの @feature/@scenario アノテーション（継続）

**対象:** `AnchorPopupContext.test.tsx`, `AnchorPopup.test.tsx`, `AnchorLink.test.tsx`, `PostFormInsertText.test.tsx`, `PostItem.test.tsx`

**状態:** `BDDシナリオ: @anchor_popup` + `See: features/thread.feature` 形式でトレーサビリティ確保済み。D-10 §7.3.3 が例示するJSDocタグ (`@feature`, `@scenario`) は未使用だが、実質的に同等の情報が記載されている。

---

**判定: APPROVE**

前回WARNING（HIGH 3件）から**APPROVE**に改善。

- HIGH-01/02（thread.steps.ts §7.3形式不備）: 解消
- HIGH-03 → MEDIUM降格（mypage-display-rules.ts）: 間接カバー確認
- MEDIUM-01（撃破済みBOT表示テスト未作成）: 解消（bot-display.spec.ts新規作成）
- 新規CRITICAL/HIGH: なし
- 全277シナリオ中261がPASS、16がpending管理下、0が未定義
- スタブアサーション: 0件
