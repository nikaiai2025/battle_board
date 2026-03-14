# TASK-054: ChMate edge-token Cookie永続化問題 — 根本原因分析と設計提案

> 作成: 2026-03-15 アーキテクトAI
> 分類: 調査・設計（実装なし）

---

## 1. エグゼクティブサマリ

ChMateがbbs.cgiレスポンスのSet-Cookieからedge-tokenを保持しない根本原因は、**Cookie名ではなく、レスポンスのHTMLフォーマットにある**。

eddist（5ch互換掲示板の参考実装）は `edge-token` という同名Cookieを使用しており、ChMateはこれを正常に保持している。BattleBoardでCookieが保持されないのは、**初回書き込み時のレスポンスHTMLが5chプロトコル標準の形式に従っていないため、ChMateのHTTPクライアントがSet-Cookieを処理しない**と推定される。

推奨解決策は **5chプロトコル標準の「書き込み確認フロー（2フェーズコミット）」の実装**であり、write_tokenの仕様（ワンタイム・10分有効）を変更する必要はない。

---

## 2. 根本原因の分析

### 2.1 TASK-052分析の誤った前提

前回分析（TASK-052）は以下の前提に立っていた:

> ChMateは5chプロトコル標準のCookie（`PON`, `PREN` 等）は保持するが、独自Cookie名は無視する。

**この前提は誤りである。** 根拠:

- eddistは `edge-token` というBattleBoardと同名のCookie名を使用している（`eddist-server/src/routes/bbs_cgi.rs`）
- eddistは実稼働中の5ch互換掲示板であり、ChMateから利用されている
- eddistのbbs.cgiは初回POSTで `edge-token` を Set-Cookie で発行し、ChMateはこれを保持して以降のリクエストに含めている

**参照**: `docs/research/eddist_edge_token_ip_report_2026-03-14.md`
> `edge-token`が無い投稿では`AuthedToken`を新規作成し、[...] **レスポンスに`edge-token`クッキーをセット**する。

### 2.2 真の根本原因: レスポンスHTMLフォーマットの非準拠

ChMateのbbs.cgi用HTTPクライアントは、レスポンスHTMLの `<title>` タグでトランザクション状態を判定する（パターンマッチング方式）。5chプロトコルで定義された状態は以下の4つのみ:

| 状態 | `<title>` 文字列 | ChMateの挙動 |
|---|---|---|
| 書き込み成功 | `書きこみました` | 書き込み完了処理。Cookie保持 |
| エラー | `ＥＲＲＯＲ` | エラーポップアップ表示 |
| **書き込み確認** | **`書き込み確認`** | **Set-CookieをCookie Jarに保存し、同一POSTを自動再送** |
| サーバー高負荷 | `お茶でも飲みましょう。` | クールダウン |

**参照**: `docs/old/research_by_3.1pro.md` L104-108

BattleBoardの現在の認証案内レスポンスは:

```html
<title>認証が必要です</title>
```

**この `<title>` はChMateの既知パターンのいずれにも一致しない。** ChMateは不明な `<title>` を持つレスポンスに対して:

1. トランザクション状態を確定できず、エラーとして扱う
2. **Set-Cookieヘッダを処理しない**（書き込み確認フローのtitleマッチがトリガーになっていないため）
3. 結果として edge-token Cookie が永続化されない

### 2.3 eddistで動作する理由

eddistのbbs.cgiは5chプロトコル標準に忠実な以下のフローで動作している:

```
1. POST → edge-token未送信
2. サーバー: edge-token新規発行 + Set-Cookie: edge-token=xxx
3. レスポンス: <title>書き込み確認</title>（5chプロトコル標準）
4. ChMate: Set-CookieをCookie Jarに保存 ← ★ここがポイント
5. ChMate: 同一POSTを自動再送（Cookie: edge-token=xxx 付き）
6. サーバー: edge-token検証 → 未認証 → 認証案内（またはそのまま書き込み成功）
```

**ChMateが `<title>書き込み確認</title>` を検知した時にのみ、Set-CookieをCookie Jarに保存する**仕組みである。これは5chプロトコルの標準動作であり、Cookie名のホワイトリストは関係ない。

### 2.4 BattleBoardの現在のフローと問題点

```
1. POST → edge-token未送信
2. サーバー: edge-token新規発行 + Set-Cookie: edge-token=xxx
3. レスポンス: <title>認証が必要です</title>（非標準title）
4. ChMate: 不明なtitleのためSet-Cookieを処理しない ← ★ここで失敗
5. edge-token Cookie が保持されない
6. 次回POST → edge-token未送信 → 再び認証案内 → 無限ループ
```

---

## 3. 5ch本家のCookie発行フロー整理

