# ChMate接続問題 デバッグレポート

> 実施日: 2026-03-14
> 対象: ChMate (Android) から本番Vercel環境への接続不可問題

---

## 1. 症状

ChMateで板URL `https://battle-board-eight.vercel.app/battleboard/` を登録後、「subject.txtからスレ一覧が読み取れません」エラーが表示される。Siki (PC) では同一URLで正常動作。

## 2. 調査経緯

### 2.1 初期仮説: .dat拡張子ルーティング問題

- **現象**: `GET /battleboard/kako/1773/17734/1773436607.dat` が404
- **原因**: Next.js App Routerのフォルダ名 `[threadKey].dat` がVercel上で静的ファイルリクエストとして処理される
- **対処**: Sprint-14で `next.config.ts` にrewrites追加 + フォルダリネーム（`[threadKey].dat` → `[threadKey]`）
- **結果**: Sikiでは解決。ChMateでは引き続き接続不可

### 2.2 第二仮説: bbsmenu.json不在

- **仮説**: ChMateは `bbsmenu.html` を指定しても内部的に `bbsmenu.json` を要求する
- **対処**: `GET /bbsmenu.json` エンドポイントを新規実装
- **結果**: 実装後もChMateは接続不可。PoCでもbbsmenu.jsonなしで動作していたことを確認し、仮説を棄却

### 2.3 第三仮説: Vercel固有のHTTP/HTTPS挙動

- **根拠**: PoCではcloudflaredトンネル（HTTPS終端）経由でChMateが動作していた
- **検証方法**: ローカルNext.jsサーバー + cloudflaredトンネルで再現テスト
- **結果**: cloudflared経由では**ChMate正常動作**（スレッド一覧表示・書き込み成功）。Vercel直接は不可

### 2.4 パケットキャプチャによる確定診断

mitmproxy (Android) でChMateの通信を直接解析。

#### 環境構成

```
Android (ChMate)
  ↓ Wi-Fi proxy: PC:8080
PC (mitmproxy :8080)
  ↓ upstream
PC (cloudflared tunnel)
  ↓ HTTPS tunnel
ローカル Next.js dev server (:3000)
```

#### 観測結果

ChMateの5chプロトコルHTTPクライアントは、**HTTPの2つの経路**を使い分けている:

| 機能 | 通信方式 | ポート | 備考 |
|---|---|---|---|
| bbsmenu.html取得 | WebView (HTTPS) | 443 | 正常動作 |
| subject.txt取得 | Raw HTTP client | **80** | 問題箇所 |
| .dat取得 | Raw HTTP client | **80** | 問題箇所 |
| bbs.cgi書き込み | Raw HTTP client | **80** | 問題箇所 |

ChMateのUser-Agent: `Monazilla/1.00 2chMate/0.8.10.239 Dalvik/2.1.0 (Linux; U; Android 14; A203SO Build/63.2.D.1.151)`

## 3. 根本原因

**ChMateの5chプロトコルHTTPクライアントはHTTP（ポート80）で接続する。Vercelは全HTTP:80リクエストを308 Permanent RedirectでHTTPS:443に転送する。ChMateはこの308リダイレクトに追従できない（または追従後のTLSハンドシェイクに失敗する）。**

```
ChMate → HTTP:80 → Vercel → 308 Redirect → HTTPS:443
                                              ↑ ChMateここで失敗
```

### なぜSikiは動作するか

Siki (PC) は最初からHTTPS:443で接続するため、308リダイレクトが発生しない。

### なぜPoCでは動作したか

PoCではcloudflaredトンネルを使用。cloudflaredがHTTPS終端となり、バックエンドにはHTTPで転送するため、ChMateはcloudflaredのHTTPSエンドポイントに直接接続できた（mitmproxy経由でプロキシ設定されていたため）。

### なぜVercelの設定で解決できないか

Vercelの308リダイレクトはプラットフォームレベルで強制されており、ユーザー側で無効化する設定がない。カスタムドメインを使用しても同様。

## 4. 解決策の選択肢

| # | 方法 | 実現性 | 備考 |
|---|---|---|---|
| A | **Cloudflare Pages移行** | 高 | カスタムドメイン + 「Always Use HTTPS」OFF でHTTP:80直接応答可能 |
| B | カスタムドメイン + Cloudflare Proxy → Vercel | 中 | Vercel非推奨構成。SSL証明書衝突リスクあり |
| C | 別途HTTP:80受付サーバーを立てる | 低 | 運用コスト増。Vercelの利点が薄れる |
| D | ChMateの挙動変更を待つ | 不可 | サードパーティアプリのため制御不能 |

### 推奨: 選択肢A（Cloudflare Pages移行）

- Cloudflare Pagesはカスタムドメイン + DNS設定でHTTP:80の制御が可能
- 商用利用可能（Vercelは個人プランでの商用利用に制約あり）
- Next.js App Routerのサポートは `@cloudflare/next-on-pages` で実現可能（要互換性検証）

## 5. 副次的発見

### 5.1 専ブラ書き込み時の日本語文字化け

cloudflared経由でChMateから書き込みテストした際、日本語が `???` に化けた。Shift_JISデコード処理の問題と推定されるが、本件とは別問題として扱う。

### 5.2 認証バイパス脆弱性

Sikiでの書き込みテスト中に、**認証コード未入力でも書き込みが成功する**バグを発見。`resolveAuth()` がedge-tokenの存在のみチェックし、auth_codes.verified状態をチェックしていない。詳細は `tmp/auth_spec_review_context.md` に記録。

### 5.3 PoCレポートとの整合

PoCレポート (2026-03-04) に「ChMateがHTTP接続でタイムアウト — Android 9以降のcleartext HTTP制限の可能性」と記録されていたが、これはAndroid側の制限ではなくサーバー側（Vercel）の308リダイレクト問題であったことが今回判明。cloudflaredで解決できたのもHTTPS終端が提供されたためと説明がつく。

## 6. 関連資料

| 資料 | パス |
|---|---|
| PoC実施結果報告 | `docs/poc/5chbrowser_and_githubactions/poc_report.md` |
| 認証仕様レビューコンテキスト | `tmp/auth_spec_review_context.md` |
| Sprint-14計画書 | `tmp/orchestrator/sprint_14_plan.md` |
| 専ブラ互換featureファイル | `features/constraints/specialist_browser_compat.feature` |
