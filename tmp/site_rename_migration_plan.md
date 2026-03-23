# サイト名変更 実施計画書

## 1. 概要

サイト名を「BattleBoard」から「ボットちゃんねる」に変更する。
リポジトリ名・ディレクトリ名・内部クラス名は変更しない。

### 名称対応表

| 概念 | 旧 | 新 | 用途 |
|------|-----|-----|------|
| サイト名 | `BattleBoard` | `ボットちゃんねる` | HTML title、ヘッダー、bbsmenu カテゴリ名 |
| 板名 | `BattleBoard総合` | `なんでも実況B（ボット）` | bbsmenu board_name、SETTING.TXT BBS_TITLE |
| 板ID | `battleboard` | `livebot` | URLパス `/{boardId}/`、DB board_id |
| ドメイン | `battle-board.shika.workers.dev` | **未定** | ベースURL、wrangler.toml |

### 旧名称メモ（作業AI向け）

旧サイト名は「BattleBoard」、旧板IDは `battleboard`。
コードベース・DB・テストデータに旧名称が残っている場合は本計画に従い新名称に統一する。
リポジトリ名 `battle_board`、内部クラス名 `BattleBoardWorld` 等は変更対象外。

---

## 2. Phase 1: 板ID定数化リファクタリング

**目的:** ハードコードされた板ID文字列 `"battleboard"` を定数参照に置換する。値は変更しない。

**完了条件:** 全テスト（`npx vitest run` + `npx cucumber-js`）がパスすること。

### 2.1 定数ファイル作成

`src/lib/domain/constants.ts` を新規作成する。

```typescript
/**
 * デフォルト板ID。
 *
 * 板IDが未指定・不正のとき、およびシステム内で暗黙的に使用する板の識別子。
 * URLパス /{boardId}/ に対応する。将来的に複数板をサポートする場合も
 * 「デフォルト板」の概念は維持される。
 *
 * 制約: /^[a-z0-9_]+$/ （validation.ts BOARD_ID_PATTERN）
 */
export const DEFAULT_BOARD_ID = "battleboard";
```

### 2.2 プロダクションコードの置換

以下のファイルで `"battleboard"` リテラルを `DEFAULT_BOARD_ID` の import に置換する。

| # | ファイル | 現在の記述 | 置換方針 |
|---|---------|-----------|---------|
| 1 | `src/app/(web)/page.tsx` | `redirect("/battleboard/")` | `` redirect(`/${DEFAULT_BOARD_ID}/`) `` |
| 2 | `src/app/(web)/_components/ThreadCreateForm.tsx` | `boardId = "battleboard"` | `boardId = DEFAULT_BOARD_ID` |
| 3 | `src/app/api/threads/route.ts` | `"battleboard"` (3箇所) | `DEFAULT_BOARD_ID` |
| 4 | `src/lib/services/post-service.ts` | `"battleboard"` (3箇所) | `DEFAULT_BOARD_ID` |
| 5 | `src/lib/services/bot-service.ts` | `BOT_DEFAULT_BOARD_ID = "battleboard"` | ローカル定数を削除し `DEFAULT_BOARD_ID` を import |
| 6 | `src/app/(senbra)/test/bbs.cgi/route.ts` | `"battleboard"` (3箇所) | `DEFAULT_BOARD_ID` |
| 7 | `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` | マップキー `battleboard` | `[DEFAULT_BOARD_ID]: { ... }` |
| 8 | `src/app/(senbra)/bbsmenu.json/route.ts` | `directory_name: "battleboard"`, URL内 | `DEFAULT_BOARD_ID` |
| 9 | `src/app/(senbra)/bbsmenu.html/route.ts` | URL内 `/battleboard/` | テンプレートリテラルで `DEFAULT_BOARD_ID` を埋め込み |
| 10 | `scripts/upsert-pinned-thread.ts` | `PINNED_THREAD_BOARD_ID = "battleboard"`, URL内 | `DEFAULT_BOARD_ID` を import（URL内の板IDパスも同様） |
| 11 | `scripts/check-e2e-coverage.ts` | `"/battleboard"` | `DEFAULT_BOARD_ID` |

### 2.3 テストコードの置換

テストコードの `boardId: "battleboard"` は Phase 1 では**変更しない**（テストデータとして独立した値であり、リファクタリング対象外）。Phase 2 で板IDの値を変えるとき一括置換する。

