---
task_id: TASK-172
sprint_id: Sprint-63
status: completed
assigned_to: bdd-coding
depends_on: [TASK-163, TASK-164, TASK-165, TASK-166, TASK-167, TASK-168, TASK-169]
created_at: 2026-03-19T22:45:00+09:00
updated_at: 2026-03-19T22:45:00+09:00
locked_files:
  - features/step_definitions/thread.steps.ts
  - features/step_definitions/specialist_browser_compat.steps.ts
---

## タスク概要

Sprint-59〜62で実装された19個の新BDDシナリオ(@url_structure 5件, @pagination 7件, @anchor_popup 4件, @post_number_display 3件)のステップ定義を追加する。加えて専ブラ互換ステップ(read.cgiリダイレクト先変更、板トップ直接表示)を修正する。

## 対象BDDシナリオ
- `features/thread.feature` @url_structure（5シナリオ）
- `features/thread.feature` @pagination（7シナリオ）
- `features/thread.feature` @anchor_popup（4シナリオ）
- `features/thread.feature` @post_number_display（3シナリオ）
- `features/constraints/specialist_browser_compat.feature` — read.cgi / 板トップ関連

## 必読ドキュメント（優先度順）
1. [必須] `features/thread.feature` — 対象シナリオ全文
2. [必須] `features/constraints/specialist_browser_compat.feature` — read.cgi / 板トップシナリオ
3. [必須] `features/step_definitions/thread.steps.ts` — 既存ステップ（拡張先）
4. [必須] `features/step_definitions/specialist_browser_compat.steps.ts` — 既存ステップ（修正先）
5. [必須] `features/support/world.ts` — Cucumber World（テスト状態管理）
6. [必須] `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略書（モック戦略・World設計）
7. [参考] 実装済みコード:
   - `src/lib/domain/rules/pagination-parser.ts` — parsePaginationRange
   - `src/lib/services/post-service.ts` — getThreadByThreadKey, getPostList
   - `src/app/(web)/_components/PaginationNav.tsx` — PaginationNav
   - `src/app/(web)/_components/AnchorPopupContext.tsx` — ポップアップスタック
   - `src/app/(web)/_components/AnchorLink.tsx` — アンカーリンク
   - `src/app/(web)/_components/PostItem.tsx` — レス番号クリック

## 修正内容

### A. thread.steps.ts にステップ追加

#### @url_structure (5シナリオ)
1. スレッドURLにスレッドキー（数値）が使われる
2. ルートURLが板トップにリダイレクトされる
3. 板URLでスレッド一覧が直接表示される
4. スレッド一覧のリンクが板パス付きスレッドキー形式である
5. 旧形式のスレッドURL（/threads/UUID）が新URLにリダイレクトされる

テスト方針: Service層のInMemoryリポジトリでデータ準備し、URL構造・リダイレクト先を検証

#### @pagination (7シナリオ)
1. デフォルト表示が最新50件
2. レス範囲を指定してスレッドを表示
3. 最新N件の表示
4. ページナビゲーションが表示される
5. 100件以下のスレッドではナビゲーション非表示
6. 最新ページ表示時のみポーリング有効
7. 過去ページ表示時はポーリング無効

テスト方針: parsePaginationRange と PostService.getPostList のオプション指定を検証。UIコンポーネント(PaginationNav)のレンダリングは単体テストで担保済み

#### @anchor_popup (4シナリオ)
1. アンカークリックでポップアップ表示
2. ポップアップ内アンカーでネスト表示
3. 外側クリックで最前面閉じ
4. 存在しないレスでポップアップ非表示

テスト方針: D-10 §7.3に従い、UIインタラクション（クリック→ポップアップ表示）はCucumber層ではpending維持が妥当（JSDOM/Playwrightの境界）。ただし、ポップアップスタック管理のロジック（openPopup/closeTopPopup）は単体テストで担保済み（AnchorPopupContext.test.tsx 17件）。

判断: @anchor_popup の4シナリオはUI操作依存のため **pending** とする。理由を `# @pending: UI操作テスト — 単体テストで担保（AnchorPopupContext.test.tsx）` のコメントで記載。

#### @post_number_display (3シナリオ)
1. レス番号が数字のみで表示される
2. レス番号クリックで返信テキスト挿入
3. 入力済みフォームに追記

テスト方針: PostItem/PostFormのレンダリング結果を検証。Context連携はCucumber層では検証困難のため、pending維持が妥当。単体テストで担保済み（PostItem.test.tsx 10件, PostFormInsertText.test.tsx 4件）。

判断: @post_number_display の3シナリオもUI操作依存のため **pending** とする。

### B. specialist_browser_compat.steps.ts 修正