### 3.1 書き込み確認フロー（2フェーズコミット）の標準仕様

**参照**: `docs/old/research_by_3.1pro.md` L85-96, `docs/research/research_merged.md` L80

```
Phase 1: Cookie発行
  1. 専ブラがbbs.cgiにPOST（Cookie未送信）
  2. サーバーがSet-Cookie + <title>書き込み確認</title> を返す
  3. 専ブラがCookieを保存

Phase 2: 書き込み実行
  4. 専ブラが同一POSTを自動再送（Cookie付き）
  5. サーバーがCookieを検証して書き込みを実行
  6. <title>書きこみました</title> を返す
```

### 3.2 5ch標準のCookie名

5ch本家で使用されるCookie名:
- `PON`: セッショントークン（書き込み確認で発行）
- `SPID`: セッションID
- `HAP`: 認証関連

eddistでは独自の `edge-token` Cookie名を使用しているが、ChMateは問題なく保持している。**Cookie名ではなく、`<title>書き込み確認</title>` というレスポンスパターンがCookie保存のトリガー**である。

### 3.3 専ブラの自動再送時のPOSTパラメータ

**参照**: `docs/old/research_by_3.1pro.md` L93
> 専用ブラウザは返却されたHTMLをパースして確認画面であることを検知し、発行されたCookieをローカルストレージに保存した上で、**直ちにそのCookieを付与して全く同じPOSTリクエストを自動再送信する。**

自動再送時のPOSTパラメータは**完全に同一**。mail欄の内容（write_tokenを含む）もそのまま再送される。

---

## 4. 設計提案: 書き込み確認フローによるCookie永続化

### 4.1 基本方針

**write_tokenの仕様（ワンタイム・10分有効）を一切変更せずに、5chプロトコル標準の書き込み確認フローでedge-token Cookieを永続化する。**

### 4.2 フロー設計

#### ケースA: 初回書き込み（完全未認証）

```
1. ChMate → POST bbs.cgi（Cookie無し、write_token無し）
2. サーバー:
   - edge-token新規発行（is_verified=false）
   - 認証コード発行
   - Set-Cookie: edge-token=xxx
   - レスポンス: <title>書き込み確認</title>
     ※ HTMLボディに認証案内情報を含める
3. ChMate:
   - <title>書き込み確認</title> を検知
   - Set-Cookie を Cookie Jar に保存 ★ Cookie永続化成功
   - 同一POSTを自動再送（Cookie: edge-token=xxx 付き）
4. サーバー:
   - edge-token検証 → is_verified=false → 認証未完了
   - レスポンス: <title>ＥＲＲＯＲ</title>
     ※ 「認証が必要です」+ 認証コード + 認証URL を表示
5. ChMate: エラーポップアップで認証案内を表示
6. ユーザーがブラウザで認証を完了 → write_token取得
```

#### ケースB: write_token付き書き込み（認証完了後の初回）

```
1. ChMate → POST bbs.cgi（Cookie: edge-token=xxx、mail: sage#<write_token>）
2. サーバー:
   - edge-token検証 → Cookie有り → is_verified確認
   - write_token検出・検証 → 成功（ワンタイム消費）
   - edge-tokenのis_verifiedをtrueに更新
   - 書き込み実行
   - レスポンス: <title>書きこみました</title>
3. ChMate: 書き込み成功処理
```

#### ケースC: 2回目以降の書き込み（Cookie永続化済み）

```
1. ChMate → POST bbs.cgi（Cookie: edge-token=xxx、mail: sage）
2. サーバー:
   - edge-token検証 → 有効（is_verified=true）
   - 書き込み実行
   - レスポンス: <title>書きこみました</title>
3. ChMate: 書き込み成功処理
```

#### ケースD: Cookie喪失時のリカバリ（アプリ再インストール等）

```
1. ChMate → POST bbs.cgi（Cookie無し、mail: sage）
2. → ケースAと同じフローで再度Cookie永続化
3. ユーザーは再認証が必要（write_tokenは既にワンタイム消費済み）
```

### 4.3 書き込み確認レスポンスの仕様

```html
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>書き込み確認</title>
</head>
<body>
書き込み確認<br>
内容を確認してください。<br>
<!-- 2ch_X:cookie -->
</body>
</html>
```

**必須要素:**
- `<title>書き込み確認</title>`: ChMateがこのtitleで書き込み確認フローを認識する
- `<!-- 2ch_X:cookie -->`: 一部の専ブラが参照するコメントタグ（任意だが推奨）

**Set-Cookieヘッダ:**
```
Set-Cookie: edge-token=<UUID>; HttpOnly; SameSite=Lax; Max-Age=2592000; Path=/
```
（本番環境では `Secure` も付加）

