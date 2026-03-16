# 専ブラ HTTP/HTTPS プロトコル診断レポート

- 調査日: 2026-03-16
- 調査方法: `npx wrangler tail battle-board` によるリアルタイムログ + ルートハンドラへの診断ログ埋め込み
- 対象Worker: `battle-board.shika.workers.dev`
- bbsmenu設定: `NEXT_PUBLIC_BASE_URL = "https://battle-board.shika.workers.dev"`（https指定済み）

## 目的

専ブラがHTTP/HTTPSのどちらで接続しているかを確定し、Cookie属性（Secure等）の設計判断の根拠とする。

## 診断ログの仕込み

subject.txt、bbs.cgi、dat の各ルートハンドラ先頭に以下を埋め込み:

```typescript
console.log("[diag:subject.txt]", {
  url: req.url,
  scheme: new URL(req.url).protocol,
  xForwardedProto: req.headers.get("x-forwarded-proto"),
  host: req.headers.get("host"),
  userAgent: req.headers.get("user-agent"),
});
```

## テスト結果

### ChMate（Android専ブラ）

- バージョン: 2chMate/0.8.10.241
- 端末: Android 14 (A203SO)
- UserAgent: `Monazilla/1.00 2chMate/0.8.10.241 Dalvik/2.1.0 (Linux; U; Android 14; A203SO Build/63.2.D.1.151)`

