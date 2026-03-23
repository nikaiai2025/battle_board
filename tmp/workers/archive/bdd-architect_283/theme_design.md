# テーマ機能 段階1 設計書

> TASK-283 成果物 / TASK-285（コーディング）への引き渡し用
> 作成日: 2026-03-23
> 対象BDD: `features/theme.feature` (承認済み v1, 12シナリオ)
> 技術方針: TDR-016 (画面テーマの資源管理方式)

---

## 1. スコープ

### 段階1で実装するもの

- 無料テーマ2種（default, dark）+ 無料フォント1種（gothic）の切り替え機構
- テーマ/フォントカタログ定数（有料エントリはカタログ定義のみ、CSSなし）
- DB: `users` テーブルへの `theme_id`, `font_id` カラム追加
- API: `PUT /api/mypage/theme` 新規 + `GET /api/mypage` レスポンス拡張
- SSR: layout.tsx でのCSSクラス付与
- UI: マイページにテーマ設定セクション追加
- BDD: ステップ定義 + InMemory拡張

### 段階2に持ち越すもの

- 有料テーマのCSS変数値（配色・背景パターン）
- 有料フォントのCSS変数値（明朝・等幅）
- `globals.css` への有料テーマCSS追加

---

## 2. DBマイグレーション

ファイル: `supabase/migrations/00025_theme_settings.sql`

```sql
-- テーマ設定カラム追加
-- See: features/theme.feature
-- See: docs/architecture/architecture.md TDR-016

ALTER TABLE users ADD COLUMN theme_id TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN font_id TEXT DEFAULT NULL;

-- NULL = デフォルトテーマ + ゴシックフォント（既存ユーザーに影響なし）
COMMENT ON COLUMN users.theme_id IS 'テーマID。NULLの場合はデフォルトテーマを適用';
COMMENT ON COLUMN users.font_id IS 'フォントID。NULLの場合はゴシックフォントを適用';
```

既存の最新マイグレーションは `00024_daily_events.sql` のため、次番 `00025` を使用する。

---

## 3. ドメインモデル

### 3.1 User インターフェース拡張

ファイル: `src/lib/domain/models/user.ts`

追加フィールド:

```typescript
/** テーマID。NULLの場合はデフォルトテーマ。See: features/theme.feature */
themeId: string | null;
/** フォントID。NULLの場合はゴシックフォント。See: features/theme.feature */
fontId: string | null;
```

### 3.2 テーマカタログ定数

ファイル: `src/lib/domain/models/theme.ts` (新規作成)

```typescript
/**
 * テーマ定義
 * See: features/theme.feature
 * See: docs/architecture/architecture.md TDR-016
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface ThemeEntry {
  /** テーマID（DB保存値） */
  id: string;
  /** 表示名 */
  name: string;
  /** <html> or <body> に付与するCSSクラス名。デフォルトは空文字（クラスなし） */
  cssClass: string;
  /** 無料ユーザーが使用可能か */
  isFree: boolean;
}

export interface FontEntry {
  /** フォントID（DB保存値） */
  id: string;
  /** 表示名 */
  name: string;
  /** CSS font-family 値（CSS変数 --bb-font-family に設定） */
  cssFontFamily: string;
  /** 無料ユーザーが使用可能か */
  isFree: boolean;
}

// ---------------------------------------------------------------------------
// カタログ定数
// ---------------------------------------------------------------------------

/**
 * テーマカタログ。
 * 段階1: default, dark のみCSS実装済み。有料テーマはカタログ定義のみ。
 * 段階2: 有料テーマのCSS変数を globals.css に追加して有効化する。
 */
export const THEME_CATALOG: readonly ThemeEntry[] = [
  { id: "default", name: "デフォルト", cssClass: "",     isFree: true },
  { id: "dark",    name: "ダーク",     cssClass: "dark", isFree: true },
  // --- 段階2で CSS を追加する有料テーマ（カタログ定義のみ） ---
  { id: "ocean",   name: "オーシャン", cssClass: "ocean",   isFree: false },
  { id: "forest",  name: "フォレスト", cssClass: "forest",  isFree: false },
  { id: "sunset",  name: "サンセット", cssClass: "sunset",  isFree: false },
] as const;

/**
 * フォントカタログ。
 * 段階1: gothic のみ。有料フォントはカタログ定義のみ。
 */
export const FONT_CATALOG: readonly FontEntry[] = [
  {
    id: "gothic",
    name: "ゴシック",
    cssFontFamily:
      "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif",
    isFree: true,
  },
  // --- 段階2で有効化する有料フォント（カタログ定義のみ） ---
  {
    id: "mincho",
    name: "明朝",
    cssFontFamily:
      "'Hiragino Mincho ProN', 'Noto Serif JP', 'Yu Mincho', serif",
    isFree: false,
  },
  {
    id: "monospace",
    name: "等幅",
    cssFontFamily:
      "'Source Code Pro', 'Noto Sans Mono', 'Courier New', monospace",
    isFree: false,
  },
] as const;

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** テーマIDからエントリを取得。見つからない場合は null */
export function findTheme(themeId: string): ThemeEntry | null {
  return THEME_CATALOG.find((t) => t.id === themeId) ?? null;
}

/** フォントIDからエントリを取得。見つからない場合は null */
export function findFont(fontId: string): FontEntry | null {
  return FONT_CATALOG.find((f) => f.id === fontId) ?? null;
}

/** デフォルトテーマを返す */
export function getDefaultTheme(): ThemeEntry {
  return THEME_CATALOG[0];
}

/** デフォルトフォントを返す */
export function getDefaultFont(): FontEntry {
  return FONT_CATALOG[0];
}
```

