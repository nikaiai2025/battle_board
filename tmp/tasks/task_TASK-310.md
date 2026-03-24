---
task_id: TASK-310
sprint_id: Sprint-114
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-25T10:00:00+09:00
updated_at: 2026-03-25T10:00:00+09:00
locked_files:
  - features/step_definitions/theme.steps.ts
  - src/app/api/mypage/route.ts
  - src/lib/services/mypage-service.ts
  - src/app/(web)/layout.tsx
  - src/__tests__/lib/domain/rules/theme-rules.test.ts
---

## タスク概要

有料→無料ダウングレード時にテーマ・フォントがデフォルトにロールバックしない問題を修正する。
BDDテストの誤ったテストデータも同時に修正する。

## 問題詳細

### 問題A: BDDテスト失敗（テストデータ誤り）

`features/step_definitions/theme.steps.ts` の2箇所で `mincho` を有料フォントとして使用しているが、
`FONT_CATALOG` では `mincho` は `isFree: true`（システムフォント）。

1. **L375** `validateThemeSelection("default", "mincho", false)` → `valid: true` を返す（期待は `false`）
   - 修正: `"mincho"` を有料フォント（例: `"noto-sans-jp"`）に変更

2. **L176** `ThemeService.updateTheme(userId, "ocean", "mincho")` → 有料テーマ+無料フォントの組み合わせ
   - シナリオ名「有料テーマと有料フォントを設定中」と矛盾
   - 修正: `"mincho"` を有料フォント（例: `"noto-sans-jp"`）に変更

### 問題B: 本番テーマロールバック未実行

**現状のフロー:**
1. `layout.tsx` が Cookie `bb-theme`/`bb-font` を読んで `resolveTheme(themeId, true)` を呼ぶ
2. `isPremium` は常に `true`（Cookieから判定不可のため）
3. → ダウングレード後もCookieの有料テーマがそのまま表示される

**設計意図（layout.tsxのコメント）:**
> 有料→無料のダウングレード時は GET /api/mypage が解決済みIDを返し、
> フロントが Cookie を更新するフローで整合性を保つ。

**未実装箇所:** GET /api/mypage のレスポンスでCookieを同期する仕組みがない。

**修正方針:**
GET /api/mypage レスポンスに `Set-Cookie` ヘッダーを追加し、`resolveTheme`/`resolveFont` 適用後のIDでCookieを更新する。これにより、マイページにアクセスした時点でCookieが自動的にフォールバック済みの値に同期される。

## 対象BDDシナリオ

- `features/theme.feature` — 「無料ユーザーには有料フォントがロック表示される」（L97）
- `features/theme.feature` — 「有料設定中のユーザーが無料に戻るとデフォルトに戻る」（L130）

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/domain/rules/theme-rules.ts` — resolveTheme/resolveFont/validateThemeSelection
2. [必須] `src/lib/domain/models/theme.ts` — THEME_CATALOG, FONT_CATALOG（isFreeフラグ確認）
3. [必須] `features/step_definitions/theme.steps.ts` — 修正対象ステップ定義
4. [必須] `src/app/api/mypage/route.ts` — GET /api/mypage のレスポンス処理
5. [必須] `src/lib/services/mypage-service.ts` — getMypage() のテーマ解決ロジック
6. [参考] `src/app/(web)/layout.tsx` — SSRテーマ適用（isPremium=true の意図を理解）
7. [参考] `src/app/api/mypage/theme/route.ts` — PUT時のCookie設定方法を参考に

## 出力（生成・変更すべきファイル）

- `features/step_definitions/theme.steps.ts` — テストデータ修正（mincho→noto-sans-jp等）
- `src/app/api/mypage/route.ts` — GETレスポンスにSet-Cookie追加（テーマ/フォント同期）
- 関連する単体テスト — 必要に応じて追加・修正

## 完了条件

- [ ] `npx cucumber-js --tags "@theme"` で以前失敗していた2シナリオがPASS
- [ ] `npx vitest run` でリグレッションなし
- [ ] GET /api/mypage のレスポンスでテーマ/フォントCookieが同期される

## スコープ外

- `features/theme.feature` ファイル自体の変更
- テーマカタログ（THEME_CATALOG/FONT_CATALOG）の変更
- resolveTheme/resolveFont ロジック自体の変更（正しく実装済み）
- layout.tsx の isPremium=true ロジックの変更（設計意図通り。Cookie同期で解決）

## 補足・制約

- `PUT /api/mypage/theme/route.ts` のCookie設定コード（L89-103）を参考に、GETレスポンスでも同じ形式でCookieを設定すること
- Cookie設定: `bb-theme={themeId}; Path=/; SameSite=Lax; Max-Age=31536000` 形式
- mypage-service.ts の getMypage() が返す themeId/fontId は既にフォールバック適用済み（resolveTheme/resolveFont 通過後）なので、その値をそのままCookieに設定すればよい

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 問題A（BDDテストデータ修正）、問題B（GET /api/mypage Set-Cookie追加）、単体テスト追加
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 必読ドキュメント全件読み込み完了
- FONT_CATALOGで mincho は isFree:true（システムフォント）であることを確認
- noto-sans-jp は isFree:false（有料Webフォント）であることを確認
- ステップ定義中の mincho 使用箇所: L146, L176, L227, L362, L391 の5箇所を特定
- 問題A: theme.steps.ts の mincho → noto-sans-jp 修正（5箇所）完了
- 問題B: src/app/api/mypage/route.ts に Set-Cookie ヘッダー追加完了
- 単体テスト: src/__tests__/app/api/mypage/route.test.ts 新規作成（8テスト）

### テスト結果サマリー

**単体テスト (vitest run):**
- 92ファイル中91 PASS / 1 FAIL（registration-service.test.ts: Supabase URL環境変数関連 -- 既存問題、本タスク外）
- 1794テスト中1790 PASS / 4 FAIL（同上）
- 新規テスト route.test.ts: 8/8 PASS

**BDDテスト (cucumber-js):**
- 344シナリオ中324 PASS / 4 FAIL / 16 pending
- 失敗4件は全て user_registration.feature のログイン関連（本タスク外）
- theme.feature の全13シナリオ: PASS（以前失敗していた2シナリオ含む）
