# ChMate 用トークンと Web 用セッションの分離設計レポート

- 作成日: 2026-03-29
- 対象読者: 設計者、実装責任者、レビュー担当
- 目的: ChMate 互換性を維持したまま、認証情報漏えい時の被害半径を縮小する

## 1. 結論

BattleBoard では、`ChMate` 用トークンと `Web` 用セッションを**完全に分離**すべきである。

理由は単純である。ChMate 系の 5ch 互換通信は、実測上 `HTTP` を前提としており、`Secure` / `SameSite` 付き Cookie を利用できない。一方、現在の実装では `edge-token` が ChMate の `bbs.cgi` 書き込み認証にも、Web の `/api/mypage` や `/api/auth/pat` にも共通利用されている。この構成では、ChMate 経由で漏えいしたトークンが、単なる投稿なりすましを超えて、Web 側のアカウント操作にも直結する。

したがって、設計上の正解は「ChMate の HTTP 通信を安全なものとして扱う」ことではなく、「HTTP 上で漏えいしうる認証子に Web 権限を持たせない」ことである。

## 2. 背景

### 2.1 ChMate は HTTPS に固定できない

2026-03-16 の診断では、ChMate は `subject.txt` / `dat` / `bbs.cgi` を常に `http://` で要求し、`bbsmenu` に `https://` を記載しても `http://` にダウングレードすることが確認されている。

参照:

- `docs/research/senbra_protocol_diagnosis_2026-03-16.md`
- `docs/operations/runbooks/senbra_compat_guide.md`

このため、サーバー側のみで ChMate 通信を HTTPS に強制することはできない。

### 2.2 ChMate 互換のため Secure / SameSite を使えない

同じく互換性調査では、`bbs.cgi` レスポンスの `Set-Cookie` に `Secure` または `SameSite` を付与すると、ChMate が Cookie を保存しないことが確認されている。

このため、ChMate 書き込み継続性を優先する限り、HTTP 互換 Cookie には一般的な Web セキュリティ属性を付与できない。

## 3. 現状の問題

### 3.1 1つの `edge-token` が複数チャネルにまたがっている

現行実装では、`bbs.cgi` 互換ルートが `edge-token` Cookie を設定し、その同じ `edge-token` を Web API 側も利用している。

代表例:

- ChMate 互換側で `edge-token` を発行する
  - `src/app/(senbra)/test/bbs.cgi/route.ts`
- Web 側で同じ `edge-token` を認証に使う
  - `src/app/api/mypage/route.ts`
  - `src/app/api/auth/pat/route.ts`
  - `src/app/api/mypage/*`

これは「HTTP で露出する認証子」が「HTTPS 側のアカウント権限」にも通ることを意味する。

### 3.2 被害半径が大きい

現在の `edge-token` 漏えい時に起こりうる被害は、少なくとも次を含む。

- ChMate からのなりすまし投稿
- Web 側マイページ情報の取得
- `PAT` の取得
- `PAT` の再発行
- 各種マイページ系 API の操作

つまり、`bbs.cgi` の互換性のために受容した HTTP リスクが、そのまま Web アカウント全体のリスクに拡大している。

### 3.3 既存の補償策では足りない

現行設計には以下の補償策がある。

- 初回認証時の `Turnstile`
- `write_token` による追加確認
- `HttpOnly`

ただし、これらは主に**初回認証**を守る仕組みであり、**認証済みトークンの盗難後**には効きにくい。

特に、既存仕様では認証済み `edge-token` は IP 変化で失効せず、モバイル回線切替との両立を優先している。これは ChMate 継続利用には合理的だが、その代わりに「盗まれた認証済みトークンも有効なまま残る」ことを意味する。

## 4. 設計方針

### 4.1 認証をチャネル境界で分離する

認証方式を次の2系統に分離する。

#### A. ChMate 用認証

- 名称例: `bbs_write_token`
- 利用経路: `subject.txt`, `dat`, `bbs.cgi` などの専ブラ互換経路
- 想定通信: HTTP を含む
- セキュリティ前提: 漏えい可能性あり
- 許可権限: 投稿系の最小権限のみ

#### B. Web 用認証

- 名称例: `web_session`
- 利用経路: `/api/*`, `/mypage`, `/auth/*`
- 想定通信: HTTPS のみ
- セキュリティ前提: `Secure`, `SameSite`, 通常ブラウザ前提
- 許可権限: マイページ閲覧、設定変更、PAT 表示/再発行、登録操作など

重要なのは、**同一の認証子を両系統で使わない**ことである。

### 4.2 ChMate 用認証は「最小権限」に限定する

`bbs_write_token` に許可するのは次だけに絞る。

- スレッド作成
- レス投稿
- 必要であれば投稿系に付随する最小限の認証確認

逆に、以下はすべて禁止する。

- `/api/mypage` へのアクセス
- `PAT` の表示
- `PAT` の再発行
- ユーザー設定変更
- Web 専用の登録・回復 API

これにより、HTTP 上で `bbs_write_token` が漏れても、被害は「投稿権限」に閉じる。

### 4.3 Web 側は HTTPS セッションを前提にする

`web_session` は通常の Web セッションとして扱う。

- `Secure`
- `SameSite=Lax` または `Strict`
- `HttpOnly`
- 必要に応じて CSRF 対策

ここには ChMate 互換性を持ち込まない。ChMate 互換と Web セキュリティを同じトークンで両立させようとするから設計が破綻する。

## 5. 新しい責務分担

### 5.1 ChMate 認証サービス

責務:

- `bbs_write_token` の発行
- `bbs.cgi` 投稿時の認証
- `write_token` による step-up 認証
- 必要最小限の失効管理

非責務:

- Web セッション発行
- PAT 管理
- マイページ認証

### 5.2 Web 認証サービス

責務:

- `web_session` の発行と検証
- `mypage` 系 API の保護
- `PAT` 表示・再発行
- 本登録、ログイン、回復フロー

非責務:

- ChMate 投稿継続性の考慮
- HTTP 互換 Cookie の維持

## 6. 推奨するトークンモデル

### 6.1 `bbs_write_token`

特性:

- ChMate 専用
- 1デバイス単位で発行
- 短めの寿命
- 可能ならローテーションあり
- 権限スコープは `post:create`, `thread:create` のみ

保存先:

- `bbs_write_tokens` テーブル新設を推奨

主なカラム例:

- `id`
- `user_id`
- `token_hash`
- `scope`
- `created_at`
- `last_used_at`
- `expires_at`
- `client_type` (`chmate`, `siki`, `webview` など)
- `revoked_at`

### 6.2 `web_session`

特性:

- HTTPS ブラウザ専用
- Web 機能全般に使用
- `PAT` 系 API を含む
- 通常のセッションセキュリティを適用

保存先:

- 既存の Web 側セッション管理を利用
- 既存の `edge-token` を改名・再設計してもよいが、ChMate 側と共有しないことが条件

## 7. 認証フロー案

### 7.1 ChMate 初回書き込み

1. 未認証で `bbs.cgi` に投稿
2. サーバーが `bbs_write_token` 仮発行
3. `write_token` または既存の確認フローで step-up
4. 認証完了後、`bbs_write_token` を有効化
5. 以後の `bbs.cgi` 投稿では `bbs_write_token` のみ使用

このフローでは、`web_session` は一切出さない。

### 7.2 Web ログイン

1. Web UI で HTTPS ログイン
2. `web_session` 発行
3. `/api/mypage` や `/api/auth/pat` は `web_session` でのみ認可

### 7.3 PAT 取得・再発行

1. Web UI から HTTPS でアクセス
2. `web_session` 検証
3. 可能なら最近の再認証または step-up を要求
4. PAT を表示または再発行

`bbs_write_token` では絶対に通さない。

## 8. この設計で改善される点

### 8.1 最重要の改善

`ChMate` 側トークンが漏れても、`PAT` 奪取やマイページ侵害に直結しなくなる。

これは今回の設計変更で得られる最大の効果である。

### 8.2 互換性を壊さない

ChMate 側には引き続き以下を維持できる。

- HTTP 通信
- `Secure` / `SameSite` なし Cookie
- `bbs.cgi` ベースの書き込み継続

つまり、互換性の制約を認めつつ、影響範囲だけを狭められる。

### 8.3 Web 側の設計が素直になる

Web 側から ChMate 互換性制約を切り離せるため、以後の設計判断が明快になる。

- HTTPS 前提
- Browser 標準 Cookie 前提
- CSRF / step-up / recent login などを適用可能

## 9. トレードオフ

### 9.1 実装コストは増える

- トークンテーブルの分離
- 認証サービスの分離
- 既存 API の認証条件見直し
- 移行期間の互換処理

これは避けられない。

### 9.2 セッション統一性は失われる

「1つのトークンで全部使える」単純さは消える。

ただし、それは本来セキュリティ上の負債であり、失うべき単純さである。

### 9.3 ChMate の HTTP 自体は残る

この設計では、オンパス盗聴そのものは解決しない。

だが、被害を「投稿権限」に閉じ込めることで、受容可能なレベルに下げることが狙いである。

## 10. 移行方針

### Phase 1: Web 側 API から ChMate トークンを締め出す

最優先。

- `/api/mypage`
- `/api/auth/pat`
- `/api/mypage/*`

を `web_session` 専用に切り替える。

この時点で、HTTP 由来トークンから Web 権限を奪える。

### Phase 2: ChMate 用トークン導入

- `bbs_write_token` テーブル追加
- `bbs.cgi` を `bbs_write_token` で動かす
- 既存 `edge-token` 依存を段階的に除去

### Phase 3: 既存 `edge-token` の廃止または限定化

選択肢:

- 完全廃止して `bbs_write_token` / `web_session` に分離
- 既存 `edge-token` を Web 専用に再定義

設計としては前者が明快である。

## 11. 設計上の判断

本件は「ChMate を安全化する」問題ではない。

本質は、**HTTP 互換のために弱い前提を受け入れた認証子に、どこまで権限を持たせるか**である。

現在は権限が広すぎる。よって、設計上の改善点は通信路ではなく**権限境界**にある。

設計判断として推奨するのは以下である。

1. ChMate 用トークンと Web 用セッションを別物にする
2. ChMate 用トークンは投稿専用の最小権限に限定する
3. Web 側のアカウント機能は HTTPS セッションだけに乗せる
4. `PAT` は Web 専用資産として扱い、ChMate 側から到達不能にする

## 12. 推奨事項

この方針は、BattleBoard の認証モデルにおける優先度 `High` の設計変更として採用すべきである。

理由:

- ChMate 互換性を維持できる
- 漏えい時の被害半径を大幅に縮小できる
- 今後の Web セキュリティ改善を阻害しない
- 説明責任が明確になる

最小の要約は次の1文で足りる。

> HTTP を強制する ChMate と HTTPS を前提にできる Web を同一トークンで扱ってはならない。ChMate 側の認証子は投稿専用に閉じ込め、Web 側のアカウント権限は HTTPS セッションにのみ持たせるべきである。