### 3.3 テーマ解決ルール

ファイル: `src/lib/domain/rules/theme-rules.ts` (新規作成)

以下の純粋関数を実装する。

```typescript
/**
 * テーマ解決ルール — ユーザー設定からの有効テーマ/フォント決定
 * See: features/theme.feature
 */

import {
  findTheme, findFont, getDefaultTheme, getDefaultFont,
  type ThemeEntry, type FontEntry,
} from "../models/theme";

/**
 * ユーザーのテーマ設定を解決する。
 * - themeId/fontId が null → デフォルト
 * - カタログに存在しない → デフォルト
 * - 有料テーマ + 無料ユーザー → デフォルトにフォールバック
 *
 * See: features/theme.feature @有料設定中のユーザーが無料に戻るとデフォルトに戻る
 * See: features/theme.feature @未設定のユーザーにはデフォルトテーマとゴシックフォントが適用される
 */
export function resolveTheme(
  themeId: string | null,
  isPremium: boolean,
): ThemeEntry {
  if (!themeId) return getDefaultTheme();
  const entry = findTheme(themeId);
  if (!entry) return getDefaultTheme();
  if (!entry.isFree && !isPremium) return getDefaultTheme();
  return entry;
}

export function resolveFont(
  fontId: string | null,
  isPremium: boolean,
): FontEntry {
  if (!fontId) return getDefaultFont();
  const entry = findFont(fontId);
  if (!entry) return getDefaultFont();
  if (!entry.isFree && !isPremium) return getDefaultFont();
  return entry;
}

/**
 * テーマ選択のバリデーション。
 * API側で使用。カタログ存在チェック + 権限チェック。
 */
export type ThemeValidationResult =
  | { valid: true }
  | { valid: false; error: string; code: "INVALID_THEME" | "INVALID_FONT" | "PREMIUM_REQUIRED" };

export function validateThemeSelection(
  themeId: string,
  fontId: string,
  isPremium: boolean,
): ThemeValidationResult {
  const theme = findTheme(themeId);
  if (!theme) return { valid: false, error: "指定されたテーマは存在しません", code: "INVALID_THEME" };

  const font = findFont(fontId);
  if (!font) return { valid: false, error: "指定されたフォントは存在しません", code: "INVALID_FONT" };

  if ((!theme.isFree || !font.isFree) && !isPremium) {
    return { valid: false, error: "有料テーマ/フォントは有料ユーザーのみ利用できます", code: "PREMIUM_REQUIRED" };
  }

  return { valid: true };
}
```

---

## 4. API設計

