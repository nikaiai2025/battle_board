# テスト監査レポート

> 実行日: 2026-03-22
> 対象スプリント: Sprint-80（フェーズ5差し戻し修正）
> タスク: TASK-231
> 前回監査: TASK-224（Sprint-75~79完了時点）

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingシナリオ数 | 16 |
| D-10 §7.3適合 | 16 / 16 |
| 代替テスト作成済み | 13 / 16 |
| 代替テスト未作成（技術的負債） | 0 |
| インフラ制約pending（§7.3範囲外） | 3 |

**前回 (TASK-224) から変化なし。** Sprint-80はテスト修正のみでpendingの追加・削除は発生していない。

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

全件適合。Sprint-80で新規pendingの追加はなく、既存pendingのコメント形式にも変更なし。

### 詳細: 技術的負債（代替テスト未作成）

なし。

## 2. テストピラミッド

| 層 | ファイル数 | テスト数 | 前回比 | 判定 |
|---|---|---|---|---|
| 単体テスト (Vitest) | 72 | 1535 | +24 | OK |
| BDDサービス層 (Cucumber) | 15 features | 277 scenarios (261 passed, 16 pending) | +/-0 | OK |
| E2E (Playwright e2e) | 5 | 16 | +/-0 | OK |
| APIテスト (Playwright api) | 2 | 29 | +/-0 | OK |
| スモーク/ナビゲーション | 1 | 19 | +/-0 | OK |

### ピラミッドバランス判定

```
       [Smoke: 19]
      [E2E: 16]
     [API: 29]
  [BDD: 277 scenarios]
 [Unit: 1535 tests]
```

正常なピラミッド形状。下層（単体 1535 + BDD 277）が厚く、上層（E2E 16 + Smoke 19）が薄い。逆ピラミッドの兆候なし。Sprint-80でVitest単体テストが24件増加し、下層がさらに強化された。

### ドメインルール単体テストカバレッジ

`src/lib/domain/rules/` に11ファイル。直接の単体テストは10ファイル（2箇所に分散）。

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
| **mypage-display-rules.ts** | **なし** | MEDIUM（継続） |

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

前回から変化なし。Sprint-80はテスト修正のみであり、シナリオの追加・削除は発生していない。

## 4. ステップ定義の実質性

### assert(true) / expect(true) スタブアサーション

`features/step_definitions/` 全体を検索: **0件検出**。D-10 §7.3.2 準拠。

### Phase / 実装予定 コメント付きステップ

検出箇所:
- `mypage.steps.ts` L649-662: 「Phase 2以降で使用予定」コメントあり

**検証:** 該当ステップ（`Then "通知欄が表示される"`）は `assert(this.mypageResult !== null)` でmypageResultの存在を検証している。Phase 1では通知欄が「空の枠」として存在すればよいとの設計判断が明記されており、アサーションは現フェーズの要件に対して実質的。**スタブではない。**

## 5. Sprint-80修正ファイルの個別検証

Sprint-80で修正された3テストファイルの品質を検証した。

### e2e/api/auth-cookie.spec.ts

- **修正内容:** Max-Age期待値を `60*60*24*365`（365日）に修正（L431）
- **アサーション品質:** 10テスト。Cookie属性（HttpOnly, SameSite=Lax, Path=/, Max-Age）のHTTPレベル検証、誤った認証コードの401応答、edge-tokenなしの400応答をカバー。正常系+異常系が適切にバランス
- **トレーサビリティ:** ファイル冒頭JSDocに検証対象APIルートとD-10 §9.2への参照あり
- **判定:** 問題なし

### e2e/api/senbra-compat.spec.ts

- **修正内容:** `cleanupDatabase` でDELETEのレスポンスステータスを検証するよう強化（L59-83）。非同期コミット漏れ対策
- **アサーション品質:** 18テスト。Shift_JISエンコーディングのラウンドトリップ検証、DAT形式の5フィールド構成検証、bump順ソート、Range 206応答、bbs.cgi Shift_JIS POST等。専ブラ互換の核心部分を網羅
- **トレーサビリティ:** ファイル冒頭JSDocに対応featureファイルとD-10 §9への参照あり
- **判定:** 問題なし

### src/__tests__/lib/services/handlers/hissi-handler.test.ts

- **修正内容:** モック設定修正（`findByAuthorIdAndDate` のmock戻り値をDESC順に統一、`mockResolvedValueOnce` への変更）
- **アサーション品質:** 15テスト。バリデーション5件（引数なし、レス不在、システムメッセージ、削除済み、authorId null）+ 正常系8件（0件/1件/3件/5件以上、フォーマット、dailyId、複数スレッド横断、時系列順）+ エラー時独立メッセージ非存在1件。エッジケース網羅が優秀
- **トレーサビリティ:** ファイル冒頭JSDocに `investigation.feature` シナリオへの参照あり
- **判定:** 問題なし

## 6. 前回監査との差分（TASK-224 -> TASK-231）

| 前回指摘 | 今回の状態 |
|---|---|
| MEDIUM-1: mypage-display-rules.ts 直接単体テスト不足 | **継続** -- 7スプリント継続（Sprint-67初出）。間接カバーあり |
| LOW-1: 代替テスト5ファイルに @feature/@scenario 注釈欠落 | **継続** -- See:形式でトレーサビリティ確保済み |

Sprint-80の修正で新規指摘は発生せず、既存指摘の悪化もなし。

## 7. レビューサマリー

| 重要度 | 件数 | ステータス | 内容 |
|---|---|---|---|
| CRITICAL | 0 | pass | -- |
| HIGH | 0 | pass | -- |
| MEDIUM | 1 | info | mypage-display-rules.ts に直接単体テストなし（7スプリント継続、間接カバーあり） |
| LOW | 1 | note | 代替テスト5ファイルで §7.3.3 の `@feature`/`@scenario` JSDocタグ未使用 |

### MEDIUM-1: mypage-display-rules.ts の直接単体テスト不足（継続）

**対象:** `src/lib/domain/rules/mypage-display-rules.ts`

**前回からの変化:** なし。Sprint-80の修正対象外。mypage-registration.test.ts がサービス層を経由して間接的にカバーしている状態が継続。

**推奨:** 次回の軽量タスクとして対応。推定作業量: 30分以内。

### LOW-1: 代替テストの @feature/@scenario アノテーション（継続）

**対象:** `AnchorPopupContext.test.tsx`, `AnchorPopup.test.tsx`, `AnchorLink.test.tsx`, `PostFormInsertText.test.tsx`, `PostItem.test.tsx`

**状態:** `BDDシナリオ: @anchor_popup` + `See: features/thread.feature` 形式でトレーサビリティ確保済み。D-10 §7.3.3 が例示するJSDocタグ (`@feature`, `@scenario`) は未使用だが、実質的に同等の情報が記載されている。

---

**判定: APPROVE**

Sprint-80差し戻し修正後も前回判定を維持。

- CRITICAL/HIGH: 0件
- Sprint-80修正の3ファイル: 全てアサーション品質・トレーサビリティに問題なし
- テストピラミッド: 単体テスト +24件で下層強化。バランス健全
- pendingシナリオ: 16件、全てD-10 §7.3適合。変化なし
- Featureカバレッジ: 277シナリオ中261通常実行、16pending管理下、0未定義
- スタブアサーション: 0件
