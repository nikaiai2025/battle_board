# テスト監査レポート

> 実行日: 2026-03-19
> 対象スプリント: Sprint-64（Sprint-59〜63 UI構造改善後の検証サイクル）
> タスク: TASK-176

---

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingシナリオ数 | 16 |
| §7.3適合（分類あり・理由あり） | 16 / 16 |
| 代替テスト作成済み | 12 / 16 |
| 代替テスト未作成（技術的負債） | 4 |
| Phase未実装（§7.3範囲外） | 0 |

### Sprint-59〜63による増分の内訳（旧7件→現16件）

増加した9件は全て `thread.steps.ts` のT9（Sprint-63）で追加されたUI操作シナリオ。

| タグ | シナリオ数 | 分類 | 旧来/新規 |
|---|---|---|---|
| `@anchor_popup` | 4 | DOM/CSS表示・ブラウザ固有動作 | 新規 |
| `@post_number_display` | 3 | DOM/CSS表示・ブラウザ固有動作 | 新規 |
| `@pagination` | 2 | DOM/CSS表示（ポーリング）| 新規 |
| bot_system（DOM/CSS表示） | 2 | DOM/CSS表示 | 旧来 |
| specialist_browser_compat（HTTP:80/WAF） | 3 | インフラ制約 | 旧来 |
| user_registration（Discord OAuth） | 2 | ブラウザ固有動作 | 旧来 |

増分9件は全てUI構造改善（アンカーポップアップ・レス番号クリック・ポーリング）に対応する振る舞いシナリオであり、UIコンポーネント（React）が担う表示・インタラクション検証をサービス層テストから正しく除外したものとして妥当。

### 詳細: §7.3不適合一覧

全16シナリオについて以下を確認した:

- §7.3.1 分類キーワード: 全件あり（`DOM/CSS表示`、`ブラウザ固有動作`、`インフラ制約`、`D-10 §7.3`のいずれか）
- §7.3.2 pending理由: 全件のJSDocまたはコメントに記載あり
- §7.3.2 代替検証パス: 12/16件に記載あり（下記「技術的負債」を除く）

**MEDIUM（§7.3.2代替パス欠落）: 4件**

下記の4シナリオについてステップ定義コメントに「代替検証」パスが明示されているが実ファイルが未作成。コメント自体は存在するため §7.3.2 の「パス欠落」ではなく「ファイル不在」（下記「技術的負債」セクションで報告）。

なお `@anchor_popup`（4件）・`@post_number_display`（3件）・`@pagination`（2件）については以下の代替テストファイルへの参照がステップ定義コメント内に記載されており、**実ファイルが実在する**:
- `src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx`
- `src/__tests__/app/(web)/_components/AnchorLink.test.tsx`
- `src/__tests__/app/(web)/_components/AnchorPopup.test.tsx`
- `src/__tests__/app/(web)/_components/PaginationNav.test.ts`
- `src/__tests__/app/(web)/_components/PostItem.test.tsx`
- `src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx`
- `src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx`

上記9シナリオの代替テストは全件存在している。残4件が負債として残る。

**全件適合（§7.3.1・§7.3.2）**: 16/16件が分類あり・理由あり。

### 詳細: 技術的負債（代替テスト未作成）

以下4シナリオの代替テストが未作成。いずれも UI コンポーネント未実装に起因する。

| # | シナリオ | ステップ定義ファイル | 記載されている将来パス |
|---|---|---|---|
| 1 | 撃破済みボットのレスはWebブラウザで目立たない表示になる | `bot_system.steps.ts` L1623–1653 | `src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx` |
| 2 | 撃破済みボットのレス表示をトグルで切り替えられる（Given step: ユーザーがWebブラウザでスレッドを閲覧している） | `bot_system.steps.ts` L1640–1689 | 同上 |
| 3 | 仮ユーザーがDiscordアカウントで本登録する（E2Eテスト部分） | `user_registration.steps.ts` L857–886 | `OAuth フロー全体のE2Eテストは未作成` |
| 4 | 本登録ユーザーがDiscordアカウントでログインする（E2Eテスト部分） | `user_registration.steps.ts` L1050–1086 | 同上 |