### 2.4 確認

```bash
npx vitest run
npx cucumber-js
```

全テストパスで Phase 1 完了。

---

## 3. Phase 2: サイト名・板ID・板名の変更

**目的:** 外部に見える名称を全て新名称に変更する。

**前提条件:**
- Phase 1 完了済み
- `.feature` ファイルの変更について人間の承認済み（エスカレーション対象）

### 3.1 定数値の変更

`src/lib/domain/constants.ts`:

```typescript
export const DEFAULT_BOARD_ID = "livebot";
```

この1行で Phase 1 で置換した全箇所（11ファイル ~20箇所）が追従する。

### 3.2 サイト名の変更（grep + 置換）

`"BattleBoard"` → `"ボットちゃんねる"` を以下のファイルで実施する。

| # | ファイル | 箇所 | 旧 → 新 |
|---|---------|------|---------|
| 1 | `src/app/layout.tsx` | `metadata.title` | `"BattleBoard"` → `"ボットちゃんねる"` |
| 2 | `src/app/(web)/_components/Header.tsx` | サイトタイトルテキスト | 同上 |
| 3 | `src/app/(web)/[boardId]/page.tsx` | ページ見出し | `BattleBoard — スレッド一覧` → `ボットちゃんねる — スレッド一覧` 等 |
| 4 | `src/app/(admin-public)/admin/login/page.tsx` | タイトル | `BattleBoard 管理者ログイン` → `ボットちゃんねる 管理者ログイン` |
| 5 | `src/app/(web)/admin/layout.tsx` | ヘッダー | `BattleBoard Admin` → `ボットちゃんねる 管理` |
| 6 | `src/app/(dev)/dev/page.tsx` | 開発ボード内テキスト (5箇所) | 文脈に応じて置換 |
| 7 | `src/app/(senbra)/bbsmenu.json/route.ts` | `category_name` | `"BattleBoard"` → `"ボットちゃんねる"` |
| 8 | `src/app/(senbra)/bbsmenu.html/route.ts` | HTMLタイトル、カテゴリ名 | 同上 |
| 9 | `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` | `DEFAULT_BOARD_SETTINGS.title` | `"BattleBoard"` → `"ボットちゃんねる"` |

### 3.3 板名の変更

`"BattleBoard総合"` → `"なんでも実況B（ボット）"` を以下で実施する。

| # | ファイル | 箇所 |
|---|---------|------|
| 1 | `src/app/(senbra)/bbsmenu.json/route.ts` | `board_name` |
| 2 | `src/app/(senbra)/bbsmenu.html/route.ts` | リンクテキスト |
| 3 | `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` | `BOARD_SETTINGS` の `title` |

### 3.4 固定コンテンツの変更

| # | ファイル | 箇所 | 旧 → 新 |
|---|---------|------|---------|
| 1 | `scripts/upsert-pinned-thread.ts` | `PINNED_THREAD_TITLE` | `"■ BattleBoard 案内板"` → `"■ ボットちゃんねる 案内板"` |
| 2 | `scripts/upsert-pinned-thread.ts` | 本文内タイトル | 同上 |

### 3.5 テストコードの一括置換

```
"battleboard" → "livebot"        （板ID。テスト全ファイル grep + 一括置換）
"BattleBoard" → "ボットちゃんねる"   （表示名。テスト内のアサーション）
"BattleBoard総合" → "なんでも実況B（ボット）"（板名）
```

対象ファイル数: 約50ファイル（機械的置換）。

注意: `BattleBoardWorld` 等の内部クラス名は**変更しない**。

### 3.6 .feature ファイルの変更（要エスカレーション）

以下の .feature ファイルに旧名称が含まれる。変更には人間の承認が必要。

| ファイル | 変更内容 |
|---------|---------|
| `features/thread.feature` | `/battleboard/` → `/livebot/`、`■ BattleBoard 案内板` → `■ ボットちゃんねる 案内板` |
| `features/specialist_browser_compat.feature` | `/battleboard/` → `/livebot/`、`BattleBoard` → `ボットちゃんねる` |
| `features/mypage.feature` | `"BattleBoard"` → `"ボットちゃんねる"` |
| `features/welcome.feature` | `BattleBoard` → `ボットちゃんねる` |
| `features/command_system.feature` | `BattleBoard` → `ボットちゃんねる` |

### 3.7 ドキュメントの変更

