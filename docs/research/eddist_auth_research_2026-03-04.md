# Eddist 認証方式調査メモ（2026-03-04）

対象: `https://github.com/edginer/eddist`（`main` HEAD: `af4bbd0` 時点）

## 結論（要約）
- この掲示板の投稿認証は `edge-token` Cookie + `/auth-code`（6桁コード）を中心に構成されている。
- Cookie を削除しても同一人物に見えやすい主因は、ブラウザフィンガープリントではなく **IPベースの author_id_seed**。
- Cloudflare は必須依存ではないが、以下は利用可能:
  - `Cf-Connecting-IP` ヘッダ利用
  - Turnstile CAPTCHA
- 指紋採取系（FingerprintJS 等）のクライアント実装は確認できなかった。

## 認証フローの実装概要

### 1) 未認証投稿時
- 投稿時に有効トークンがない場合、サーバが認証コード (`auth_code`) と `auth_token` を作成し、`Unauthenticated` エラーを返す。
- 同時に `edge-token` を Set-Cookie する実装になっている。

根拠:
- `eddist-server/src/domain/service/bbscgi_auth_service.rs`
- `eddist-server/src/error.rs`

### 2) 認証コード入力（/auth-code）
- `/auth-code` に 6 桁コード + CAPTCHA 応答を送信。
- サーバ側でコードを照合し、有効化後に `edge-token` を維持/再設定。

根拠:
- `eddist-server/src/routes/auth_code.rs`
- `eddist-server/src/services/auth_with_code_service.rs`

## 「Cookie削除後も同一人物トラッキング」に見える理由

### 1) 投稿者ID seed が IP ベース
- `author_id_seed` は `sha512(reduced_ip)` で生成される。
- そのため同一回線（同一 reduced_ip）なら、新規トークンを取り直しても seed が一致しやすい。

根拠:
- `eddist-server/src/domain/authed_token.rs`

### 2) 表示される投稿IDの生成が seed + 日付ベース
- `get_author_id_by_seed` は `year-month-day + board_key + seed` 由来で ID を生成。
- 日付が同じで seed が同じなら、同じ板では同一IDになりやすい。

根拠:
- `eddist-server/src/domain/res.rs`

### 3) UA は現行の ID 生成では未使用
- `get_author_id_with_device_info` は UA パラメータを受ける設計だが、現行呼び出しは `None` を渡している。
- 実質的に IP 起点の安定化が中心。

根拠:
- `eddist-server/src/domain/res.rs`

## Cloudflare 機能の扱い

### 1) クライアントIP取得
- `Cf-Connecting-IP` を優先、なければ `X-Forwarded-For` を使用。
- Cloudflare 専用の固定実装ではなく、一般的なリバースプロキシ構成でも動く。

根拠:
- `eddist-server/src/utils.rs`

### 2) CAPTCHA
- Turnstile を first-class provider としてサポート。
- `captcha-config.example.json` で Turnstile, hCaptcha, monocle, custom が例示される。

根拠:
- `eddist-server/src/domain/captcha_like.rs`
- `eddist-server/src/repositories/captcha_config_repository.rs`
- `captcha-config.example.json`

### 3) 環境変数
- `.docker-compose.env` には Cloudflare 利用を示唆する説明がある（IPヘッダ・ASNヘッダ）。
- ただし `USE_CLOUDFLARE_CDN` 自体はコード上で直接参照を確認できず、実質はヘッダ構成依存。

根拠:
- `.docker-compose.env`
- `eddist-server/src/utils.rs`

## フィンガープリント実装の有無
- リポジトリ内で、FingerprintJS などの明示的なブラウザ指紋採取実装は確認できなかった。
- `monocle`（Spur）連携はあるが、これは CAPTCHA/不正アクセス評価の文脈で、投稿者ID生成の主キーとして直接使っていない。

根拠:
- `eddist-server/src/external/captcha_like_client.rs`
- `eddist-server/src/services/auth_with_code_service.rs`
- `eddist-server/resources/templates/auth-code.get.hbs`

## 参考URL（一次情報）
- リポジトリ: <https://github.com/edginer/eddist>
- 主要ファイル:
  - <https://github.com/edginer/eddist/blob/main/eddist-server/src/domain/service/bbscgi_auth_service.rs>
  - <https://github.com/edginer/eddist/blob/main/eddist-server/src/error.rs>
  - <https://github.com/edginer/eddist/blob/main/eddist-server/src/routes/auth_code.rs>
  - <https://github.com/edginer/eddist/blob/main/eddist-server/src/domain/authed_token.rs>
  - <https://github.com/edginer/eddist/blob/main/eddist-server/src/domain/res.rs>
  - <https://github.com/edginer/eddist/blob/main/eddist-server/src/utils.rs>
  - <https://github.com/edginer/eddist/blob/main/captcha-config.example.json>
  - <https://github.com/edginer/eddist/blob/main/.docker-compose.env>