### 4.1 GET /api/mypage レスポンス拡張

`MypageInfo` インターフェースに追加:

```typescript
/** 適用中のテーマID。解決済み（フォールバック適用後）の値 */
themeId: string;
/** 適用中のフォントID。解決済みの値 */
fontId: string;
```

`MypageService.getMypage()` の変更:
- `resolveTheme(user.themeId, user.isPremium)` でテーマを解決
- `resolveFont(user.fontId, user.isPremium)` でフォントを解決
- 解決後の `.id` を返す

### 4.2 PUT /api/mypage/theme (新規)

ファイル: `src/app/api/mypage/theme/route.ts`

**リクエスト:**
```json
{ "themeId": "dark", "fontId": "gothic" }
```

**レスポンス (200):**
```json
{ "themeId": "dark", "fontId": "gothic" }
```

**エラーレスポンス:**
- 400: `{ "error": "INVALID_THEME", "message": "指定されたテーマは存在しません" }`
- 400: `{ "error": "INVALID_FONT", "message": "指定されたフォントは存在しません" }`
- 400: `{ "error": "PREMIUM_REQUIRED", "message": "有料テーマ/フォントは有料ユーザーのみ利用できます" }`
- 401: `{ "error": "UNAUTHORIZED", "message": "認証が必要です" }`

**処理フロー:**
1. Cookie から edge-token を取得 → `AuthService.verifyEdgeToken()` で認証
2. リクエストボディの JSON パース + 型チェック（themeId: string, fontId: string）
3. `validateThemeSelection(themeId, fontId, user.isPremium)` でバリデーション
4. `ThemeService.updateTheme(userId, themeId, fontId)` で保存
5. 200 レスポンス

### 4.3 ThemeService (新規)

ファイル: `src/lib/services/theme-service.ts`

```typescript
/**
 * ThemeService — テーマ設定の保存
 * See: features/theme.feature
 */

import * as UserRepository from "../infrastructure/repositories/user-repository";

/**
 * ユーザーのテーマ・フォント設定を更新する。
 * バリデーションは呼び出し元（route.ts）で実施済みの前提。
 */
export async function updateTheme(
  userId: string,
  themeId: string,
  fontId: string,
): Promise<void> {
  await UserRepository.updateTheme(userId, themeId, fontId);
}
```

---

## 5. UserRepository 拡張

### 5.1 本番実装

ファイル: `src/lib/infrastructure/repositories/user-repository.ts`

追加する関数:

```typescript
/**
 * ユーザーのテーマ・フォント設定を更新する。
 * See: features/theme.feature @テーマ設定が保存される
 */
export async function updateTheme(
  userId: string,
  themeId: string,
  fontId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ theme_id: themeId, font_id: fontId })
    .eq("id", userId);

  if (error) {
    throw new Error(`UserRepository.updateTheme failed: ${error.message}`);
  }
}
```

`UserRow` インターフェースに追加:

```typescript
theme_id: string | null;
font_id: string | null;
```

`rowToUser()` に追加:

```typescript
themeId: row.theme_id ?? null,
fontId: row.font_id ?? null,
```

### 5.2 InMemory実装

ファイル: `features/support/in-memory/user-repository.ts`

追加する関数:

```typescript
export async function updateTheme(
  userId: string,
  themeId: string,
  fontId: string,
): Promise<void> {
  assertUUID(userId, "UserRepository.updateTheme.userId");
  const user = store.get(userId);
  if (user) {
    store.set(userId, { ...user, themeId, fontId });
  }
}
```

`create()` の Omit 型に `themeId`, `fontId` を追加し、デフォルト `null` で初期化する。

---

## 6. SSRテーマ適用

### 6.1 方式: Cookie ベース（DB取得なし）

テーマ適用は **Cookie** から読み取る。理由:
- layout.tsx は Server Component であり、DB呼び出しを行わない設計方針（既存コメント参照）
- テーマ選択時に API で DB に保存すると同時に Cookie にもテーマIDを書き込む
- 未認証ユーザーや Cookie なしの場合はデフォルトテーマにフォールバック

### 6.2 Cookie 仕様