| 区分 | ファイル群 | 内容 |
|------|-----------|------|
| 仕様書 | `docs/specs/openapi.yaml`, `docs/specs/screens/thread-list.yaml` | API タイトル・例示の名称 |
| 用語辞書 | `docs/requirements/ubiquitous_language.yaml` | 「板」定義内の名称 |
| 要件定義 | `docs/requirements/requirements.md`, `docs/requirements/user_stories.md` | 文中のサイト名（**要承認**） |
| 設計書 | `docs/architecture/architecture.md` 他 | 文中のサイト名 |
| 運用 | `docs/operations/runbooks/` 内 4ファイル | URL例 |
| 調査資料 | `docs/research/` 内 6ファイル | ヒストリカル資料（変更任意） |

### 3.8 環境変数

| ファイル | 箇所 | 変更 |
|---------|------|------|
| `.env.prod` | `PROD_ADMIN_EMAIL` | `@battleboard.prod.com` → 新ドメイン（ドメイン確定後でも可） |

### 3.9 DB移行

```sql
BEGIN;
UPDATE threads SET board_id = 'livebot' WHERE board_id = 'battleboard';
-- posts テーブルに board_id カラムがある場合は同様に UPDATE
COMMIT;
```

固定スレッドのタイトル更新:
```sql
UPDATE threads
SET title = '■ ボットちゃんねる 案内板'
WHERE title = '■ BattleBoard 案内板';
```

その後 `scripts/upsert-pinned-thread.ts` を実行し、本文を再生成する。

### 3.10 確認

```bash
npx vitest run
npx cucumber-js
```

全テストパス + 本番デプロイ後に目視確認（Web + 専ブラ）。

---

## 4. Phase 3: ドメイン・URL変更（ドメイン確定後）

ドメインが決まった時点で実施する。Phase 2 とは独立して実行可能。

### 4.1 コード内フォールバックURL（3箇所）

| ファイル | 現在値 |
|---------|--------|
| `src/app/(senbra)/bbsmenu.json/route.ts` | `"https://battleboard.vercel.app"` |
| `src/app/(senbra)/bbsmenu.html/route.ts` | `"https://battleboard.vercel.app"` |
| `src/app/(senbra)/test/bbs.cgi/route.ts` | `"https://battleboard.vercel.app"` |

→ 新ドメインに置換。または `NEXT_PUBLIC_BASE_URL` 必須化でフォールバック自体を廃止。

### 4.2 インフラ設定

| 対象 | 現在値 | 変更 |
|------|--------|------|
| `wrangler.toml` name | `"battle-board"` | 新Worker名 |
| `wrangler.toml` service | `"battle-board"` | 同上 |
| `wrangler.toml` NEXT_PUBLIC_BASE_URL | `"https://battle-board.shika.workers.dev"` | 新ドメイン |
| `.env.prod` / `.env.prod.example` | `PROD_BASE_URL=https://battle-board.shika.workers.dev` | 新ドメイン |
| `playwright.prod.config.ts` | フォールバックURL | 新ドメイン |
| `scripts/upsert-pinned-thread.ts` | リンク集のURL | 新ドメイン |

### 4.3 外部サービス（コード外）

| サービス | 作業 |
|---------|------|
| Cloudflare Workers | 新Worker名でデプロイ or カスタムドメイン設定 |
| Cloudflare Turnstile | 許可ドメインに新ドメインを追加 |
| Vercel | プロジェクトドメイン設定更新（使用する場合） |
| GitHub Actions | シークレット `PROD_BASE_URL` 更新 |

---

## 5. タスク分割案（オーケストレーター向け）

| タスク | Phase | 依存 | エスカレーション |
|--------|-------|------|----------------|
| 板ID定数化リファクタリング | 1 | なし | 不要 |
| サイト名・板ID・板名変更（コード） | 2 (§3.1〜3.4) | Phase 1完了 | 不要 |
| テストコード一括置換 | 2 (§3.5) | Phase 1完了 | 不要 |
| .feature ファイル変更 | 2 (§3.6) | 人間の承認 | **要** |
| ドキュメント更新 | 2 (§3.7) | Phase 1完了 | 要件定義書は**要承認** |
| DB移行 + 固定スレッド再生成 | 2 (§3.9) | コード変更デプロイ後 | 不要 |
| ドメイン・URL変更 | 3 | ドメイン確定 | 不要 |