### 4.4 bbs.cgi route.ts の処理フロー変更

```
POST /test/bbs.cgi
  |
  +-- Cookie に edge-token あり?
  |   +-- YES: edge-token検証
  |   |   +-- valid=true (is_verified=true): 通常書き込みフロー
  |   |   +-- not_verified: 認証エラー（ＥＲＲＯＲ）
  |   |   +-- not_found: 不正Cookie → 新規扱い（下のNOへ）
  |   |
  |   +-- NO: ★ 書き込み確認フロー起動
  |       +-- edge-token新規発行
  |       +-- 認証コード発行
  |       +-- レスポンス: <title>書き込み確認</title> + Set-Cookie: edge-token
  |       |
  |       +-- [ChMateが自動再送]
  |       +-- 再送時: Cookie に edge-token あり → 上のYES分岐へ
  |           +-- is_verified=false → ＥＲＲＯＲ（認証案内）
  |
  +-- mail欄に write_token あり?（edge-tokenがある場合のみ検査）
      +-- YES: write_token検証
      |   +-- 有効: is_verified=true更新 → 書き込み実行
      |   +-- 無効: ＥＲＲＯＲ
      +-- NO: edge-tokenのis_verifiedで判定（通常フロー）
```

### 4.5 自動再送ループの防止

書き込み確認レスポンスは**edge-token Cookie未送信の場合にのみ**返す。自動再送（2回目のPOST）ではCookieが付与されるため、書き込み確認は1回で完了する。無限ループは発生しない。

```
1回目 POST: Cookie無し → 書き込み確認 + Set-Cookie
2回目 POST: Cookie有り → 通常分岐（認証済みなら成功、未認証ならエラー）
```

### 4.6 認証案内の表示方法

自動再送後の2回目POSTで `is_verified=false` の場合、認証エラーとして認証案内を返す:

```html
<title>ＥＲＲＯＲ</title>
...
ERROR: 認証が必要です
書き込みにはブラウザでの認証が必要です。
【認証コード】048293
【認証URL】https://example.com/auth/verify?code=048293&token=xxx
```

`<title>ＥＲＲＯＲ</title>` を使うことで、ChMateがエラーポップアップとして認証案内を表示する。これは5chプロトコル標準のエラーハンドリングである。

### 4.7 既存レスポンスとの互換性

| 現在のtitle | 変更後 | 理由 |
|---|---|---|
| `認証が必要です` | `ＥＲＲＯＲ`（認証案内を含むエラー） | ChMateが認識できる標準エラー形式に変更 |
| `書きこみました` | 変更なし | 成功レスポンスは現行通り |
| `ＥＲＲＯＲ` | 変更なし | エラーレスポンスは現行通り |
| (新規) | `書き込み確認` | Cookie永続化のための新規レスポンス |

---

## 5. write_token仕様との整合性確認

### 5.1 ワンタイム性: 維持

write_tokenはケースBでのみ使用され、検証成功時にワンタイム消費される。書き込み確認フロー（ケースA）ではwrite_tokenは関与しない。

### 5.2 有効期限10分: 維持

write_tokenの有効期限は変更しない。ユーザーは認証完了後10分以内にwrite_token付きで書き込めばよい。

### 5.3 mail欄の自由度: 完全に維持

- ケースA（初回）: mail欄の内容は無関係（書き込み確認フローが起動）
- ケースB（write_token使用）: mail欄に `sage#<write_token>` を入れるのは1回のみ
- ケースC（2回目以降）: mail欄は完全に自由（sage、メールアドレス等何でも可）

**人間の指摘「メールアドレス欄が実質使用不可能になるデメリット」は完全に解消される。** write_tokenをmail欄に入れるのは認証直後の1回だけであり、Cookie永続化成功後はmail欄を自由に使える。

---

## 6. リスク分析

### 6.1 書き込み確認フローがChMateで動作するか

**リスク: 低**

根拠:
- 5chプロトコルの標準機能であり、ChMateの中核機能
- eddistが同名Cookie（edge-token）で運用実績あり
- `docs/old/research_by_3.1pro.md` に詳細な動作仕様が記載済み

**ただし、実機検証は必須。** 以下の点を検証する:
- `<title>書き込み確認</title>` でChMateが自動再送するか
- 自動再送時にSet-CookieのCookieが付与されるか
- 自動再送時にPOSTパラメータ（mail欄含む）がそのまま再送されるか

### 6.2 Web UIへの影響

**リスク: なし**

Web UIはFetch APIを使用しており、Set-Cookieヘッダは自動的にCookie Jarに保存される。書き込み確認フローはCookie未送信の場合にのみ発動するため、Web UI（常にCookieを送信する）には影響しない。