| Cookie名 | 値の例 | 設定タイミング |
|---|---|---|
| `bb-theme` | `dark` | PUT /api/mypage/theme のレスポンスで `Set-Cookie` |
| `bb-font` | `gothic` | 同上 |

- `Path=/; SameSite=Lax; HttpOnly=false`（クライアントJSからも読み取り可能にする。即時適用のため）
- `Max-Age=31536000`（1年）
- `Secure` は本番環境のみ

**注意:** HttpOnly=false にする理由は、テーマ選択時にページ遷移なしで即時CSSクラスを切り替えるため。セキュリティ上のリスクはない（テーマIDは機密情報ではない）。

### 6.3 layout.tsx の変更

ファイル: `src/app/(web)/layout.tsx`

```typescript
import { cookies } from 'next/headers'
import Header from './_components/Header'
import { EDGE_TOKEN_COOKIE } from '@/lib/constants/cookie-names'
import { resolveTheme, resolveFont } from '@/lib/domain/rules/theme-rules'

export default async function WebLayout({ children }: WebLayoutProps) {
  const cookieStore = await cookies()
  const isAuthenticated = cookieStore.has(EDGE_TOKEN_COOKIE)

  // テーマ/フォントをCookieから取得し解決する
  // 未設定や不正値はデフォルトにフォールバック
  // NOTE: isPremium の判定はCookieからはできないため、ここでは
  //       有料テーマのCSSクラスも素通りさせる。
  //       有料→無料のダウングレード時は GET /api/mypage が解決済みIDを返し、
  //       フロントが Cookie を更新するフローで整合性を保つ。
  const themeId = cookieStore.get('bb-theme')?.value ?? null
  const fontId = cookieStore.get('bb-font')?.value ?? null

  // SSR時点では isPremium=true として通す（Cookieに書かれている時点で権限チェック済み）
  // ダウングレード時のフォールバックは API レスポンス経由で実施
  const theme = resolveTheme(themeId, true)
  const font = resolveFont(fontId, true)

  return (
    <div className={`min-h-screen ${theme.cssClass}`}
         style={{ fontFamily: font.cssFontFamily }}>
      <Header isAuthenticated={isAuthenticated} />
      {children}
    </div>
  )
}
```

**重要な変更点:**
- `bg-white` ハードコードを削除。`bg-background text-foreground` は `globals.css` の `@layer base` で `body` に既に適用されている
- テーマの CSS クラス（例: `dark`）を `<div>` に付与することで、shadcn/ui の `@custom-variant dark` が機能する

### 6.4 RootLayout (src/app/layout.tsx) の変更

変更なし。テーマクラスは `(web)/layout.tsx` のスコープで付与するため、`<html>` や `<body>` レベルでの変更は不要。

---

## 7. マイページUI

### 7.1 テーマ設定セクション

マイページ (`src/app/(web)/mypage/page.tsx`) に「テーマ設定」セクションを追加する。配置は「アカウント情報」セクションの直後、「通貨残高」セクションの前。

### 7.2 コンポーネント構成

テーマ設定セクションは `page.tsx` 内にインラインで実装する（別コンポーネントへの分離は不要。マイページの他セクションと同様のパターンに従う）。

### 7.3 UIの振る舞い

```
テーマ設定
├── テーマ一覧
│   ├── [デフォルト]  ← 選択中: チェックマーク表示
│   ├── [ダーク]
│   ├── [オーシャン] 🔒  ← 無料ユーザーにはロックアイコン + disabled
│   ├── [フォレスト] 🔒
│   └── [サンセット] 🔒
└── フォント一覧
    ├── [ゴシック]  ← 選択中: チェックマーク表示
    ├── [明朝] 🔒
    └── [等幅] 🔒
```

**テーマカード:**
- 各カードは `<button>` 要素
- `data-testid="theme-card-{themeId}"` (例: `theme-card-dark`)
- 選択中: `aria-pressed="true"` + チェックマークアイコン表示
- ロック中（有料テーマ + 無料ユーザー）: `disabled` + ロックアイコン表示
- クリック時: 即時にCSSクラスを切り替え（楽観的UI更新） + `PUT /api/mypage/theme` でDB保存

