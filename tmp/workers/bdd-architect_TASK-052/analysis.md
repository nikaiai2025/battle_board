# TASK-052: ChMate毎回認証問題の設計分析

> 作成: 2026-03-15 アーキテクトAI
> 分類: アーキテクチャ設計コンサルテーション

---

## 1. 問題の整理

### 現象
ChMateでwrite_tokenを使って1回目の書き込みは成功するが、2回目以降（mail欄空）は毎回認証案内が返される。

### 根本原因
1. bbs.cgiのwrite_token検証成功時、`Set-Cookie: edge-token=...` をレスポンスに付与している
2. ChMateは `edge-token` という非標準Cookie名を認識せず、保持しない
3. 2回目のPOSTでは `Cookie` ヘッダに `edge-token` が含まれない
4. `BbsCgiParser.extractEdgeToken()` が null を返す
5. `resolveAuth()` が `edgeToken === null` で新規ユーザー扱いとなり認証案内が返る

### 要点
ChMateは5chプロトコル標準のCookie（`PON`, `PREN` 等）は保持するが、独自Cookie名は無視する。Cookie名の問題ではなく、**専ブラのCookie保持挙動が5ch標準名に限定されている**ことが本質。

---

## 2. 提示案の評価

### 案A: Cookie名を5ch互換名に変更 -- 不採用

| 項目 | 評価 |
|---|---|
| 実現可能性 | 低〜中 |
| リスク | 高 |

**理由:**
- 5chが内部で使うCookie名（`HAP` 等）はバージョンや時期により変動する。ChMateがどの名前を保持するかはリバースエンジニアリングが必要
- ChMateのCookie保持ロジックが「名前ベースのホワイトリスト」なのか「Set-Cookieヘッダ自体を無視」なのかが不明
- 後者の場合、名前を変えても効果がない
- 5chの内部実装に依存する設計は脆弱

### 案B: mail欄にedge-tokenを永続格納 -- 不採用

| 項目 | 評価 |
|---|---|
| 実現可能性 | 中 |
| リスク | 中 |

**理由:**
- UXが悪い。ユーザーがmail欄にトークンを常時入力し続ける必要がある
- ChMateのmail欄はsageとの共存が必要で、ユーザーが誤って消す可能性が高い
- edge-token（UUID形式）はwrite_token（32文字hex）より長く、mail欄が煩雑になる
- edge-tokenはセッション秘密鍵であり、可視化はセキュリティ上好ましくない

### 案C: POSTパラメータにedge-tokenを含める -- 不採用

| 項目 | 評価 |
|---|---|
| 実現可能性 | 低 |
| リスク | - |

**理由:**
- 専ブラ側で自動的にPOSTパラメータを付加する手段がない（タスク指示の通り）
- クライアント変更不可という制約に反する

### 案D: SameSite/Secure/HttpOnly属性の調整 -- 不採用（単独では不十分）

| 項目 | 評価 |
|---|---|
| 実現可能性 | 低 |
| リスク | 低 |

**理由:**
- 現在の設定（HttpOnly, SameSite=Lax, 本番時Secure）は標準的
- ChMateがSet-Cookieヘッダ自体を独自処理している場合、属性変更では解決しない
- ただし、推奨案と組み合わせて `SameSite=None; Secure` への変更は検討の余地がある

### 案E: レスポンスHTML中のCookie案内 -- 不採用

| 項目 | 評価 |
|---|---|
| 実現可能性 | 低 |
| リスク | - |

**理由:**
- ChMateがHTMLメタタグ `<meta http-equiv="Set-Cookie">` を処理する保証がない
- 現代のブラウザでもこのメタタグは非推奨/無効化されている
- 動作が不確実な手法に依存すべきではない

---

## 3. 推奨案: 案F「書き込み確認フロー（2フェーズコミット）」

### 3.1 発見した手がかり

`docs/research/research_merged.md` に以下の記述がある:

> **クッキー確認（2フェーズコミット）**: CSRFや連投防止のための「書き込み確認画面」。Cookie（PON/SPID）を発行し、`<title>書き込み確認</title>`を返すと、専ブラはそのCookieを付与してPOSTを自動再送します（実装緩和も可能）。

これは5chプロトコルの**標準機能**である。ChMateを含む主要専ブラは以下のフローを実装している:

1. bbs.cgiにPOST
2. サーバーが `<title>書き込み確認</title>` + `Set-Cookie` を返す
3. **専ブラが自動的にSet-CookieのCookieを保存する**
4. **専ブラが同じPOSTを自動再送する（今度はCookie付き）**
5. サーバーがCookieを確認して書き込みを実行

### 3.2 設計方針

**edge-token Cookieが未送信の書き込みリクエストに対して「書き込み確認」レスポンスを返し、ChMateの自動再送機構を利用してedge-tokenをCookieとして定着させる。**

```
[ChMate: 2回目以降の書き込み（Cookie未送信）]
  → bbs.cgi POST（edge-token Cookie なし、write_token なし）
  → サーバー: edge-token を特定できない
  → 【新規】サーバーが POSTパラメータ等から「既存ユーザーの再書き込み」を判別できない
  →    → 通常フローでは新規ユーザー扱い → 認証案内（現状の問題）
```

ここで問題が生じる。edge-token Cookie がなく write_token もない場合、サーバーは「未認証の新規ユーザー」と「認証済みだがCookieを送らない専ブラ」を区別できない。

**したがって、案Fを単独で使うことはできない。案Bの簡略版と組み合わせる必要がある。**

### 3.3 推奨案: 案F+B' 「write_token永続化 + 書き込み確認フロー」

#### 基本アイデア

1. write_tokenを**ワンタイムではなくセッション期間中有効**にする（有効期限を30日に延長）
2. ユーザーがmail欄に `#<write_token>` を入れ続ける限り認証が有効
3. 加えて、write_token検証成功時に「書き込み確認」レスポンスを返してedge-token Cookieの定着を試みる
4. Cookie定着に成功すれば、以降はmail欄のwrite_tokenは不要

#### フロー図

```
[初回書き込み]（未認証）
  → 認証案内（現行通り）
  → ユーザーがブラウザで認証 → write_token取得
  → mail欄に #<write_token> で書き込み
  → write_token検証成功
  → 【変更】レスポンス: <title>書き込み確認</title> + Set-Cookie: edge-token=xxx
  → ChMateが自動再送（Cookie付き）
  → Cookie認証成功 → 書き込み完了

[2回目以降 — Cookie定着成功パターン]
  → bbs.cgi POST（Cookie: edge-token=xxx）
  → Cookie認証成功 → 書き込み完了（mail欄にwrite_token不要）

[2回目以降 — Cookie定着失敗パターン]（ChMateがCookieを保持しない場合のフォールバック）
  → bbs.cgi POST（Cookie なし、mail欄に #<write_token>）
  → write_token検証成功 → 書き込み確認レスポンス + Set-Cookie
  → ChMateが自動再送
  → 書き込み完了
```

#### 変更点の詳細

| 変更対象 | 内容 |
|---|---|
| `auth-service.ts` > `verifyWriteToken()` | ワンタイム消費を廃止。write_tokenは有効期限内なら何度でも使用可能にする |
| `auth-service.ts` > `verifyAuthCode()` | write_tokenの有効期限を30日に変更（600秒 → 2592000秒） |
| `auth-code-repository.ts` | `clearWriteToken()` の呼び出しを `verifyWriteToken()` から削除 |
| `bbs.cgi/route.ts` | write_token検証成功時に「書き込み確認」レスポンスを返す分岐を追加 |
| `bbs-cgi-response.ts` | `buildWriteConfirm()` メソッドを新規追加 |
| `bbs.cgi/route.ts` | 書き込み確認の自動再送（2回目POST）を処理するロジック追加 |
| `cookie-names.ts` | 変更なし（Cookie名はedge-tokenのまま） |

