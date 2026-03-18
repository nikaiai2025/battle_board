# eddist client-v2 フロントエンド Fit & Gap レポート

作成日: 2026-03-18
対象: eddist client-v2（React Router 7 + Vite SSR）vs BattleBoard Web UI（Next.js App Router）
目的: BattleBoard の UI/UX 改善（URL構造・レス番号・ポップアップ・ページネーション）にあたり、eddist の実装を先行事例として分析する

前回レポート: `battleboard_eddist_adoption_report_2026-03-04.md`（アーキテクチャ基盤の採用可否）
本レポート: フロントエンド実装に特化した Fit & Gap

---

## 1. アーキテクチャ比較

### 全体構成

| 項目 | eddist | BattleBoard |
|---|---|---|
| バックエンド | Rust / Axum（API専用サーバー） | Next.js API Routes + Cloudflare Workers |
| フロントエンド | React Router 7 + Vite SSR（別サーバー） | Next.js App Router（同一プロセス） |
| デプロイ | 2サーバー（Docker） + リバースプロキシ | 単一デプロイ（Vercel / Cloudflare） |
| SSR方式 | React Router の loader（Vite SSR） | Next.js Server Components |
| データ取得 | DATファイルをfetch → クライアントでパース | サービス層を直接import（SSR） |
| 書き込み | bbs.cgi（Shift_JIS form POST） | JSON API（`/api/threads/{id}/posts`） |
| 状態管理 | SWR（useSWR） | useState + ポーリング（setInterval + fetch） |

### データ取得方式の本質的違い

**eddist**: Web UIがバックエンドの専ブラ向けエンドポイント（DAT, subject.txt）を直接fetchする。Web専用APIが存在しない。

```
ブラウザ → client-v2 SSR
              ↓ fetch
           eddist-server: /{boardKey}/dat/{threadKey}.dat
              ↓
           Shift_JIS バイト列 → TextDecoder → パース → React描画
```

**BattleBoard**: SSR時にサービス層を直接呼び出す。Web UIとsenburaは異なるデータ取得経路を持つ。

```
ブラウザ → Next.js Server Component
              ↓ import
           PostService.getPostList(threadId)
              ↓
           Supabase → JSON → React描画
```

**Gap**: eddistの方式（DAT直接fetch）はBattleBoardには不適。理由:
- BattleBoardはゲーム固有データ（botMark, inlineSystemInfo等）を持ち、DATフォーマットでは表現不能
- Cloudflare Workers環境での自己fetch制限（error code 1042）
- 既にサービス層直接importが安定稼働している

---

## 2. URL構造

### Fit（一致点）

| 項目 | eddist | BattleBoard（改善後） |
|---|---|---|
| 板URL | `/{boardKey}` | `/{boardId}/`（battleboard, dev） |
| スレッドURL | `/{boardKey}/{threadKey}` | `/{boardId}/{threadKey}/` |
| スレッドID形式 | UNIXタイムスタンプ（10桁） | UNIXタイムスタンプ（10桁）= 既存の `thread_key` |
| トップページ | `/`（板一覧） | `/`（→ `/battleboard/` にリダイレクト） |
| read.cgi | `/{boardKey}/{threadId}` に301 | `/{boardId}/{threadKey}/` に301 |

### Gap（差分）

| 項目 | eddist | BattleBoard（改善後） | 理由 |
|---|---|---|---|
| ページネーション | なし（全レス一括） | `/{boardId}/{threadKey}/1-100` | BattleBoardは1000レス到達時の性能を考慮 |
| デフォルト表示 | 全件表示 | 最新100件（`/l100` 相当） | UX判断 |
| トップページの役割 | 板一覧（複数板前提） | メイン板に直接遷移 | BattleBoardは板数が少ない |
| Web書き込みAPI | bbs.cgi（Shift_JIS） | JSON API（UTF-8） | 既存設計を維持 |

### 設計判断

eddistの `/{boardKey}/{threadKey}` パターンを**そのまま採用**する。eddistで実証済みのURL構造であり、専ブラ互換性（板URLの認識）も確保できる。

ページネーション（`/1-100`）はeddistにはない拡張だが、URL構造としては5ch本家の `read.cgi` で使われていた既知パターンであり、専ブラが解釈できる可能性が高い。

---

## 3. レス番号表示

### Fit（一致点）

eddistのレス番号表示はBattleBoardユーザーの要望と**完全に一致**する。

| 項目 | eddist | BattleBoard（現状） | BattleBoard（改善後） |
|---|---|---|---|
| レス番号表示 | `{post.id}` (例: `1`) | `>>{post.postNumber}` (例: `>>1`) | `{post.postNumber}` |
| レスヘッダー形式 | `1 (+2). 名前 日時 ID:xxx` | `>>1 名前 ID:xxx 日時` | `1 名前 ID:xxx 日時` |