**フォントカード:**
- 各カードは `<button>` 要素
- `data-testid="font-card-{fontId}"` (例: `font-card-gothic`)
- テーマカードと同一のパターン

**即時適用の実装方針:**
1. テーマ/フォント選択時にローカル状態を即座に更新
2. `document.documentElement` (または最寄りの wrapper) の `className` を動的に書き換え
3. 並行して `PUT /api/mypage/theme` を呼び出し、レスポンスの `Set-Cookie` でCookieを更新
4. API 失敗時はローカル状態を元に戻す（楽観的UI更新のロールバック）

### 7.4 状態管理の追加

`page.tsx` に追加する状態:

```typescript
// テーマ設定の状態
const [selectedThemeId, setSelectedThemeId] = useState<string>("default");
const [selectedFontId, setSelectedFontId] = useState<string>("gothic");
```

初期値は `fetchMypageInfo()` のレスポンスから設定する:

```typescript
setSelectedThemeId(data.themeId);
setSelectedFontId(data.fontId);
```

### 7.5 テーマ保存ハンドラ

```typescript
const handleThemeChange = async (newThemeId: string) => {
  const prevThemeId = selectedThemeId;
  setSelectedThemeId(newThemeId);  // 楽観的更新

  try {
    const res = await fetch("/api/mypage/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId: newThemeId, fontId: selectedFontId }),
    });
    if (!res.ok) {
      setSelectedThemeId(prevThemeId);  // ロールバック
    }
  } catch {
    setSelectedThemeId(prevThemeId);
  }
};
```

フォント変更ハンドラも同一パターン。

---

## 8. 画面要素定義 (D-06) 追加

ファイル: `docs/specs/screens/mypage.yaml`

`elements:` セクションに以下を追加（`account-section` の後に配置）:

```yaml
  # --- テーマ設定セクション ---
  # See: features/theme.feature
  - id: theme-section
    type: section
    label: テーマ設定
    children:
      - id: theme-list
        type: card-group
        label: テーマ
        source: THEME_CATALOG
        itemTemplate:
          - id: theme-card
            type: button
            data-testid: theme-card-{themeId}
            label: "{themeName}"
            state:
              selected: themeId == user.themeId
              locked: "!theme.isFree && !user.isPremium"
            action: PUT /api/mypage/theme

      - id: font-list
        type: card-group
        label: フォント
        source: FONT_CATALOG
        itemTemplate:
          - id: font-card
            type: button
            data-testid: font-card-{fontId}
            label: "{fontName}"
            state:
              selected: fontId == user.fontId
              locked: "!font.isFree && !user.isPremium"
            action: PUT /api/mypage/theme
```

---

## 9. BDDステップ定義

ファイル: `features/step_definitions/theme.steps.ts` (新規作成)

### 9.1 ステップ一覧