補足: Discord OAuth の2シナリオについては `src/__tests__/lib/services/registration-service.test.ts` によってサービス層レベルで部分検証済み。`@feature`/`@scenario`注釈も存在する。未作成なのはE2Eテスト（OAuthフロー全体）の部分のみ。

---

## 2. テストピラミッド

| 層 | ファイル/シナリオ数 | 判定 |
|---|---|---|
| 単体テスト (Vitest) | 43 files | - |
| BDDサービス層 | 258 scenarios (242 passed想定, 16 pending) | - |
| E2E (フロー+スモーク) | 2 files (basic-flow.spec.ts, smoke/navigation.spec.ts) | 要注意 |
| CF Smoke | 1 file (cf-smoke/workers-compat.spec.ts) | - |
| 本番 Smoke | 1 file (prod/smoke.spec.ts) | - |

逆ピラミッド警告: なし（BDDシナリオ258件 >> E2Eテスト2ファイル）

**HIGH-01: E2Eスモークテストが新ページ構造に追従していない**

Sprint-59〜63で以下の新ページが追加されたが、`e2e/smoke/navigation.spec.ts` にスモークテストケースが存在しない。D-10 §10.5.5「`src/app/`に新しい`page.tsx`を追加した場合、対応するスモークテストケースを必ず追加する」違反。

追加されたが対応スモークテストが存在しないページ:
- `src/app/(web)/[boardId]/page.tsx` — 板トップページ
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — スレッドページ（ページネーション対応）

**HIGH-02: E2Eスモークテストが旧URL構造を参照している**

`e2e/smoke/navigation.spec.ts` の「スレッド詳細」テストは旧URLパス `/threads/${threadId}` を直接アクセスしており、`#thread-title`, `#back-to-list`, `#post-body-input` 等の要素IDを参照している。`src/app/(web)/threads/[threadId]/page.tsx` はSprint-59〜63で **redirect化** されたため、テスト対象のページ構造（=リダイレクト先 `/[boardId]/[threadKey]/` のページ）が正しく検証されているかが不明。D-10 §10.5.5「ページのURL構造が変更された場合、テストを追従させる」違反の疑い。

**MEDIUM-01: domain/rules テスト欠落**

`src/lib/domain/rules/mypage-display-rules.ts`（5つの純粋関数を含む）に対応する単体テストが存在しない。`src/lib/domain/rules/__tests__/` にも `src/__tests__/lib/domain/rules/` にも未作成。他の同等ファイル（pagination-parser.ts, accusation-rules.ts等）はテスト済み。

技術的には `HIGH`（「domain rules のテスト欠落」基準）だが、対象の関数が単純な型判定・ラベル生成のみであり、BDDシナリオ（user_registration.feature）が上位でカバーしているためリスクは限定的。`MEDIUM` に引き下げる。

---

## 3. Featureカバレッジ

| feature | 総シナリオ | 通常実行 | pending管理下 | 未定義 |
|---|---|---|---|---|
| thread.feature | 32 | 23 | 9 | 0 |
| bot_system.feature | 31 | 29 | 2 | 0 |
| specialist_browser_compat.feature | 33 | 30 | 3 | 0 |
| user_registration.feature | 27 | 25 | 2 | 0 |
| authentication.feature | 13 | 13 | 0 | 0 |
| posting.feature | 4 | 4 | 0 | 0 |
| currency.feature | 4 | 4 | 0 | 0 |
| incentive.feature | 30 | 30 | 0 | 0 |
| admin.feature | 19 | 19 | 0 | 0 |
| mypage.feature | 11 | 11 | 0 | 0 |
| reactions.feature | 21 | 21 | 0 | 0 |
| command_system.feature | 21 | 21 | 0 | 0 |
| ai_accusation.feature | 9 | 9 | 0 | 0 |
| integration/crud.feature | 3 | 3 | 0 | 0 |
| **合計** | **258** | **242** | **16** | **0** |

未定義シナリオ（ステップ定義が存在しないシナリオ）: 0件

