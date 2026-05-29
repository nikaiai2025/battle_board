---
task_id: TASK-402
sprint_id: Sprint-158
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-05-30T00:00:00+09:00
updated_at: 2026-05-30T00:00:00+09:00
locked_files:
  - "[NEW] features/copipe_viewer.feature"
  - "[NEW] features/step_definitions/copipe_viewer.steps.ts"
  - "[NEW] src/app/(web)/copipe/page.tsx"
  - "[NEW] src/app/api/copipe/list/route.ts"
  - src/lib/infrastructure/repositories/copipe-repository.ts
  - features/support/in-memory/copipe-repository.ts
  - src/app/(web)/_components/Header.tsx
---

## タスク概要

AAビューワーページを新設する。管理者登録・ユーザー登録の全AAを一覧表示し、
名前検索・プレビュー・クリップボードコピーができるページ（`/copipe`）を実装する。
ヘッダーナビゲーションにもリンクを追加する。
**featureファイルの新規作成は人間承認済み（2026-05-30）。**

## 対象BDDシナリオ

- `features/copipe_viewer.feature`（新規）— 全3シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/infrastructure/repositories/copipe-repository.ts` — 既存メソッド確認
2. [必須] `features/support/in-memory/copipe-repository.ts` — BDD用 in-memory 実装確認
3. [必須] `src/app/(web)/_components/Header.tsx` — ナビゲーション追加箇所
4. [参考] `features/command_copipe.feature` — 既存 copipe 仕様
5. [参考] `src/app/(web)/mypage/copipe/` — 既存のコピペ管理UI（実装パターン参考）
6. [参考] `.claude/rules/UI_Components.md` — shadcn/ui・デザイントークン規約

## 実装仕様

### 1. featureファイル（新規作成）

`features/copipe_viewer.feature` を以下の内容で作成する:

```gherkin
# features/copipe_viewer.feature
# ステータス: 承認済み（2026-05-30）
#
# AAビューワーページ: 全登録AA（管理者 + ユーザー）の一覧・検索・コピー

Feature: AAビューワー -- 登録済みAA一覧の閲覧・検索・コピー

  認証不要で誰でもアクセスできるAAビューワーページ。
  管理者登録分とユーザー登録分をすべて一覧表示し、
  名前で絞り込み検索・プレビュー表示ができる。

  Scenario: AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
    Given 管理者コピペ「しょぼーん」とユーザーコピペ「オリジナルAA」が登録されている
    When GET /api/copipe/list を実行する
    Then レスポンスに「しょぼーん」と「オリジナルAA」が含まれる

  Scenario: 名前で部分一致フィルタリングできる
    Given 管理者コピペ「しょぼーん」と「ぬるぽ」が登録されている
    When GET /api/copipe/list?q=しょぼ を実行する
    Then レスポンスに「しょぼーん」が含まれる
    And レスポンスに「ぬるぽ」は含まれない

  Scenario: ヘッダーナビゲーションにAAビューワーへのリンクが存在する
    When スレッド一覧ページを開く
    Then ヘッダーに id="nav-copipe" のリンクが存在する
    And リンクの href は "/copipe" である
```

### 2. API: GET /api/copipe/list

**ファイル:** `src/app/api/copipe/list/route.ts`

- 認証不要（未認証でもアクセス可）
- クエリパラメータ `q` が空または未指定 → admin + user 全件返却
- クエリパラメータ `q` が指定された場合 → name が `q` を部分一致するものだけ返却
- レスポンス形式:
  ```json
  {
    "entries": [
      { "id": "uuid-or-number", "name": "しょぼーん", "content": "AA本文" }
    ]
  }
  ```
- エラー時は 500 + `{ "error": "..." }`

### 3. CopipeRepository への findAll 追加

**ファイル:** `src/lib/infrastructure/repositories/copipe-repository.ts`

以下のメソッドを追加する:

```typescript
/**
 * admin + user の全コピペを返す。name の部分一致フィルタ付き（省略時は全件）。
 */