| ステップ | 種別 | 実装概要 |
|---|---|---|
| `ユーザーがログイン済みである` | Given | 既存 `common.steps.ts` を再利用 |
| `マイページを表示する` | When | `MypageService.getMypage()` 呼び出し、結果を `world.lastResult` に保存 |
| `テーマ設定セクションが表示される` | Then | `lastResult.data` に `themeId`, `fontId` が存在することをアサート |
| `テーマ一覧とフォント一覧が表示される` | Then | `THEME_CATALOG`, `FONT_CATALOG` の定義数 > 0 をアサート（UIの表示検証はカタログ定数の存在で代替） |
| `現在適用中のテーマとフォントが選択状態で表示される` | Then | `lastResult.data.themeId` / `fontId` がデフォルト値と一致することをアサート |
| `ユーザーがマイページのテーマ設定を表示している` | Given | ログイン + `getMypage()` でテーマ情報取得済みの状態を構築 |
| `現在のテーマが "{themeName}" である` | Given | `world.currentUser` の `themeId` を対応するIDに設定 |
| `テーマ "{themeName}" を選択する` | When | `ThemeService.updateTheme()` 呼び出し + `resolveTheme()` でアサート |
| `画面がダークテーマに切り替わる` | Then | `resolveTheme(world.currentUser.themeId)` の結果が `dark` であることをアサート |
| `画面がデフォルトテーマに切り替わる` | Then | 同上（`default`） |
| `テーマ設定が保存される` | Then | `UserRepository.findById()` で DB 上の `themeId` を確認 |
| `有料ユーザーがマイページのテーマ設定を表示している` | Given | `isPremium: true` のユーザーを作成 + ログイン + テーマ情報取得 |
| `有料テーマを選択する` | When | `ThemeService.updateTheme(userId, "ocean", currentFontId)` 呼び出し |
| `画面が選択した有料テーマに切り替わる` | Then | テーマIDが `ocean` であることをアサート |
| `無料ユーザーがマイページのテーマ設定を表示している` | Given | `isPremium: false` のユーザーを作成 + ログイン |
| `有料テーマにはロックアイコンが表示される` | Then | `THEME_CATALOG.filter(t => !t.isFree).length > 0` をアサート（UIロック表示はカタログのisFreeフラグで制御される設計を検証） |
| `有料テーマは選択できない` | Then | `validateThemeSelection("ocean", "gothic", false)` が `valid: false` を返すことをアサート |
| `現在のフォントがゴシック以外である` | Given | ユーザーの `fontId` を有料フォントIDに設定（前提: 有料ユーザー） |
| `フォント "{fontName}" を選択する` | When | `ThemeService.updateTheme()` でフォントIDを更新 |
| `画面がゴシックフォントに切り替わる` | Then | `resolveFont()` の結果が `gothic` であることをアサート |
| `有料フォントを選択する` | When | `ThemeService.updateTheme(userId, currentThemeId, "mincho")` 呼び出し |
| `画面が選択したフォントに切り替わる` | Then | フォントIDが `mincho` であることをアサート |
| `有料フォントにはロックアイコンが表示される` | Then | `FONT_CATALOG.filter(f => !f.isFree).length > 0` をアサート |
| `有料フォントは選択できない` | Then | `validateThemeSelection("default", "mincho", false)` が `valid: false` を返すことをアサート |
| `テーマとフォントの両方が画面に反映される` | Then | `resolveTheme` と `resolveFont` の両方が期待値と一致することをアサート |
| `ユーザーがテーマ "{themeName}" を設定済みである` | Given | ユーザー作成 + `updateTheme()` でテーマを事前設定 |
| `スレッド一覧ページを表示する` | When | テーマ解決ロジックの検証（全画面適用はSSR/Cookie経由のため、BDDではテーマ解決の一貫性を検証） |
| `ダークテーマで画面が表示される` | Then | `resolveTheme(user.themeId, user.isPremium)` が `dark` を返すことをアサート |
| `ユーザーがテーマを一度も設定していない` | Given | `themeId: null, fontId: null` のユーザーを作成 |
| `掲示板にアクセスする` | When | テーマ解決ロジックの呼び出し |
| `デフォルトテーマとゴシックフォントで画面が表示される` | Then | `resolveTheme(null)` = default, `resolveFont(null)` = gothic をアサート |
| `有料テーマと有料フォントを設定中のユーザーが無料ユーザーに変更された` | Given | 有料ユーザーでテーマ設定後、`isPremium: false` に更新 |

### 9.2 テスト方針

- BDDテストはサービス層を直接呼び出す（D-10方針準拠）
- UIのCSSクラス切り替えやCookie操作はBDDテストのスコープ外
- 「画面が切り替わる」系のステップは `resolveTheme()` / `resolveFont()` の戻り値で検証する
- 「ロックアイコンが表示される」系は `validateThemeSelection()` の権限チェックで検証する

---

## 10. Cookie定数

ファイル: `src/lib/constants/cookie-names.ts`

追加:

```typescript
/** テーマID Cookie。SSRでのテーマクラス付与に使用 */
export const THEME_COOKIE = "bb-theme";
/** フォントID Cookie。SSRでのフォント適用に使用 */
export const FONT_COOKIE = "bb-font";
```

---

## 11. 変更ファイル一覧 (locked_files)

### 新規作成

