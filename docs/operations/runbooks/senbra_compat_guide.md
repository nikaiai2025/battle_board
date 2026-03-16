# 5ch専用ブラウザ(ChMate)対応で踏んだ落とし穴と対策

> 5chライクな掲示板をゼロから開発し、ChMate等の専用ブラウザ（専ブラ）で読み書きできるようにする過程で遭遇した問題と解決策をまとめる。

## 想定読者

- 匿名掲示板・5ch互換掲示板を自作している開発者
- Next.js / Cloudflare Workers / Vercel 等のモダンスタックで5chプロトコル互換APIを実装しようとしている人
- ChMateで動かない原因が分からず困っている人

## 参考実装

調査にあたり [eddist](https://github.com/edginer/eddist)（Rust製の5ch互換掲示板エンジン）のソースコードを繰り返し参照した。ChMateで実運用されている実績があり、「なぜこう書いているのか」自体が専ブラ互換のナレッジとして極めて有用。

---

## 1. ChMateはHTTP:80で通信する

### 症状

- bbsmenuは登録できるのに、スレッド一覧が読み込めない
- Siki（PC専ブラ）では正常動作するのにChMateだけ動かない

### 原因

ChMateは2つのHTTPクライアントを使い分けている:

| 機能 | 通信方式 | ポート |
|---|---|---|
| bbsmenu取得 | WebView (HTTPS) | 443 |
| subject.txt / DAT / bbs.cgi | Raw HTTPクライアント | **80** |

**VercelはHTTP:80を308でHTTPSにリダイレクトする。ChMateはこのリダイレクトに追従できない。** Vercelの設定で無効化する手段はない。

### 確認方法

Android端末にmitmproxyを設定し、ChMateの通信をパケットキャプチャして確定診断した。

### 対策

- **Cloudflare Workers/Pagesに移行し、「Always Use HTTPS」をOFFにする**
- ホスティング選定時に「HTTP:80リクエストに直接応答できるか」を必須要件にする
- Vercelでは解決不可能。Cloudflare Proxy経由も非推奨構成になるためリスクが高い

---

## 2. Set-CookieにSecure / SameSiteを付けてはいけない

### 症状

- 認証（write_token方式）は成功する
- 直後の書き込みで再び認証を要求される
- 何度やっても毎回認証になる

### 原因

bbs.cgiのレスポンスで `Set-Cookie: edge-token=xxx; HttpOnly; Secure; SameSite=Lax` を返していた。

**ChMateは`Secure`属性が付いたCookieを保存しない。** `SameSite`も同様。一般的なWebセキュリティのベストプラクティスだが、専ブラのHTTPクライアント実装と互換性がない。

### 確認方法

bbs.cgiに診断ログを6箇所追加し、`wrangler tail` でリアルタイム確認:

```
POST /test/bbs.cgi  (write_tokenで書き込み成功、Set-Cookie発行)
  [bbs.cgi] Setting edge-token cookie: 0e6f10f0...

POST /test/bbs.cgi  (直後の再書き込み)
  [bbs.cgi] Cookie header: (absent)    ← Cookieが送信されていない
```

`SameSite=None; Secure` に変えても同じ。属性を両方削除して初めてCookieが保存された。

### 対策

```
Set-Cookie: edge-token=xxx; HttpOnly; Max-Age=31536000; Path=/
```

- `Secure` → 削除
- `SameSite` → 削除
- `HttpOnly` → 残す
- `Path=/` → 残す

eddistも同じ構成（`Secure` / `SameSite`を意図的に未設定）。

---

## 3. Shift_JISエンコードで絵文字が消える

### 症状

- ユーザーが投稿した絵文字が「？」に化ける
- eddistでは絵文字が表示されるのに、自前実装では消失する

### 原因

5chプロトコルのDATファイルはShift_JIS（CP932）エンコード。CP932の文字集合に絵文字は含まれない。

自前実装ではCP932非対応文字を全角「？」に置換していたため、情報が不可逆に消失。

### eddistの方式

eddistは `encoding_rs` クレート（WHATWGエンコーディング仕様準拠）を使用。CP932非対応文字は自動的にHTML数値参照に変換される:

```
😅 → &#128517;
```

HTML数値参照はASCII文字のみで構成されるため、Shift_JISエンコードを問題なく通過する。専ブラはDAT本文をHTMLとして解釈するので、`&#128517;` は絵文字として表示される。

### 対策

Shift_JIS変換のフォールバック処理を変更:

```
// NG: 情報消失
CP932非対応文字 → 全角？

// OK: HTML数値参照で保持
CP932非対応文字 → &#コードポイント;
```

### 追加の罠: 異体字セレクタ

🕳️ のような絵文字は `U+1F573`（穴）+ `U+FE0F`（異体字セレクタ）の2文字構成。eddistの方式でも `U+FE0F` が `&#65039;` に変換され、専ブラで文字化けマークとして表示される。

`U+FE0F`（絵文字スタイル指示）と `U+FE0E`（テキストスタイル指示）は表示ヒントであり、Shift_JIS/DATの文脈では不要なので**除去する**のが正解。一方、`U+200D`（ZWJ: ゼロ幅接合子）は結合絵文字の構成要素なので除去してはいけない。

| 文字 | 処理 | 理由 |
|---|---|---|
| U+FE0F (VS16) | 除去 | 表示指示。なくても絵文字は表示される |
| U+FE0E (VS15) | 除去 | 同上 |
| U+200D (ZWJ) | HTML数値参照で保持 | 👨‍👩‍👧 等の結合に必要 |

---

## 4. 専ブラからの絵文字書き込みがWeb/専ブラで文字化けする

### 症状

- 専ブラから絵文字入りで書き込み → Webで見ると `&#128512;` が生テキスト表示される
- 専ブラから絵文字入りで書き込み → 専ブラで見ると本文の絵文字が `&#128512;` 表示（二重エスケープ）
- 専ブラから🕳️等の末尾注意型絵文字を書き込み → `�`（黒ダイヤに?）が付着する

Webから書き込んだ絵文字は問題なし。専ブラからの書き込みのみ発生。

### 原因

ChMate等の専ブラはShift_JIS非対応文字（絵文字）をHTML数値参照 `&#128512;` に変換してPOSTする。サーバー側の `decodeFormData`（Shift_JIS→UTF-8変換）はこれをそのままUTF-8テキスト `"&#128512;"` としてデコードし、DBに生テキストとして保存していた。

この結果:
- **Web閲覧**: ReactがテキストノードをHTMLエスケープするため `&#128512;` がそのまま画面に表示される
- **専ブラ閲覧（本文）**: DatFormatterの `escapeHtml` が `&` を `&amp;` に二重エスケープし、`&amp;#128512;` → 専ブラで `&#128512;` テキスト表示
- **専ブラ閲覧（スレタイ）**: スレタイは `escapeHtml` を経由しないため偶然正常表示（専ブラがHTMLとして解釈）

### 追加の罠: Variation SelectorのUTF-8生バイト送信

🕳️ のような末尾注意型絵文字の場合、ChMateは:
- 基底文字 U+1F573 → `&#128371;`（HTML数値参照）で送信
- Variation Selector U+FE0F → **HTML数値参照ではなくUTF-8生バイト（0xEF 0xB8 0x8F）で送信**

後者はShift_JISストリーム中の不正バイトとなり、`TextDecoder("shift_jis")` が `U+FFFD`（Replacement Character = `�`）に変換する。DBには `🕳�` のようなデータが保存され、閲覧時に `�` が付着して表示される。

### 対策

bbs.cgiの受信パス（`decodeFormData` 後、`PostService` 呼び出し前）で以下の処理を追加:

1. **HTML数値参照をUTF-8に逆変換**: `&#(\d+);` パターンを `String.fromCodePoint(N)` で元の文字に復元
2. **異体字セレクタのHTML数値参照を除去**: `&#65039;`（U+FE0F）/ `&#65038;`（U+FE0E）は空文字に置換
3. **U+FFFD（Replacement Character）を除去**: Shift_JISデコーダが挿入した不正文字の残骸を除去

これによりDBには常にUTF-8ネイティブの絵文字が保存される。閲覧時は既存の `sanitizeForCp932`（専ブラ向けDAT出力時）や React（Web表示時）が正しく処理する。

### 検証マトリクス

書き込み元 × 閲覧先 × フィールド × 絵文字種別 = 16パターンで検証した。

| 書き込み元 | 閲覧先 | 問題 |
|---|---|---|
| Web | Web / 専ブラ | なし（全8パターンOK） |
| 専ブラ | Web / 専ブラ | 修正前は7パターンNG、修正後は全OK |

---

## 5. 専ブラが想定するURL体系

### 症状

- スレッドURLをコピーすると `test/read.cgi/battleboard/...` になり、ブラウザで開けない
- 板URL `/battleboard/` が404になる
- `/kako/` へのアクセスが飛んでくる

### 原因

専ブラは5chのURL体系に基づいてURLを自動構築する:

| 用途 | 専ブラが構築するURL |
|---|---|
| 板トップ | `/{板ID}/` |
| スレッド閲覧 | `/test/read.cgi/{板ID}/{スレッドキー}/` |
| DAT取得 | `/{板ID}/dat/{スレッドキー}.dat` |
| 過去ログ | `/{板ID}/kako/{下位ディレクトリ}/{スレッドキー}.dat` |

DAT取得は実装済みでも、それ以外のURLにルートがないと不便な動作になる。

### 対策

- `/test/read.cgi/{板ID}/{スレッドキー}/` → Web UIのスレッドページにリダイレクト
- `/{板ID}/` → Web UIのスレッド一覧にリダイレクト
- `/kako/` → 未実装なら404で良いが、専ブラが解釈可能な形式で返す

専ブラ固有フォーマットが必要なエンドポイント（DAT、subject.txt等）以外はWeb UIにフォールバックするのが保守コスト的に合理的。

---

## まとめ: 専ブラ対応チェックリスト

- [ ] ホスティング環境がHTTP:80に直接応答できるか（Vercelは不可）
- [ ] Set-Cookieに`Secure` / `SameSite`を付けていないか
- [ ] 【閲覧時】Shift_JIS非対応文字をHTML数値参照に変換しているか
- [ ] 【閲覧時】異体字セレクタ(U+FE0F/U+FE0E)を除去しているか
- [ ] 【閲覧時】ZWJ(U+200D)を保持しているか
- [ ] 【書き込み受信時】専ブラからのHTML数値参照をUTF-8に逆変換しているか
- [ ] 【書き込み受信時】U+FFFD(Replacement Character)を除去しているか
- [ ] read.cgi / 板トップ / kako のURLにルートがあるか
- [ ] bbs.cgiのレスポンスHTMLがShift_JISで返されているか
- [ ] レスポンスのtitleタグが専ブラの成否判定に使える形式か

eddistのソースコードは専ブラ互換性の暗黙知の宝庫。迷ったらeddistと差分比較するのが最も確実な調査手段。