---

## 4. 実装方針の詳細

### 4.1 書き込み確認レスポンスの仕様

```html
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>書き込み確認</title>
</head>
<body>
書き込み確認<br>
内容を確認してください。
<!-- 2ch_X:cookie -->
</body>
</html>
```

**重要ポイント:**
- `<title>書き込み確認</title>` が必須。ChMateはこのtitleで書き込み確認フローを認識する
- `<!-- 2ch_X:cookie -->` コメントタグは任意だが、一部の専ブラが参照する可能性がある
- Set-CookieヘッダでCookieを発行する

### 4.2 bbs.cgi route.tsの処理フロー変更

```
POST /test/bbs.cgi
  ├── Cookie に edge-token あり?
  │   ├── YES → 通常認証フロー（現行通り）
  │   └── NO → mail欄に write_token あり?
  │       ├── YES → write_token検証
  │       │   ├── 有効 → 「書き込み確認」レスポンス + Set-Cookie: edge-token
  │       │   │         （ChMateが自動再送 → 2回目は Cookie あり → 書き込み成功）
  │       │   └── 無効 → エラーレスポンス
  │       └── NO → 新規ユーザー → 認証案内（現行通り）
```

**ただし注意点がある。** ChMateが自動再送する際、POSTボディは同一のまま再送される。つまりmail欄の `#<write_token>` も含まれた状態で再送される。自動再送時にはCookieが付いているので、以下の処理順序が必要:

```
1. Cookie の edge-token をチェック → あれば通常認証（mail欄のwrite_tokenは無視して除去のみ）
2. Cookie なし → mail欄のwrite_tokenをチェック → 書き込み確認レスポンス
```

現行コードでは write_token の検出と Cookie 認証が独立しているため、処理順序の調整が必要。

### 4.3 write_token のセッション永続化

**変更前（現行）:**
```typescript
// verifyWriteToken(): ワンタイム消費
await AuthCodeRepository.clearWriteToken(authCode.id)
```

**変更後:**
```typescript
// verifyWriteToken(): 消費しない。有効期限チェックのみ
// clearWriteToken() を呼ばない
```

**変更前（現行）:**
```typescript
// verifyAuthCode(): write_token 有効期限 10分
const writeTokenExpiresAt = new Date(Date.now() + 600 * 1000)
```

**変更後:**
```typescript
// verifyAuthCode(): write_token 有効期限 30日（edge-token Cookie と同じ）
const writeTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
```

### 4.4 セキュリティ考慮事項

| 懸念 | 対策 |
|---|---|
| write_tokenの長期有効化による漏洩リスク | write_tokenは32文字hexで十分なエントロピー（128bit）を持つ。mail欄はDATに漏洩しない（除去済み）。他ユーザーからは見えない |
| 書き込み確認の無限ループ | 再送判定フラグ（例: POSTパラメータに `confirm=1` を追加）で1回限りの確認に制限する。ただし専ブラが未知パラメータを再送時に含めるかは要検証 |
| write_tokenの使い回し | 1つのwrite_tokenは1つのedge-tokenに紐づく。別ユーザーが使い回すことはできない |

---

## 5. 代替案: 案G「write_token永続化のみ（書き込み確認なし）」

書き込み確認フローの専ブラ実装が不確実な場合の**よりシンプルなフォールバック案**。

### 方針
- write_tokenを30日間有効にする（ワンタイム消費廃止）
- ChMateユーザーはmail欄に `sage#<write_token>` を常に入れて使う
- Cookie定着は期待しない

### メリット
- 実装が最もシンプル（verifyWriteTokenからclearWriteToken呼び出しを削除、有効期限変更のみ）
- 専ブラの内部実装に依存しない確実な方式
- 現行のbbs.cgi route.tsのフローをほぼ変更しない

### デメリット
- ユーザーがmail欄のwrite_tokenを消すと再認証が必要
- sageと共存するため `sage#<write_token>` という長い文字列をmail欄に入れ続ける必要がある
- UXとしては理想的ではない