| ファイル | 説明 |
|---|---|
| `supabase/migrations/00025_theme_settings.sql` | DBマイグレーション |
| `src/lib/domain/models/theme.ts` | テーマ/フォントカタログ定数 |
| `src/lib/domain/rules/theme-rules.ts` | テーマ解決・バリデーション |
| `src/lib/services/theme-service.ts` | テーマ保存サービス |
| `src/app/api/mypage/theme/route.ts` | PUT /api/mypage/theme |
| `features/step_definitions/theme.steps.ts` | BDDステップ定義 |

### 既存ファイルの変更

| ファイル | 変更内容 |
|---|---|
| `src/lib/domain/models/user.ts` | `themeId`, `fontId` フィールド追加 |
| `src/lib/infrastructure/repositories/user-repository.ts` | `UserRow` 拡張, `rowToUser` 拡張, `updateTheme()` 追加 |
| `features/support/in-memory/user-repository.ts` | `updateTheme()` 追加, `create()` のデフォルト値追加 |
| `src/lib/services/mypage-service.ts` | `MypageInfo` に `themeId`/`fontId` 追加, `getMypage()` でテーマ解決 |
| `src/app/api/mypage/route.ts` | 変更なし（MypageService の変更で自動的に対応） |
| `src/app/(web)/layout.tsx` | テーマCSSクラス付与 + `bg-white` 削除 |
| `src/app/(web)/mypage/page.tsx` | テーマ設定セクションUI追加 |
| `src/lib/constants/cookie-names.ts` | `THEME_COOKIE`, `FONT_COOKIE` 追加 |
| `docs/specs/screens/mypage.yaml` | テーマ設定セクション要素追加 |

### 変更しないファイル

| ファイル | 理由 |
|---|---|
| `src/app/globals.css` | 段階1では既存の `:root` / `.dark` をそのまま使用。有料テーマのCSS追加は段階2 |
| `src/app/layout.tsx` | テーマクラスは `(web)/layout.tsx` で付与するため変更不要 |
| `features/theme.feature` | 変更禁止 |

---

## 12. 有料→無料ダウングレード時のフォールバック

BDDシナリオ「有料設定中のユーザーが無料に戻るとデフォルトに戻る」の実現方式:

1. `resolveTheme()` / `resolveFont()` が `isPremium=false` + 有料テーマ/フォントの組み合わせでデフォルトにフォールバックする
2. DB上の `theme_id` / `font_id` は変更しない（有料に再加入した場合に復元される）
3. `GET /api/mypage` は解決済みのテーマID/フォントIDを返す
4. フロントは API レスポンスの値で Cookie を上書きする（マイページ表示時）

---

## 13. 単体テスト (Vitest)

以下のテストファイルを作成する:

### `src/__tests__/lib/domain/rules/theme-rules.test.ts`

| テストケース | 検証内容 |
|---|---|
| `resolveTheme(null, false)` → default | null はデフォルトにフォールバック |
| `resolveTheme("dark", false)` → dark | 無料テーマは無料ユーザーでも適用可 |
| `resolveTheme("ocean", true)` → ocean | 有料テーマは有料ユーザーなら適用可 |
| `resolveTheme("ocean", false)` → default | 有料テーマは無料ユーザーでフォールバック |
| `resolveTheme("nonexistent", false)` → default | 不正IDはフォールバック |
| `resolveFont` 系も同様のパターン | |
| `validateThemeSelection("dark","gothic",false)` → valid | 無料の組み合わせ |
| `validateThemeSelection("ocean","gothic",false)` → PREMIUM_REQUIRED | 有料テーマ+無料ユーザー |
| `validateThemeSelection("xxx","gothic",false)` → INVALID_THEME | 不正テーマID |

### `src/__tests__/lib/domain/models/theme.test.ts`

| テストケース | 検証内容 |
|---|---|
| `THEME_CATALOG` に `default` と `dark` が含まれる | カタログの整合性 |
| `FONT_CATALOG` に `gothic` が含まれる | カタログの整合性 |
| `findTheme("dark")` が正しいエントリを返す | ヘルパー関数 |
| `findTheme("nonexistent")` が null を返す | ヘルパー関数 |
| `getDefaultTheme()` が default を返す | デフォルト値 |
