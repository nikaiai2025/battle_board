# eddist edge-token IP挙動レポート (2026-03-14)

**目的**: eddistの`edge-token`ユーザー認証における「同一クッキー保持者が異なるIPでアクセスした場合」の実装挙動を調査し、スマホのWiFi切替ユースケースを中心に整理する。

**主な結論**
- `edge-token`が有効化済みであれば、IPが変わっても投稿処理は継続できる。IP不一致によるトークン無効化や再認証要求は実装されていない。`eddist-server/src/domain/service/bbscgi_auth_service.rs`
- ただし、**認証コード(6桁)の「有効化」時はIP一致チェックが入る**ため、WiFi切替などでIPが変わると有効化に失敗する可能性がある（通常の`/auth-code`フロー）。`eddist-server/src/services/auth_with_code_service.rs`
- レート制限は「トークン生成時のreduced IP」と「現在IP」の両方で評価され、IP変更で制限を回避しにくい設計になっている。`eddist-server/src/services/res_creation_service.rs`, `eddist-server/src/domain/service/res_creation_span_management_service.rs`

**実装ポイント（IP関連の主要経路）**
1. **トークン発行(未認証状態の生成)**
- `edge-token`が無い投稿では`AuthedToken`を新規作成し、`origin_ip`と`reduced_origin_ip`を保存。`validity=false`のまま`Unauthenticated`を返し、**レスポンスに`edge-token`クッキーをセット**する。`eddist-server/src/domain/service/bbscgi_auth_service.rs`, `eddist-server/src/routes/bbs_cgi.rs`, `eddist-server/src/repositories/bbs_repository.rs`

2. **認証コード有効化（通常の/auth-code）**
- `auth_code`で未認証トークンを取得後、**`ReducedIpAddr`の一致チェック**を実施。IP不一致なら`FailedToFindAuthedToken`扱いで失敗。`eddist-server/src/services/auth_with_code_service.rs`, `eddist-core/src/domain/ip_addr.rs`
- CAPTCHAプロバイダがIP検証を内蔵する場合（例: `monocle`）は成功時にローカルIPチェックを省略。ただし**プロバイダ側がIP不一致を返した場合はローカルIPチェックにフォールバックして失敗**する。`eddist-server/src/services/auth_with_code_service.rs`

3. **認証コード有効化（ユーザー登録済みの/user/api/auth-code）**
- `auth_code`の有効性だけを見てトークンを有効化し、**IP一致チェックは存在しない**。`eddist-server/src/services/auth_with_code_user_page_service.rs`
- 既存ユーザーのID継続のため、旧トークンの`author_id_seed`を新トークンにコピーする。`eddist-server/src/services/auth_with_code_user_page_service.rs`

4. **投稿時のトークン検証**
- 有効トークンの検証は「存在確認+validity」のみで**IP一致チェックなし**。IPが変わっても投稿は可能。`eddist-server/src/domain/service/bbscgi_auth_service.rs`
- トークンが見つからない場合は`InvalidAuthedToken`でクッキーを削除するが、IP変化自体は無関係。`eddist-server/src/routes/bbs_cgi.rs`

5. **レート制限とIPの関係**
- 投稿レート制限は`authed_token.reduced_ip`（トークン生成時のIP）と「現在IP」の両方をキーとしてチェックする。`eddist-server/src/services/res_creation_service.rs`, `eddist-server/src/domain/service/res_creation_span_management_service.rs`
- そのため、**IPを変えても過去IP側の制限は継続**し、現在IP側の制限も新規に付与される。

6. **著者ID(投稿ID)とIP**
- `author_id_seed`はトークン生成時の`reduced_ip`から生成される。`eddist-server/src/domain/authed_token.rs`
- 投稿IDの生成で`reduced_ip`が使われるため、**同一トークンでIPが変わっても投稿IDは旧IP由来で安定**する。`eddist-server/src/domain/res.rs`

**スマホのWiFi切替ユースケース（想定挙動）**
- **ケースA: 認証コードの有効化前にIPが変わる**
  - 投稿→`edge-token`発行→`/auth-code`で認証、という通常フロー中にWiFiが切り替わると、`ReducedIpAddr`不一致で**認証コードが失敗**する可能性が高い。
  - v4環境では`ReducedIpAddr`がフルIPのため、IP変更は即不一致。v6では先頭4セグメント一致なら通る可能性がある。`eddist-core/src/domain/ip_addr.rs`

- **ケースB: すでに有効化済みのedge-tokenでIPが変わる**
  - 投稿自体は継続でき、**IP変更による再認証要求は発生しない**。`eddist-server/src/domain/service/bbscgi_auth_service.rs`
  - レート制限は旧IP由来キーと新IP由来キーの両方で評価されるため、**切替で制限回避はしにくい**。`eddist-server/src/services/res_creation_service.rs`
  - 投稿IDは旧IP由来の`author_id_seed`を使うため、**同一トークン内ではIDが安定**する。`eddist-server/src/domain/authed_token.rs`, `eddist-server/src/domain/res.rs`

**補足/注意点**
- `get_authed_token_by_origin_ip_and_auth_code`は実装されているが、現行フローでは使用箇所が見当たらない。`eddist-server/src/repositories/bbs_repository.rs`
- IP取得は`Cf-Connecting-IP`または`X-Forwarded-For`依存。プロキシ構成次第でIP評価が変わる。`eddist-server/src/utils.rs`

**まとめ**
- **IP変更は「有効化フェーズ」でのみ問題化**し、**有効化後の投稿は継続可能**。
- WiFi切替で問題が出るのは「認証コード入力前後にIPが変わる」ケースで、通常の`/auth-code`フローでは失敗しうる。
- 既存ユーザーの`/user/api/auth-code`フローはIP非依存で、有効化が通りやすい。