### Gap（差分）

| 項目 | eddist | BattleBoard（改善後） |
|---|---|---|
| レス番号クリック | なし | `>>N` をフォームに挿入 |
| 被参照数表示 | `(+N)` をクリックで参照元ポップアップ | 将来検討 |
| ID表示の装飾 | 投稿数に応じた色分け（1以下:無色、2-5:青、6+:赤） | 将来検討 |
| IDクリック | 同一IDの全投稿をポップアップ | 将来検討 |

### 採用方針

- レス番号表示の `>>N` → `N` への変更: **採用**
- レス番号クリックで `>>N` フォーム挿入: **BattleBoard独自実装**（eddistにない機能）
- 被参照数・ID色分け・IDクリック: **将来検討**（有用だが今回スコープ外）

---

## 4. アンカーポップアップ

### Fit（一致点）

eddistはBattleBoardが必要とするポップアップ機能を**フル実装**している。

**eddistのポップアップ設計:**

```typescript
// スタック管理（配列で複数ポップアップを管理）
const [popups, setPopups] = useState<Popup[]>([]);

interface Popup {
  id: number;         // 一意ID（グローバルカウンタ）
  x: number;          // 表示X座標
  y: number;          // 表示Y座標
  posts: Response[];   // 表示するレス（複数可）
  ref: React.RefObject<HTMLDivElement | null>;  // DOM参照（外側クリック検知用）
}
```

**主要な振る舞い:**
- `>>N` クリック → 対象レス1件をポップアップ
- `(+N)` クリック → 被参照元レスN件をポップアップ
- IDクリック → 同一IDの全レスをポップアップ
- ポップアップ内の `>>N` → さらにポップアップを重ねる（スタック）
- 最上位ポップアップの外側クリック → 1枚ずつ閉じる
- ポップアップが開いている間はページスクロール無効化

**レスポンシブ対応:**
- モバイル（< 768px）: 画面幅95%, 上部固定, 最大高さ90vh
- デスクトップ: クリック位置付近, 自動幅, 画面内に収まるよう調整

### Gap（差分）

| 項目 | eddist | BattleBoard（実装予定） |
|---|---|---|
| トリガー | クリックのみ | クリック + ホバー（デスクトップ） |
| 閉じ方 | 外側クリックで1枚ずつ | 同様 + ホバーアウトで閉じる |
| データソース | 全レスがメモリ上（ページネーションなし） | ページ内レスはDOMから、未ロードレスはAPI取得 |
| ゲーム情報 | なし | inlineSystemInfo, botMark も表示 |
| スクロール制御 | `overflow: hidden` + パディング補正 | 同様の方針で実装 |

### 採用方針

eddistのポップアップ設計（スタック管理 + レスポンシブ + 外側クリック検知）を**設計パターンとして採用**する。ただし以下を調整:

1. **ホバー対応追加**: デスクトップではマウスホバーでプレビュー表示
2. **データソース分離**: ページネーション導入に伴い、未ロードレスへのアンカーはAPIで取得する必要がある
3. **ゲーム情報表示**: ポップアップ内にもinlineSystemInfo, botMarkを表示

---

## 5. ページネーション

### Gap（eddistにない機能）

eddistはページネーションを**実装していない**。全レスを一括ロードし、全件を描画する。

BattleBoardが100件区切りのページネーションを導入する場合、以下はBattleBoard独自の設計が必要:

| 設計項目 | 方針案 |
|---|---|
| URL形式 | `/{boardId}/{threadKey}/1-100`（5ch互換） |
| デフォルト | 最新100件（`/l100` 相当） |
| SSRデータ取得 | PostService に offset/limit を追加 |
| ポーリング | 最新ページ表示時のみ有効 |
| ページナビゲーション | `1-100 / 101-200 / ... / l100` のリンク |
| アンカーポップアップ | 別ページのレスはAPIで取得（遅延ロード） |

---

## 6. 書き込みUI

### Fit（参考になる実装）

**eddistの書き込み方式:**
- モーダルダイアログ（画面遷移なし）
- bbs.cgi にShift_JIS form POSTで送信（Web UIでも専ブラと同じエンドポイント）
- 書き込み成功後: モーダルを閉じ、`mutate()` でスレッドデータを再取得
- 認証エラー時: 認証コードモーダルを表示

```typescript
// utils.ts — Web UIからの書き込みもbbs.cgiを使う
const res = await fetch(`/test/bbs.cgi`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "submit=" + sjisEncode("書き込む") + "&MESSAGE=" + sjisEncode(body) + ...
});
```

**注目点**: eddist Web UIは**専ブラと同じbbs.cgiで書き込む**。つまりWeb UIは専ブラのシン・クライアントに近い思想。

### Gap（差分）