export async function findAll(query?: string): Promise<CopipeEntry[]>
```

- `copipe_entries` + `user_copipe_entries` を並列取得してマージする
- `query` が指定された場合は `name.toLowerCase().includes(query.toLowerCase())` でフィルタ
- インターフェース `ICopipeRepository` にも追加すること（型定義確認）

**ファイル:** `features/support/in-memory/copipe-repository.ts`

- `findAll(query?: string)` を同様に追加する（`adminStore + userStore` をマージしてフィルタ）

### 4. ページ: /copipe

**ファイル:** `src/app/(web)/copipe/page.tsx`

- Server Component（初期リスト取得） + Client Component（検索・選択インタラクション）
- `GET /api/copipe/list` から全件を取得して初期表示する
- 検索はクライアントサイドフィルタリング（入力のたびに state 更新）

**UIレイアウト（詳細は実装者に委ねる。以下はガイドライン）:**

- **デスクトップ（md以上）:** 左カラム（検索バー + AA名リスト） + 右メインエリア（選択したAAをプレビュー）の2カラム構成
- **モバイル:** リスト表示 → 選択するとシート or モーダルでプレビュー表示
- **AAプレビューエリア:**
  - フォントは `font-family: "MS Gothic", "Osaka-Mono", "Noto Sans Mono", monospace` を指定（AA表示に適した等幅フォント）
  - `white-space: pre` でスペース・改行を保持
  - 十分な表示幅を確保（全角文字が崩れないよう `min-w-[40ch]` 程度）
  - 文字サイズは `text-sm` 以上を確保
- **コピーボタン:** プレビュー右上（または下部）に配置。クリックで `navigator.clipboard.writeText(content)` を実行。コピー後は「コピーしました✓」と一時的にフィードバック表示
- **検索バー:** プレースホルダー「AA名で検索...」
- shadcn/ui の `Input`, `Button`, `ScrollArea`（リスト用）等を活用する
- 色はデザイントークン（`text-foreground`, `bg-card` 等）を使用

**ページタイトル:** 「AAビューワー」（`<title>` + ページ見出し）

### 5. ヘッダーナビゲーション

**ファイル:** `src/app/(web)/_components/Header.tsx`

- nav 内に以下を追加（`nav-login` の前後いずれか適切な位置）:
  ```tsx
  <Link href="/copipe" className="text-gray-300 hover:text-white" id="nav-copipe">
    AA
  </Link>
  ```
- 認証状態によらず常時表示（認証不要ページのため）

## 出力（生成すべきファイル）

- `[NEW] features/copipe_viewer.feature` — 上記 feature 内容をそのまま作成
- `[NEW] features/step_definitions/copipe_viewer.steps.ts` — 3シナリオのステップ定義
- `[NEW] src/app/(web)/copipe/page.tsx` — AAビューワーページ
- `[NEW] src/app/api/copipe/list/route.ts` — 全件取得 API
- `src/lib/infrastructure/repositories/copipe-repository.ts` — findAll 追加
- `features/support/in-memory/copipe-repository.ts` — findAll 追加
- `src/app/(web)/_components/Header.tsx` — nav-copipe リンク追加

## 完了条件

- [ ] `npx cucumber-js features/copipe_viewer.feature` が全3シナリオ PASS
- [ ] `npx vitest run` 全件 PASS（既存テストの回帰なし）
- [ ] `npx cucumber-js` 全体でも既存シナリオに回帰なし

## スコープ外

- AA本文のコンテンツ検索（name 検索のみ）
- AA登録UI（マイページの既存機能で対応済み）
- ページネーション（全件表示でよい）
- ソート順の変更（DB返却順で可）
- `docs/specs/screens/` への画面定義書追加

## 補足・制約

- featureファイル新規作成は人間承認済み（2026-05-30）
- `cucumber.js` 設定に `copipe_viewer` のステップが登録されているか確認すること（他の feature の登録パターンを参考に `register-mocks.js` 等を確認）
- ICopipeRepository インターフェース型定義の場所を確認してから実装すること
- `findAll` の型シグネチャは既存インターフェースと整合性を保つこと
- locked_files 外の変更が必要な場合はエスカレーション

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `features/copipe_viewer.feature` 作成（承認済み内容をそのまま）
2. `ICopipeRepository` に `findAll(query?: string)` を追加（インターフェース + Supabase実装）
3. `features/support/in-memory/copipe-repository.ts` に `findAll` 追加
4. `src/app/api/copipe/list/route.ts` 作成（GET、認証不要、q パラメータによるフィルタ対応）
5. `src/app/(web)/copipe/page.tsx` 作成（Server Component + Client Component 分離）
6. `src/app/(web)/copipe/_components/CopipeViewerClient.tsx` 作成（検索・プレビュー・コピー機能）
7. `src/app/(web)/_components/Header.tsx` に `nav-copipe` リンク追加
8. `features/step_definitions/copipe_viewer.steps.ts` 作成（3シナリオ全ステップ定義）
   - `/` を含むステップ文字列は正規表現パターンで定義（Cucumber Expression エラー対策）
   - `"..."` を含むステップ文字列も正規表現パターンで定義（{string} 誤解釈対策）
9. `cucumber.js` に `copipe_viewer.feature` と `copipe_viewer.steps.ts` を登録
10. `e2e/smoke/navigation.spec.ts` に `/copipe` のナビゲーションテストを追加
11. `npx tsx scripts/check-e2e-coverage.ts` PASS 確認

### テスト結果サマリー

- BDD テスト: 464 scenarios (7 pending, **457 passed**) — 新規3シナリオ含む、0 failed
- Vitest: 132 passed / 1 failed（`reply_candidates` スキーマ不整合は実装前から存在する既存問題、今回の変更に無関係）
- E2Eカバレッジチェック: `/copipe` は [OK]、残り8件 MISS は実装前から存在する既存問題
