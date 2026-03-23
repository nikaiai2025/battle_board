# 画面テーマ機能 — オーケストレーター向け実装計画

> 作成日: 2026-03-23
> 作成者: bdd-architect（人間の承認済み）

## 概要

マイページから画面テーマ（配色+背景パターン）とフォント（書体）を変更できる機能。
将来の課金要素。2段階で実装する。

## 関連ドキュメント

| ドキュメント | パス | 内容 |
|---|---|---|
| BDDシナリオ | `features/theme.feature` | 承認済み v1。全シナリオ定義 |
| 技術方針 | `docs/architecture/architecture.md` TDR-016 | 資源管理方式の決定 |
| マネタイズ構想 | `features/ドラフト_実装禁止/monetization_ideas.md` | テーマ/スキン販売の背景 |

## 実装段階

### 段階1: 切り替え機構（今回実装する）

無料テーマ（デフォルト+ダーク）とフォント（ゴシック）の切り替えが動く最小構成。

**DB**
- `users` テーブルに `theme_id TEXT DEFAULT NULL`, `font_id TEXT DEFAULT NULL` を追加
- null = デフォルトテーマ + ゴシックフォント

**ドメイン**
- `src/lib/domain/models/theme.ts` 新規作成
  - `THEME_CATALOG`: テーマID・名前・CSSクラス名・無料/有料フラグの定数
  - `FONT_CATALOG`: フォントID・名前・CSS font-family値・無料/有料フラグの定数
  - 初期カタログ: テーマ2種（default, dark）、フォント1種（gothic）
  - 有料テーマ・フォントはカタログ定義のみ（CSSは段階2で追加）

**API**
- `GET /api/mypage` のレスポンスに `themeId`, `fontId` を追加
- `PUT /api/mypage/theme` 新規: テーマとフォントを保存
  - リクエスト: `{ themeId: string, fontId: string }`
  - バリデーション: カタログに存在するか、無料/有料権限チェック

**SSR テーマ適用**
- Web UI 共通レイアウト (`src/app/(web)/layout.tsx`) で:
  - ユーザーの `theme_id` をCookieまたはDB（認証済みの場合）から取得
  - `<html>` または `<body>` に対応するCSSクラスを付与（例: `class="dark"`）
  - `font_id` に対応する `font-family` をCSS変数で注入

**マイページUI**
- テーマ設定セクションをマイページに追加
  - テーマ一覧: カードUI（選択中にチェックマーク、有料にロックアイコン）
  - フォント一覧: 同上
  - 選択時に即時適用（CSSクラス切り替え）+ API呼び出しで保存
- 画面要素定義 `docs/specs/screens/mypage.yaml` にセクション追加

**既存コードへの影響**
- `globals.css`: 変更なし（`:root` と `.dark` はそのまま活用）
- `layout.tsx`: CSSクラス付与ロジック追加（bg-white ハードコード → テーマ対応）

### 段階2: 有料テーマのデザイン・データ収集（段階1の後に実施）

有料テーマ・フォントの具体的なデザインを決定し、CSS変数を追加する。

- 有料テーマ（3種程度）の配色設計（CSS変数値の決定）
- 背景パターンSVGの収集（Hero Patterns等の著作権フリー素材）
- 有料フォント（明朝・等幅）のシステムフォントスタック確定
- `globals.css` にテーマごとのCSS変数を追加
- `THEME_CATALOG` / `FONT_CATALOG` に有料エントリを追加
- 段階1の機構が正しく動いていれば、CSS + 定数の追加のみで完了する

## 注意事項

- 既存ユーザーの見た目は一切変わらない（theme_id=null → デフォルト適用）
- OS の prefers-color-scheme は参照しない（ユーザーの明示的選択のみ）
- 専ブラ（DAT形式）には影響なし（Web UIのみ）
