# TASK-212 画像URLサムネイル表示 実装設計書

> 作成日: 2026-03-21
> 対象BDDシナリオ: `features/thread.feature` @image_preview (4シナリオ)
> ステータス: 設計完了

---

## 1. 対象BDDシナリオの要約

| # | シナリオ | 要点 |
|---|---|---|
| 1 | 画像URLがサムネイルとして展開表示される | 画像URLをサムネイル+元URLテキストの両方で表示 |
| 2 | サムネイルをクリックすると原寸画像が表示される | クリックで原寸表示 |
| 3 | 画像以外のURLはサムネイル展開されない | 非画像URLはリンクのみ表示 |
| 4 | 複数の画像URLが1つのレスに含まれる場合すべて展開される | 1レス内の複数画像URLを全展開 |

---

## 2. URL検出ロジック

### 2.1 配置先

`src/lib/domain/rules/url-detector.ts`

理由: URL判定は外部依存のない純粋関数であり、既存の `domain/rules/` の配置方針に合致する。`anchor-parser.ts`, `pagination-parser.ts` と同系統。画像URL検出だけでなく全URL検出を担うため、`image-url-detector.ts` ではなく `url-detector.ts` とする。

### 2.2 判定基準: 拡張子ベース

画像URLの判定は**拡張子ベース**で行う。ドメインベースのホワイトリストは採用しない。

**対象拡張子**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`

**理由**:
- BDDシナリオでは `i.imgur.com` が例として登場するが、シナリオの受け入れ基準はURLの拡張子で画像かどうかを区別している（`.jpg` → サムネイル展開、`/page` → リンクのみ）
- ドメインホワイトリストは保守コストが高く、新しい画像ホスティングサービスへの対応が遅れる
- 拡張子ベースは5ch系掲示板で広く採用されている慣行であり、ユーザーの期待にも合致する

**URL検出方式**: 本文中のURLを正規表現で検出し、パス部分の拡張子で画像かどうかを判定する。クエリ文字列・フラグメントがある場合はそれらを除外した上で拡張子を判定する。

### 2.3 関数インターフェース

```typescript
// src/lib/domain/rules/url-detector.ts

/** URL検出結果 */
export interface UrlMatch {
  url: string;        // マッチしたURL文字列
  startIndex: number;  // 本文中の開始位置
  endIndex: number;    // 本文中の終了位置
  isImage: boolean;    // 画像URLかどうか
}

/** 対応する画像拡張子 */
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"] as const;

/**
 * 本文中の全URLを検出し、画像かどうかを判定する純粋関数。
 *
 * @param body - レス本文
 * @returns URL検出結果の配列（出現順）
 */
export function detectUrls(body: string): UrlMatch[];

/**
 * URLが画像URLかどうかを判定する純粋関数。
 *
 * @param url - 判定対象のURL文字列
 * @returns 画像URLならtrue
 */