### 実はこれが5ch互換掲示板の標準的UX
浪人（●）トークンをmail欄に入れて使うのは5ch文化の慣行。ユーザーにとって「mail欄にトークンを入れる」行為は馴染みがある。

---

## 6. 推奨と判断

### 段階的アプローチを推奨

| フェーズ | 対応 | リスク |
|---|---|---|
| **Phase 1（即時）** | 案G: write_tokenの長期有効化のみ | 低。確実に動作する |
| **Phase 2（実機検証後）** | 案F: 書き込み確認フローの追加 | 中。ChMateの挙動を実機検証してから実装 |

**理由:**
1. 案Gは最小限の変更で問題を解決できる。write_tokenのワンタイム消費廃止と有効期限延長のみ
2. 書き込み確認フロー（案F）はChMateの実際の挙動を実機検証してから実装すべき。「`<title>書き込み確認</title>`でCookieを保持して自動再送する」挙動が確実に動作するか未検証
3. Phase 1 で問題が実用上解決されれば、Phase 2 は優先度を下げられる

### Phase 1 の変更サマリ

| ファイル | 変更内容 |
|---|---|
| `src/lib/services/auth-service.ts` | `verifyWriteToken()`: `clearWriteToken()` 呼び出しを削除 |
| `src/lib/services/auth-service.ts` | `verifyAuthCode()`: write_token有効期限を10分→30日に変更 |
| `src/lib/infrastructure/adapters/bbs-cgi-response.ts` | `buildAuthRequired()`: 案内文に「write_tokenはmail欄に入れたままにしてください」を追記 |

**変更行数: 約5行**

---

## 7. BDDシナリオ変更の要否

### Phase 1（案G）: 変更不要

現行のBDDシナリオ:
- `@認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する` -- そのまま適合
- `@無効なwrite_tokenでは書き込みが拒否される` -- そのまま適合
- `@Cookie共有の専ブラでは認証後そのまま書き込みできる` -- そのまま適合

write_tokenの有効期限やワンタイム性は BDD シナリオで規定されていない（実装詳細）。従って Phase 1 の変更は BDD シナリオの変更を伴わない。

### Phase 2（案F）: 変更が必要

「書き込み確認」フローは新しいユーザー向け振る舞いであるため、BDD シナリオの追加が必要になる。例:

```gherkin
Scenario: Cookie未保持の専ブラでwrite_token付き書き込み時に書き込み確認が返される
  Given ユーザーが認証を完了しwrite_tokenを保持している
  And 専ブラがedge-token Cookieを保持していない
  When bbs.cgiのメール欄に "#<write_token>" を含めてPOSTする
  Then レスポンスのtitleタグに "書き込み確認" が含まれる
  And edge-token Cookieが発行される
```

これは人間承認が必要。

---

## 8. 補足: 認証案内HTMLの改善提案

現行の `buildAuthRequired()` の案内文を以下のように改善することを推奨:

**追記内容:**
```
※ write_tokenはメール欄に入れたままにしてください。
例: sage#<write_token値>
Cookieが使えない環境ではwrite_tokenが認証の代わりになります。
```

これにより、ChMateユーザーが意図的にwrite_tokenを消してしまうリスクを軽減できる。

---

## 9. まとめ

| 項目 | 結論 |
|---|---|
| **推奨案** | Phase 1: 案G（write_token永続化）、Phase 2: 案F（書き込み確認フロー） |
| **Phase 1 の変更規模** | 約5行。auth-service.ts 2箇所 + bbs-cgi-response.ts 1箇所 |
| **BDDシナリオ変更** | Phase 1: 不要、Phase 2: 必要（人間承認） |
| **不採用案** | A（5ch内部依存）、B（UX悪い原案）、C（クライアント変更不可）、D（単独では不十分）、E（非標準で不確実） |
| **最大のリスク** | Phase 2 の書き込み確認フローがChMateで正しく動作するかは実機検証が必要 |