1. read.cgiリダイレクト: リダイレクト先の検証を `/threads/{UUID}` → `/{boardId}/{threadKey}/` に変更
2. 板トップURL: 200レスポンス（直接表示）の検証に変更（旧: 302リダイレクト検証 → 新: 200直接表示検証）

## 完了条件
- [ ] `npx cucumber-js --tags @url_structure` — 5シナリオ全PASS
- [ ] `npx cucumber-js --tags @pagination` — 7シナリオ全PASS（pending除く）
- [ ] `npx cucumber-js --tags @anchor_popup` — 4シナリオ pending（単体テストで担保）
- [ ] `npx cucumber-js --tags @post_number_display` — 3シナリオ pending（単体テストで担保）
- [ ] 既存BDDシナリオに破壊的影響なし: `npx cucumber-js` 全体でfailure 0
- [ ] テストコマンド: `npx cucumber-js`

## スコープ外
- 新規BDDシナリオの追加・変更（features/ は変更禁止）
- 単体テストの追加（既にSprint-60〜62で作成済み）
- Playwright E2Eテスト

## 補足・制約
- features/ ファイルは読み取り専用。ステップ定義のみを追加・修正する
- World の設計は `features/support/world.ts` に従う
- InMemoryリポジトリの使用は `docs/architecture/bdd_test_strategy.md` に従う
- D-10 §7.3: UI操作テスト（クリック→表示）はCucumber層の境界外。pending + 単体テストカバレッジで担保

## 作業ログ

### チェックポイント
- 状態: 完了

### escalation_resolution
前回ワーカーがコンテキスト切れで中断。ステップ定義のコードは書かれたが、テスト実行前に中断。
テスト実行した結果、以下のCucumberExpression構文エラーが全テストで発生:

```
CucumberExpressionError: Alternative may not be empty.
If you did not mean to use an alternative you can use '\/' to escape the '/'
```

**修正方針**: ステップ定義内のCucumber式で `/` を使っている箇所を全て `\/` にエスケープするか、正規表現リテラル (`/.../`) に切り替える。

エラー箇所の例:
- `/{boardId}/{threadKey}/ にリダイレクトされる` → `\/` にエスケープ
- `ユーザーが / にアクセスする` → `\/` にエスケープ

**作業手順**:
1. thread.steps.ts と specialist_browser_compat.steps.ts の全Cucumber式を確認
2. `/` を含む全式を修正（`\/` エスケープまたは正規表現リテラルに変更）
3. `npx cucumber-js --tags @url_structure` で5シナリオPASS確認
4. `npx cucumber-js --tags @pagination` で7シナリオPASS確認（pending除く）
5. `npx cucumber-js --tags "@anchor_popup or @post_number_display"` でpending確認
6. `npx cucumber-js` 全体でfailure 0確認

### 進捗ログ
- [開始] featureファイル・既存ステップ定義・BDDテスト戦略書を確認
- [確認] UNDEFINEDステップ: 19シナリオ (url_structure 5件, pagination 7件, anchor_popup 4件, post_number_display 3件) + specialist_browser_compat 2件
- [実装] thread.steps.ts +868行、specialist_browser_compat.steps.ts修正、post-repository.ts修正
- [中断] コンテキスト切れで中断。テスト未実行
- [再開] オーケストレーターがCucumberExpression構文エラーを検出。修正方針を提供
- [再開2] 2nd ワーカーがチェックポイントから作業再開
- [調査] テスト実行で実際のエラーを確認。CucumberExpression構文エラーは前回ワーカーのLinter自動修正で解消済み。残る問題は2点:
  - (1) @anchor_popup: "スレッドに3件のレスが存在する"(固定文字列) と "スレッドに{int}件のレスが存在する"(パラメータ付き) のambiguous
  - (2) @anchor_popup/@post_number_display: pending用ステップの引数不一致（Linterで自動修正済み）
- [修正] thread.steps.ts L1856: "スレッドに3件のレスが存在する" の固定文字列ステップ定義を削除し、"{int}件" 版に統合。ambiguous解消
- [確認] 全完了条件を達成（3rdワーカーで最終確認済み）

### テスト結果サマリー
- `npx cucumber-js --tags @url_structure`: 5 scenarios (5 passed), 14 steps (14 passed)
- `npx cucumber-js --tags @pagination`: 7 scenarios (2 pending, 5 passed), 26 steps (2 pending, 24 passed)
- `npx cucumber-js --tags "@anchor_popup or @post_number_display"`: 7 scenarios (7 pending), 27 steps (7 pending, 19 skipped, 1 passed)
- `npx cucumber-js` (全体): 252 scenarios (16 pending, 236 passed), 1315 steps (16 pending, 37 skipped, 1262 passed) — failure 0