export function isImageUrl(url: string): boolean;
```

ファイル名を `url-detector.ts` とする。画像URL検出だけでなく全URL検出を担うため、より汎用的な名前にする。

### 2.4 URL検出の正規表現

```
https?:\/\/[^\s<>"']+
```

- `https://` または `http://` で始まる
- 空白文字、`<`, `>`, `"`, `'` で終端する（本文中の区切り文字対策）
- 検出したURLに対して `isImageUrl` で画像判定を行う

### 2.5 `isImageUrl` の判定ロジック

```
1. URLからクエリ文字列（?以降）とフラグメント（#以降）を除去
2. パス末尾が IMAGE_EXTENSIONS のいずれかに一致するかを大文字小文字不問で判定
```

---

## 3. コンポーネント構成

### 3.1 設計方針: `parseAnchorLinks` の拡張ではなく、上位パーサーを新設

現在の `PostItem.tsx` の `parseAnchorLinks` はアンカー(`>>N`)のみを処理する。画像URL検出はアンカーとは独立した関心事であるため、以下の方針とする。

- `parseAnchorLinks` はアンカー処理に特化したまま変更しない
- 本文全体のパースを統括する新関数 `parsePostBody` を `PostItem.tsx` に追加する
- `parsePostBody` は以下の順序で本文を処理する:
  1. 画像URL検出（`detectImageUrls`）
  2. 非画像URL部分のアンカー検出（既存 `parseAnchorLinks` を部分適用）

**理由**:
- `parseAnchorLinks` の変更は既存の @anchor_popup シナリオへの影響リスクがある
- 将来的にURL以外のパース（OGP等）が追加される場合にも拡張しやすい
- 関心の分離: URL検出はdomain層、React要素への変換はUI層

### 3.2 新規コンポーネント: `ImageThumbnail`

```
src/app/(web)/_components/ImageThumbnail.tsx  [Client Component]
```

1レスの本文内で画像URLを検出した箇所に挿入されるコンポーネント。

**Props**:

```typescript
interface ImageThumbnailProps {
  /** 画像のURL */
  url: string;
}
```

**表示構成**:

```
[サムネイル画像]   ← クリック可能（§4で後述）
[URLテキスト]      ← 元のURLをテキストとして表示（リンク付き）
```

BDDシナリオ1:「画像URLがクリック可能なサムネイル画像として表示される」「元のURLテキストも表示される」に対応。

**サムネイルサイズ**: 最大幅150px、最大高さ150px（`object-contain` でアスペクト比維持）。Tailwind CSSで `max-w-[150px] max-h-[150px]` を指定。

### 3.3 PostItem.tsx のコンポーネントツリー変更

変更前:
```
PostItem
  └── post-body: parseAnchorLinks(post.body)
```

変更後:
```
PostItem
  └── post-body: parsePostBody(post.body)
                   ├── テキスト部分 → parseAnchorLinks(テキスト)
                   │                   ├── string
                   │                   └── AnchorLink
                   └── 画像URL部分 → ImageThumbnail
```

### 3.4 web-ui.md (D-08) のコンポーネントツリーへの反映

`PostItem` の子として `ImageThumbnail` を追加する。

```
└── PostItem [Client Component]
      └── AnchorLink [Client Component]
      └── ImageThumbnail [Client Component]  // NEW: 画像URLサムネイル表示
```

---

## 4. クリック動作: 新タブで原寸表示

### 4.1 方式決定

BDDシナリオ2:「サムネイルをクリックすると原寸の画像が表示される」

**決定: `<a href={url} target="_blank" rel="noopener noreferrer">` で新タブに原寸画像を表示する。**

### 4.2 トレードオフ分析

| 方式 | メリット | デメリット |
|---|---|---|
| **新タブ (採用)** | 実装が最も単純。5ch系掲示板の標準的なUX。BDDシナリオに「原寸の画像が表示される」とのみ記述があり、モーダル・インライン展開の指定はない | 画面遷移が発生する |
| インライン展開 | ページ内で完結 | DOM操作が複雑。大画像でレイアウトが崩れるリスク |
| モーダル(lightbox) | UXが良い | 実装コスト大。スクロール制御・キーボード操作等の考慮が増える。BDDシナリオがモーダルを要求していない |

**選択根拠**: BDDシナリオは「原寸の画像が表示される」としか記述しておらず、表示方法に追加の制約はない。新タブ方式はBDDシナリオの受け入れ基準を満たし、かつ実装が最も単純で5ch系掲示板のユーザーに馴染みがある。

### 4.3 ImageThumbnail の描画イメージ

```tsx
<span className="inline-block my-1">
  <a href={url} target="_blank" rel="noopener noreferrer">
    <img
      src={url}
      alt="画像プレビュー"
      className="max-w-[150px] max-h-[150px] object-contain border border-gray-300 rounded cursor-pointer hover:opacity-80"
      loading="lazy"
      onError={/* エラー時は非表示 */}
    />
  </a>
  <br />
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-blue-600 hover:underline text-xs break-all"
  >
    {url}
  </a>
</span>
```

---

## 5. セキュリティ

### 5.1 外部画像読み込みのリスクと対策

| リスク | 影響度 | 対策 |
|---|---|---|
| IPリーク（閲覧者のIPが画像サーバーに露出） | 中 | 許容する。匿名掲示板として、画像を含むレスを閲覧する際に外部サーバーへリクエストが発生することはユーザーの暗黙の了解。5ch等の既存掲示板も同様の仕様 |
| 悪意ある画像URL（XSS、リダイレクト等） | 低 | `<img>` タグのsrc属性にURLを設定するのみ。JavaScriptの実行は発生しない。`dangerouslySetInnerHTML` は使用しない |
| 画像偽装（拡張子は.jpgだが中身がHTML等） | 低 | `<img>` タグはブラウザが画像としてパースするため、HTMLは実行されない |
| トラッキングピクセル | 低 | 拡張子ベースの判定で1x1ピクセル画像を排除できないが、サムネイルに限定しているため実害は小さい |

### 5.2 `<img>` タグ vs `next/image` の選択

**決定: 素の `<img>` タグを使用する。`next/image` は使用しない。**

**理由**:
- `next/image` の `remotePatterns` はホワイトリスト方式であり、全ての外部画像ドメインを事前登録する必要がある。掲示板の特性上、ユーザーが任意のドメインの画像URLを投稿するため、ホワイトリスト管理は実質不可能
- `next/image` の Image Optimization API（画像プロキシ）は、任意の外部URLに対して自サーバー経由でリクエストを行うため、SSRF（Server-Side Request Forgery）のリスクとサーバー負荷が発生する
- サムネイル表示は固定サイズ（max 150x150）のCSS制約で実現するため、`next/image` によるリサイズ最適化の恩恵は限定的
- `loading="lazy"` 属性で遅延読み込みを行い、パフォーマンスへの影響を最小化する

### 5.3 CSP (Content-Security-Policy) への影響

現時点でプロジェクトにCSPヘッダーの設定は存在しない（`next.config.ts` およびmiddlewareに設定なし）。将来的にCSPを導入する場合は `img-src` ディレクティブに `*` または対象ドメインの許可が必要になる。

本設計書では、CSP未設定の現状に合わせて追加設定は行わない。CSP導入時に `img-src` の設定が必要となることをここに記録する。

### 5.4 画像読み込みエラー時の振る舞い

`<img>` の `onError` イベントでサムネイル画像を非表示にする。URLテキストリンクは残す。これにより、リンク切れ・404・CORS拒否等の場合でもUIが壊れない。

---

## 6. parsePostBody の設計

### 6.1 処理フロー

§3.1で述べた通り、`parsePostBody` は本文全体のパースを統括する。処理フローの詳細は§6.2の対応方針で確定した内容に従う。

### 6.2 分割ロジックの詳細

```
body = "こんにちは https://i.imgur.com/a.jpg 見てね https://example.com/page"
           ↓
全URLを正規表現で検出 → [
  {url: "https://i.imgur.com/a.jpg",  startIndex: 5,  endIndex: 35},
  {url: "https://example.com/page",   startIndex: 40, endIndex: 64},
]
           ↓
分割:
  [0..5)   "こんにちは " → parseAnchorLinks → [string]
  [5..35)  画像URL       → ImageThumbnail
  [35..40) " 見てね "    → parseAnchorLinks → [string]
  [40..64) 非画像URL     → <a href="...">https://example.com/page</a>
```

非画像URLはテキスト部分に残る。BDDシナリオ3の記述は以下の通り:

```
Then URLはリンクとして表示される
And サムネイル画像は表示されない
```

「リンクとして表示される」は `<a>` タグでクリック可能なリンクとして表示されることを明確に要求している。現在の `parseAnchorLinks` はURLをプレーンテキストとして出力するため、このままではシナリオ3の受け入れ基準を満たさない。

**対応方針**: `parsePostBody` 内で、URL全般（画像・非画像問わず）を検出し、以下のように振り分ける:
- 画像URL → `ImageThumbnail` コンポーネント（サムネイル + URLリンク）
- 非画像URL → `<a href={url} target="_blank" rel="noopener noreferrer">` リンク

これにより、全URLがリンク化され、画像URLのみ追加でサムネイルが表示される。`parsePostBody` の処理フローは以下の通りとなる:

```
入力: body (string)
  │
  ├─ 全URLを正規表現で検出（位置情報付き）
  │
  ├─ body を「URL部分」と「テキスト部分」に分割
  │
  ├─ テキスト部分 → parseAnchorLinks(text) でアンカー変換
  │
  ├─ URL部分 → isImageUrl で画像判定
  │     ├─ 画像URL → <ImageThumbnail url={url} />
  │     └─ 非画像URL → <a href={url} ...>{url}</a>
  │
出力: (string | ReactElement)[]
```

---

## 7. BDDステップ定義方針

### 7.1 ファイル配置

既存の `features/step_definitions/thread.steps.ts` に追加する。

**理由**: `@image_preview` は `thread.feature` 内のシナリオであり、BDDテスト戦略書(D-10)の「1 feature = 1 stepsファイル」原則に従う。

### 7.2 テストレベル

BDDテスト戦略書(D-10)の方針に従い、**サービス層テスト**として実装する。

ただし、@image_preview シナリオはUI表示の振る舞いを検証するものであり、サービス層に画像URL検出のロジックは存在しない。このため、テスト対象は以下の2層に分かれる:

| テスト対象 | テスト方式 | 検証内容 |
|---|---|---|
| `detectUrls`, `isImageUrl` | **Vitest単体テスト** (`src/__tests__/lib/domain/rules/url-detector.test.ts`) | URL検出・画像判定の正確性 |
| BDDステップ定義 | **Cucumber.js** (`features/step_definitions/thread.steps.ts`) | domain層の `detectUrls` を呼び出して結果をアサート |

### 7.3 BDDステップ定義の実装方針

@image_preview の4シナリオはいずれもUI表示の検証である。BDDステップ定義では、UIコンポーネントの描画をテストするのではなく、**画像URL検出ロジック（domain層）の振る舞いをテストする**。

```gherkin
# シナリオ1: 画像URLがサムネイルとして展開表示される
Given スレッドにレス "https://i.imgur.com/example.jpg" が存在する
When スレッドを表示する
Then 画像URLがクリック可能なサムネイル画像として表示される
And 元のURLテキストも表示される
```

ステップ定義での検証:
- Given: レスの `body` に画像URLを含むレスを作成
- When: `detectUrls(body)` を実行
- Then: 戻り値にURLが含まれ、`isImage: true` であることをアサート
- And: 元のURL文字列がマッチ結果の `url` プロパティに保持されていることをアサート

```gherkin
# シナリオ3: 画像以外のURLはサムネイル展開されない
Given スレッドにレス "https://example.com/page" が存在する
When スレッドを表示する
Then URLはリンクとして表示される
And サムネイル画像は表示されない
```

ステップ定義での検証:
- When: `detectUrls(body)` を実行
- Then: 戻り値にURLが含まれ、`isImage: false` であることをアサート（URLとして検出されるがサムネイル対象ではない）

### 7.4 Vitest単体テストのケース

`src/__tests__/lib/domain/rules/url-detector.test.ts`:

| テストケース | 入力 | 期待結果 |
|---|---|---|
| .jpg URLを検出 | `"https://i.imgur.com/a.jpg"` | 1件の画像URL |
| .png URLを検出 | `"https://example.com/img.png"` | 1件の画像URL |
| .gif URLを検出 | `"https://example.com/anim.gif"` | 1件の画像URL |
| .webp URLを検出 | `"https://example.com/photo.webp"` | 1件の画像URL |
| 大文字拡張子を検出 | `"https://example.com/IMG.JPG"` | 1件の画像URL |
| クエリ付き画像URL | `"https://example.com/a.jpg?w=100"` | 1件の画像URL |
| 非画像URLを除外 | `"https://example.com/page"` | 0件 |
| 画像拡張子なしを除外 | `"https://example.com/image"` | 0件 |
| テキスト中の複数画像URL | `"画像1 https://a.com/1.jpg 画像2 https://b.com/2.png"` | 2件の画像URL |
| 画像URLとテキストの混在 | `"見て https://a.com/1.jpg これ"` | 1件（位置情報あり） |
| URLなしの本文 | `"普通のテキスト"` | 0件 |
| 空文字列 | `""` | 0件 |
| アンカーと画像URLの混在 | `">>1 https://a.com/1.jpg"` | 1件の画像URL（アンカーは無関係） |

---

## 8. 変更対象ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `src/lib/domain/rules/url-detector.ts` | **新規** | `detectUrls`, `isImageUrl` 純粋関数 |
| `src/__tests__/lib/domain/rules/url-detector.test.ts` | **新規** | 単体テスト |
| `src/app/(web)/_components/ImageThumbnail.tsx` | **新規** | サムネイル表示コンポーネント |
| `src/app/(web)/_components/PostItem.tsx` | **修正** | `parsePostBody` 追加、本文描画を `parsePostBody` に切り替え |
| `features/step_definitions/thread.steps.ts` | **修正** | @image_preview ステップ定義追加 |
| `docs/specs/screens/thread-view.yaml` | **修正** | `post-body` の `features` に `image-thumbnail` 追加 |
| `docs/architecture/components/web-ui.md` | **修正** | コンポーネントツリーに `ImageThumbnail` 追加 |

---

## 9. スコープ外の確認

以下はタスク指示書で明示されたスコープ外であり、本設計では扱わない:

- 画像アップロード機能
- 動画URLの展開
- OGP/リッチプレビュー