### 6.3 Sikiへの影響

**リスク: 低**

Sikiも5chプロトコル標準の書き込み確認フローに対応している（`docs/old/research_by_3.1pro.md` L108）。ただし実機検証は推奨。

### 6.4 認証案内の表示方法変更（ＥＲＲＯＲ title使用）

**リスク: 中**

認証案内を `<title>ＥＲＲＯＲ</title>` で返す変更は、Web UIの認証フローに影響する可能性がある。ただし:
- Web UIの認証フローはbbs.cgiではなく `/api/threads` 等を使用
- bbs.cgiのHTMLレスポンスは専ブラのみが使用
- 影響範囲は専ブラ経路に限定

---

## 7. 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/app/(senbra)/test/bbs.cgi/route.ts` | Cookie未送信時に書き込み確認レスポンスを返す分岐を追加 |
| `src/lib/infrastructure/adapters/bbs-cgi-response.ts` | `buildWriteConfirm()` メソッド追加、`buildAuthRequired()` のtitleを `ＥＲＲＯＲ` に変更 |
| `src/lib/constants/cookie-names.ts` | 変更なし |
| `src/lib/services/auth-service.ts` | 変更なし（write_token仕様維持） |

**変更規模: 約30-50行**

---

## 8. BDDシナリオ変更の要否

### 8.1 変更が必要なシナリオ

**「専ブラからの初回書き込みで認証案内が返される」** の振る舞いが変わる:
- 現在: 直接認証案内HTMLが返される
- 変更後: 書き込み確認（Cookie発行）→ 自動再送 → 認証エラー（認証案内）の2段階

```gherkin
# 変更前
Scenario: 専ブラからの初回書き込みで認証案内が返される
  Given ユーザーが専ブラで未認証である
  When bbs.cgiに書き込みをPOSTする
  Then レスポンスに認証コードと認証ページURLが含まれる
  And edge-token Cookieが発行される

# 変更後（案）
Scenario: 専ブラからの初回書き込みでCookieが発行され認証案内が返される
  Given ユーザーが専ブラで未認証である
  When bbs.cgiに書き込みをPOSTする
  Then 書き込み確認レスポンスでedge-token Cookieが発行される
  And 専ブラが自動再送した後にエラーレスポンスとして認証案内が返される
  And 認証コードと認証ページURLがエラー内容に含まれる
```

### 8.2 追加が望ましいシナリオ

```gherkin
Scenario: Cookie未送信の専ブラには書き込み確認レスポンスが返される
  Given 専ブラがedge-token Cookieを保持していない
  When bbs.cgiに書き込みをPOSTする
  Then レスポンスのtitleタグに "書き込み確認" が含まれる
  And edge-token CookieがSet-Cookieで発行される
```

### 8.3 人間承認が必要

上記のシナリオ変更・追加は **ユーザーから見た振る舞いが変わる** ため、人間の承認が必要。ただし、ユーザーの最終的な体験（認証案内が表示される → 認証後に書き込みできる）は変わらない。変わるのは内部的なHTTPトランザクションの段数のみ。

---

## 9. 結論

### 問いへの回答

**Q: ChMateがbbs.cgiのSet-Cookieからedge-tokenを保持しない根本原因は何か**

A: Cookie名の問題ではない。ChMateのHTTPクライアントは、`<title>書き込み確認</title>` というレスポンスパターンをトリガーとしてSet-CookieをCookie Jarに保存する。BattleBoardは `<title>認証が必要です</title>` という非標準titleを返しているため、ChMateがSet-Cookieを処理しない。

**Q: 5chプロトコル標準の「書き込み確認フロー（2フェーズコミット）」でCookie永続化は実現できるか**

A: 実現できる。書き込み確認フローは5chプロトコルの標準機能であり、ChMateを含む主要専ブラの中核機能として実装されている。eddistがedge-token Cookie名でこのフローを使用し、運用実績がある。

**Q: write_tokenの仕様（ワンタイム・10分有効）を変更せずに問題を解決できるか**

A: 解決できる。書き込み確認フローはwrite_tokenとは独立したメカニズムであり、Cookie永続化のみを担当する。write_tokenは認証橋渡しの役割を維持し、仕様変更は不要。

### 推奨アクション

1. **実機検証**: ChMateで `<title>書き込み確認</title>` + Set-Cookie: edge-token のレスポンスが正しくCookie保存と自動再送を引き起こすか検証する
2. **BDDシナリオ変更の人間承認**: 上記 8.1, 8.2 のシナリオ変更案を人間に提示し承認を得る
3. **実装**: 承認後、bbs.cgi route.ts と bbs-cgi-response.ts を変更する（約30-50行）