### thread.feature 内のpendingシナリオ一覧（9件）

| シナリオ | タグ | 代替テストファイル |
|---|---|---|
| 本文中のアンカーをクリックすると参照先レスがポップアップ表示される | @anchor_popup | AnchorLink.test.tsx, AnchorPopup.test.tsx |
| ポップアップ内のアンカーをクリックするとポップアップが重なる | @anchor_popup | AnchorPopupContext.test.tsx |
| ポップアップの外側をクリックすると最前面のポップアップが閉じる | @anchor_popup | AnchorPopupContext.test.tsx |
| 存在しないレスへのアンカーではポップアップが表示されない | @anchor_popup | AnchorLink.test.tsx, AnchorPopupContext.test.tsx |
| レス番号が数字のみで表示される | @post_number_display | PostItem.test.tsx |
| レス番号をクリックすると返信テキストがフォームに挿入される | @post_number_display | PostFormInsertText.test.tsx |
| 入力済みのフォームにレス番号クリックで追記される | @post_number_display | PostFormInsertText.test.tsx |
| 最新ページ表示時のみポーリングで新着レスを検知する | @pagination | PostListLiveWrapper.test.tsx |
| 過去ページ表示時はポーリングが無効である | @pagination | PostListLiveWrapper.test.tsx |

---

## 4. トレーサビリティ指摘

### LOW-01: 代替テストの @feature/@scenario 注釈形式の不統一

D-10 §7.3.3 の規約形式（`@feature` / `@scenario` JSDocタグ）との差異。

| ファイル | 現状の注釈形式 | 規約準拠レベル |
|---|---|---|
| `registration-service.test.ts` | `@feature user_registration.feature` + `@scenario ...` | 完全準拠 |
| `PostListLiveWrapper.test.tsx` | `@feature thread.feature` + `@scenario スレッドのレスが書き込み順に表示される` | 準拠（ただしpendingシナリオへの参照が不足。下記参照） |
| `AnchorPopupContext.test.tsx` | `See: features/thread.feature @anchor_popup`（`@feature`タグなし） | 部分準拠 |
| `AnchorLink.test.tsx` | `See: features/thread.feature @anchor_popup`（`@feature`タグなし） | 部分準拠 |
| `AnchorPopup.test.tsx` | `See: features/thread.feature @anchor_popup`（`@feature`タグなし） | 部分準拠 |
| `PaginationNav.test.ts` | `See: features/thread.feature @pagination`（`@feature`タグなし） | 部分準拠 |
| `PostItem.test.tsx` | `See: features/thread.feature @post_number_display`（`@feature`タグなし） | 部分準拠 |
| `PostFormInsertText.test.tsx` | `See: features/thread.feature @post_number_display`（`@feature`タグなし） | 部分準拠 |

トレーサビリティの機能（どのBDDシナリオをカバーするかの追跡）は維持されているため `LOW` とする。

### LOW-02: PostListLiveWrapper.test.tsx の @scenario 参照がpendingシナリオを明示していない

`@scenario スレッドのレスが書き込み順に表示される`（通常実行シナリオ）のみが記載されており、本来代替テストとして紐づくべきpendingシナリオ（「最新ページ表示時のみポーリングで新着レスを検知する」「過去ページ表示時はポーリングが無効である」）への参照がない。機能的なカバレッジは存在するが形式的なトレーサビリティが欠落。

---

## 5. レビューサマリー

| 重要度 | 件数 | 内容 |
|---|---|---|
| CRITICAL | 0 | - |
| HIGH | 2 | E2Eスモーク新ページ未追加（HIGH-01）、旧URL参照の追従疑義（HIGH-02） |
| MEDIUM | 3 | 代替テスト未作成（技術的負債）4件（MEDIUM-02）、domain/rulesテスト欠落（MEDIUM-01）、E2Eフロー詳細 |
| LOW | 2 | @feature/@scenario注釈形式不統一（LOW-01）、PostListLiveWrapperのpending参照欠落（LOW-02） |

### 指摘一覧