| 項目 | eddist | BattleBoard |
|---|---|---|
| 書き込みエンドポイント | bbs.cgi（Shift_JIS） | JSON API（UTF-8） |
| 書き込みUI | モーダル（FABボタンで開く） | インラインフォーム（ページ上部に常駐） |
| 成功後の更新 | SWR `mutate()`（全DAT再取得） | `router.refresh()`（SSR再実行） |
| エラーハンドリング | モーダル内でエラー表示 | フォーム直下でエラー表示 |

### 採用方針

eddistの書き込みUI（モーダル + bbs.cgi共用）は興味深いが、BattleBoardは**現行のJSON API + インラインフォーム方式を維持**する。理由:
- BattleBoardはゲーム固有のレスポンス（inlineSystemInfo, コマンド結果）をJSON APIで返す
- bbs.cgiの応答はHTML形式であり、ゲーム情報の返却に不向き
- レス番号クリックで `>>N` を挿入するにはインラインフォームの方が自然

---

## 7. その他の注目機能

### NG設定（eddist独自）

eddistはクライアントサイドのNG（非表示）機能を実装:
- NGワード: 本文・名前・IDで非表示
- 非表示モード: 完全非表示（hidden）/ 折りたたみ（collapsed, 展開可能）
- コンテキストメニュー: レスの名前・IDを長押しorr右クリックでNG追加
- localStorage に永続化

BattleBoardへの採用: **将来検討**。掲示板としての利便性向上に有用だが、今回のスコープ外。

### Pull-to-Refresh（eddist独自）

モバイルでの引っ張り更新:
- 上方向スワイプ（スレッドページ: 新着取得）
- 下方向スワイプ（一覧ページ: リスト更新）
- カスタムインジケーター表示

BattleBoardへの採用: **将来検討**。モバイルUXの改善に有用。

### スレッド一覧のソート機能（eddist独自）

- 更新日時 / レス数 / 勢い / 作成日時 でソート切り替え
- 昇順/降順トグル

BattleBoardへの採用: **将来検討**。

---

## 8. 総合判定

### 直接採用（Fit）

| 項目 | eddist実装 | BattleBoardでの適用 |
|---|---|---|
| URL構造 | `/{boardKey}/{threadKey}` | そのまま採用 |
| レス番号表示 | 数字のみ（`>>` なし） | そのまま採用 |
| ポップアップ設計 | スタック型, レスポンシブ, 外側クリック閉じ | 設計パターンとして採用 |
| read.cgiリダイレクト | `/{boardKey}/{threadKey}` に301 | そのまま採用 |

### 参考にするが改変が必要（Partial Fit）

| 項目 | eddist | BattleBoard改変 | 改変理由 |
|---|---|---|---|
| ポップアップのトリガー | クリックのみ | クリック + ホバー | デスクトップUXの慣習 |
| データ取得 | DAT直接fetch | サービス層直接import | ゲーム固有データ, Cloudflare制約 |
| 書き込みUI | モーダル + bbs.cgi | インラインフォーム + JSON API | ゲーム固有レスポンス |

### BattleBoard独自実装（Gap）

| 項目 | eddistの状況 | BattleBoardで必要な理由 |
|---|---|---|
| ページネーション（100件区切り） | 未実装 | 1000レス到達時の性能 |
| レス番号クリック → フォーム挿入 | 未実装 | 掲示板UXの基本機能 |
| 別ページレスのAPI遅延取得 | 不要（全件メモリ上） | ページネーションに伴う必然 |
| ゲーム情報のポップアップ内表示 | N/A | BattleBoard固有要件 |

---

## 9. 実装への示唆

### URL移行の影響範囲

現状の `/threads/{UUID}` から `/{boardId}/{threadKey}` への移行で変更が必要なファイル:

- `src/app/(web)/threads/[threadId]/page.tsx` → `src/app/(web)/[boardId]/[threadKey]/page.tsx`
- `src/app/(web)/_components/ThreadCard.tsx` — リンク先URL変更
- `src/app/(web)/page.tsx` → `src/app/(web)/[boardId]/page.tsx`
- `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` — リダイレクト先変更
- `src/app/api/threads/[threadId]/` — APIパスは変更不要（内部用）

### eddistの実装から学ぶべき設計指針

1. **Web UIと専ブラの URLを統一する**: 別々のURL体系を持つと「URLで開く」問題が発生する
2. **スレッドIDにはDBの内部IDではなく、ユーザーが理解できる識別子を使う**: UUIDは内部用、threadKey（UNIXタイムスタンプ）は外部用
3. **ポップアップはスタック管理**: 配列で管理し、最上位から1枚ずつ閉じる設計が5ch/専ブラの慣習に合致
4. **全レス一括ロードはシンプルだがスケールしない**: eddistは全件ロード。BattleBoardは1000レスを想定しページネーションを導入