| 操作 | URL | scheme | x-forwarded-proto |
|---|---|---|---|
| GET subject.txt | `http://battle-board.shika.workers.dev/battleboard/subject.txt` | `http:` | `http` |
| POST bbs.cgi (スレッド作成) | `http://battle-board.shika.workers.dev/test/bbs.cgi?guid=ON` | `http:` | `http` |
| POST bbs.cgi (書き込み) | `http://battle-board.shika.workers.dev/test/bbs.cgi?guid=ON` | `http:` | `http` |
| GET dat/*.dat (レス読み込み) | `http://battle-board.shika.workers.dev/battleboard/dat/*.dat` | `http:` | `http` |
| GET SETTING.TXT | `http://battle-board.shika.workers.dev/battleboard/SETTING.TXT` | `http:` | `http` |

**結果: 全リクエストが HTTP。bbsmenuに https:// を記載してもChMateは http:// にダウングレードする。**

### Siki（PC専ブラ / ブラウザベース）

- UserAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36`

| 操作 | URL | scheme | x-forwarded-proto |
|---|---|---|---|
| GET subject.txt | `https://battle-board.shika.workers.dev/battleboard/subject.txt` | `https:` | `https` |
| POST bbs.cgi (スレッド作成) | `https://battle-board.shika.workers.dev/test/bbs.cgi` | `https:` | `https` |
| POST bbs.cgi (書き込み) | `https://battle-board.shika.workers.dev/test/bbs.cgi` | `https:` | `https` |
| GET dat/*.dat (レス読み込み) | `https://battle-board.shika.workers.dev/battleboard/dat/*.dat` | `https:` | `https` |

**結果: 全リクエストが HTTPS。**

### Web UI（ブラウザ直接アクセス）

| 操作 | scheme |
|---|---|
| /api/* | `https:` |
| /mypage | `https:` |
| /auth/verify | `https:` |

**結果: 全リクエストが HTTPS。**

## 結論

| クライアント | プロトコル | bbsmenuのhttps指定を尊重するか |
|---|---|---|
| **ChMate** (Android) | **常に HTTP** | しない（http:// にダウングレード） |
| **Siki** (PC/ブラウザベース) | **常に HTTPS** | する |
| **Web UI** (ブラウザ) | **常に HTTPS** | N/A |

## 設計への影響

1. **Cookie の `Secure` 属性は付与してはならない** — ChMateがHTTPで接続するため、Secure付きCookieは送信されず認証が機能しなくなる
2. **HTTP → HTTPS リダイレクトを強制してはならない** — ChMateが動作しなくなる可能性がある
3. **Cookie の `SameSite` は未設定または `Lax`** — クロスサイト制限で専ブラが弾かれないようにする

## 副次的発見

- `wrangler.toml` の `[vars]` に `NEXT_PUBLIC_BASE_URL = "http://localhost:3000"` が残っていたため、デプロイのたびに本番環境変数が上書きされていた
  - 修正: `wrangler.toml` を本番値に変更、ローカル開発用は `.dev.vars` に分離

## 生ログ

<details>
<summary>ChMate ログ（17:07:27 〜 17:15:28）</summary>

```
GET http://battle-board.shika.workers.dev/battleboard/subject.txt - Ok @ 2026/3/16 17:07:27
  (log) [diag:subject.txt] {
  url: 'http://battle-board.shika.workers.dev/battleboard/subject.txt',
  scheme: 'http:',
  xForwardedProto: 'http',
  host: 'battle-board.shika.workers.dev',
  userAgent: 'Monazilla/1.00 2chMate/0.8.10.241 Dalvik/2.1.0 (Linux; U; Android 14; A203SO Build/63.2.D.1.151)'
}
POST http://battle-board.shika.workers.dev/test/bbs.cgi?guid=ON - Ok @ 2026/3/16 17:07:49
  (log) [diag:bbs.cgi] {
  url: 'http://battle-board.shika.workers.dev/test/bbs.cgi?guid=ON',
  scheme: 'http:',
  xForwardedProto: 'http',
  host: 'battle-board.shika.workers.dev',
  userAgent: 'Monazilla/1.00 2chMate/0.8.10.241 Dalvik/2.1.0 (Linux; U; Android 14; A203SO Build/63.2.D.1.151)'
}
GET http://battle-board.shika.workers.dev/battleboard/dat/1773648469.dat - Ok @ 2026/3/16 17:07:51
  (log) [diag:dat] {
  url: 'http://battle-board.shika.workers.dev/battleboard/dat/1773648469.dat',
  scheme: 'http:',
  xForwardedProto: 'http',
  host: 'battle-board.shika.workers.dev',
  userAgent: 'Monazilla/1.00 2chMate/0.8.10.241 Dalvik/2.1.0 (Linux; U; Android 14; A203SO Build/63.2.D.1.151)'
}
POST http://battle-board.shika.workers.dev/test/bbs.cgi?guid=ON - Ok @ 2026/3/16 17:07:58
  (log) [diag:bbs.cgi] {
  url: 'http://battle-board.shika.workers.dev/test/bbs.cgi?guid=ON',
  scheme: 'http:',
  xForwardedProto: 'http',
  host: 'battle-board.shika.workers.dev',
  userAgent: 'Monazilla/1.00 2chMate/0.8.10.241 Dalvik/2.1.0 (Linux; U; Android 14; A203SO Build/63.2.D.1.151)'
}
```
</details>

<details>
<summary>Siki ログ（17:16:52 〜 17:17:41）</summary>

```
GET https://battle-board.shika.workers.dev/battleboard/subject.txt - Ok @ 2026/3/16 17:16:52
  (log) [diag:subject.txt] {
  url: 'https://battle-board.shika.workers.dev/battleboard/subject.txt',
  scheme: 'https:',
  xForwardedProto: 'https',
  host: 'battle-board.shika.workers.dev',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
}
POST https://battle-board.shika.workers.dev/test/bbs.cgi - Ok @ 2026/3/16 17:17:09
  (log) [diag:bbs.cgi] {
  url: 'https://battle-board.shika.workers.dev/test/bbs.cgi',
  scheme: 'https:',
  xForwardedProto: 'https',
  host: 'battle-board.shika.workers.dev',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
}
GET https://battle-board.shika.workers.dev/battleboard/dat/1773649029.dat - Ok @ 2026/3/16 17:17:13
  (log) [diag:dat] {
  url: 'https://battle-board.shika.workers.dev/battleboard/dat/1773649029.dat',
  scheme: 'https:',
  xForwardedProto: 'https',
  host: 'battle-board.shika.workers.dev',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
}
POST https://battle-board.shika.workers.dev/test/bbs.cgi - Ok @ 2026/3/16 17:17:37
  (log) [diag:bbs.cgi] {
  url: 'https://battle-board.shika.workers.dev/test/bbs.cgi',
  scheme: 'https:',
  xForwardedProto: 'https',
  host: 'battle-board.shika.workers.dev',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
}
```
</details>