| ID | 重要度 | 内容 | 対象ファイル |
|---|---|---|---|
| HIGH-01 | HIGH | 新ページ（板トップ・スレッドページ）のE2Eスモークテストが未追加（D-10 §10.5.5違反） | `e2e/smoke/navigation.spec.ts` |
| HIGH-02 | HIGH | スレッド詳細スモークテストが旧URL構造を参照（リダイレクト先ページの検証が不明確） | `e2e/smoke/navigation.spec.ts` L116–180 |
| MEDIUM-01 | MEDIUM | `mypage-display-rules.ts` の単体テスト欠落 | `src/lib/domain/rules/mypage-display-rules.ts` |
| MEDIUM-02 | MEDIUM | 撃破済みボット表示テスト未作成（将来パス `eliminated-bot-display.test.tsx` は記録済み） | `bot_system.steps.ts` L1623–1689 |
| MEDIUM-03 | MEDIUM | Discord OAuth E2Eテスト未作成（サービス層テストによる部分カバーは存在） | `user_registration.steps.ts` L857–1086 |
| LOW-01 | LOW | 代替テスト6ファイルの `@feature`/`@scenario` 注釈が規約形式でない（`See:` 形式） | Sprint-63で追加された新規テスト6ファイル |
| LOW-02 | LOW | `PostListLiveWrapper.test.tsx` のpendingシナリオへの `@scenario` 参照欠落 | `src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx` |

### pending増分妥当性の評価

旧7件（bot_system: 2 + specialist_browser_compat: 3 + user_registration: 2）から現16件への増分9件は全て `thread.steps.ts` T9追加分。9件の内訳は以下のとおりで、いずれも §7.3.1 分類あり・§7.3.2 理由あり・代替テストファイル実在の三条件を満たす。

- **@anchor_popup (4件)**: Reactコンポーネント（AnchorLink, AnchorPopup, AnchorPopupContext）で代替検証済み。ポップアップはブラウザDOM操作でありサービス層での検証は不可能。妥当。
- **@post_number_display (3件)**: PostItem.test.tsx, PostFormInsertText.test.tsx で代替検証済み。クリックイベントはブラウザ環境依存。妥当。
- **@pagination (2件)**: PostListLiveWrapper.test.tsx でポーリングロジックを代替検証済み。ポーリングはブラウザのsetIntervalに依存。妥当。

**増分9件の妥当性: 全件妥当と判定する。**

---

## 判定

```
HIGH: 2件（いずれもE2Eスモークテストの新ページ未追従）
```

判定: **WARNING**

CRITICAL な問題なし。HIGH の問題2件は E2E レイヤーのスモークテスト未追従のみ。BDD サービス層テスト（pending管理を含む）の運用は §7.3 に全件適合。

### 推奨アクション（優先度順）

1. **[HIGH-01] E2Eスモークテストに新ページを追加する**
   - `e2e/smoke/navigation.spec.ts` に板トップページ `/battleboard/` とスレッドページ `/battleboard/{threadKey}/` のテストケースを追加
   - D-10 §10.5.5 の義務的要件

2. **[HIGH-02] スレッド詳細スモークテストを新URLに更新する**
   - `/threads/${threadId}` → `/battleboard/${threadKey}/` への参照変更
   - 新ページの要素ID（`#thread-title` 等）が引き続き存在するか確認
   - リダイレクト動作（308）をPlaywrightが透過的に処理しているかの動作確認も推奨

3. **[MEDIUM-01] mypage-display-rules.ts の単体テストを作成する**
   - 配置先: `src/lib/domain/rules/__tests__/mypage-display-rules.test.ts` または `src/__tests__/lib/domain/rules/mypage-display-rules.test.ts`

4. **[MEDIUM-02/03] UIコンポーネント実装時に代替テストを同時作成する**
   - 撃破済みボット表示UIの実装タイミングで `eliminated-bot-display.test.tsx` を作成
   - Discord OAuth E2Eテストは認証フロー実装タイミングで検討

5. **[LOW-01/02] 代替テストの注釈形式を §7.3.3 規約に統一する（低優先）**
