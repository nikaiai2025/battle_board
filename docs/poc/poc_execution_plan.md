# PoC 実施要項

> 作成日: 2026-03-04
> 目的: 本番実装前に技術的不確実性を検証する使い捨てPoC

---

## 1. 目的と範囲

### 目的

BattleBoardの実装前に、以下2点の技術的実現可能性を最小コストで検証する。

1. **PoC-1**: 5ch専用ブラウザ（ChMate/Siki）からスレッド閲覧・書き込みが正常に動作するか
2. **PoC-2**: LLM APIを定期実行し、掲示板の書き込みとして自然な日本語テキストを生成できるか

### スコープ外

以下は本PoCの対象外。既知の技術で解決可能なため、本番実装時に対応する。

- 認証・ログイン機能
- 通貨システム
- コマンド解析
- 日次リセットID生成ロジック
- データベース（Supabase）連携
- フロントエンド（Webアプリ）
- テストコード

---

## 2. 事前準備（人間が行う作業）

### 2.1 Gemini APIキーの取得

1. [Google AI Studio](https://aistudio.google.com/) にアクセス
2. APIキーを発行する（無料枠で十分）
3. 取得したキーを `poc/.env` に記載する（後述の `.env` フォーマット参照）

### 2.2 テスト端末の準備

5ch専用ブラウザの動作確認に使用する。以下のいずれかを用意する。

| 専ブラ | プラットフォーム | 入手先 |
|---|---|---|
| ChMate | Android | Google Play Store |
| Siki | iOS | App Store |

※ エミュレータでも可

### 2.3 ネットワーク確認

ChMate/SikiからPoCサーバーに接続するため、以下のいずれかを確保する。

- **案A（推奨）**: PC と テスト端末が同一LAN上にある。PCのローカルIP（例: `192.168.x.x`）を確認しておく
- **案B**: [ngrok](https://ngrok.com/) 等のトンネリングツールで公開URL を発行する

### 2.4 GitHubリポジトリ設定（PoC-2用）

GitHub Actionsの定期実行を検証するため、以下を行う。

1. PoCコード一式をGitHubリポジトリにpushできる状態にする（既存リポジトリまたは新規リポジトリ）
2. リポジトリの Settings → Secrets and variables → Actions で以下を登録:
   - **Secret名**: `GEMINI_API_KEY`
   - **値**: 2.1で取得したAPIキー
3. リポジトリの Settings → Actions → General で GitHub Actions が有効になっていることを確認

---

## 3. 共通設定

### ディレクトリ構成

```
poc/
├── .env                 # 環境変数（人間が作成、gitignore対象）
├── .env.example         # .envのテンプレート
├── .gitignore
├── package.json
├── server.js            # PoC-1: 5ch互換APIサーバー
├── generate-post.js     # PoC-2: LLMボット生成スクリプト
└── data.js              # PoC-1: インメモリテストデータ
.github/
└── workflows/
    └── poc-bot.yml      # PoC-2: GitHub Actions定期実行ワークフロー
```

### .env

```
# PoC-1: サーバー設定
PORT=3000
BOARD_ID=battleboard

# PoC-2: Gemini API
GEMINI_API_KEY=your_api_key_here
```

### 使用ライブラリ

```json
{
  "name": "battleboard-poc",
  "private": true,
  "type": "module",
  "dependencies": {
    "express": "^4",
    "iconv-lite": "^0.6",
    "@google/generative-ai": "^0.21",
    "dotenv": "^16"
  }
}
```

---

## 4. PoC-1: 5ch専ブラプロトコル互換

### 4.1 概要

Express（Node.js）で5ch互換APIのスタブサーバーを構築し、ChMate/Sikiからの板追加→スレ一覧→スレ閲覧→書き込みの一連フローを検証する。データはインメモリ（配列）で保持し、DBは使わない。

### 4.2 全エンドポイント共通仕様

- **エンコーディング**: すべてのレスポンスボディはShift_JIS（CP932）でエンコードする
- **文字コード変換**: `iconv-lite` を使用し、内部UTF-8 ⇔ Shift_JIS（CP932）を変換する
- **Content-Type**: 各エンドポイントの仕様に記載の値を使用。すべてに `charset=Shift_JIS` を含める
- **リクエストログ**: 全リクエストのメソッド・URL・主要ヘッダーをコンソールに出力する（デバッグ用）

### 4.3 テストデータ（インメモリ・初期値）

サーバー起動時に以下のデータをメモリ上に保持する。bbs.cgi経由の書き込みで動的に追加される。

```javascript
const threads = [
  {
    key: "1709000000",
    title: "テスト雑談スレ",
    lastModified: new Date("2025-03-01T10:10:00+09:00"),
    posts: [
      { name: "名無しさん", mail: "",     date: "2025/03/01(土) 10:00:00.00", id: "AbCd1234", body: "自由に話しましょう" },
      { name: "名無しさん", mail: "sage", date: "2025/03/01(土) 10:05:00.00", id: "EfGh5678", body: "こんにちは" },
      { name: "名無しさん", mail: "",     date: "2025/03/01(土) 10:10:00.00", id: "AbCd1234", body: ">>2 よろしく" }
    ]
  },
  {
    key: "1709100000",
    title: "PoC検証用スレ",
    lastModified: new Date("2025-03-01T12:00:00+09:00"),
    posts: [
      { name: "名無しさん", mail: "", date: "2025/03/01(土) 12:00:00.00", id: "IjKl9012", body: "検証中です" }
    ]
  }
];
```

### 4.4 エンドポイント仕様

#### GET `/bbsmenu.html`

板一覧メニュー。専ブラの初回板登録時に使用される。

- **Content-Type**: `text/html; charset=Shift_JIS`
- **レスポンスボディ形式**（Shift_JISエンコード済みで返す）:

```html
<HTML>
<HEAD><TITLE>BBS MENU</TITLE></HEAD>
<BODY>
<B>カテゴリ</B><br>
<A HREF=http://{host}:{port}/{boardId}/>BattleBoard</A><br>
</BODY>
</HTML>
```

`{host}` はリクエストの `Host` ヘッダーから取得する。`{boardId}` は環境変数 `BOARD_ID` の値。

---

#### GET `/:boardId/SETTING.TXT`

板の設定情報。

- **Content-Type**: `text/plain; charset=Shift_JIS`
- **レスポンスボディ形式**（各行 `キー=値` で改行区切り）:

```
BBS_TITLE=BattleBoard
BBS_TITLE_PICTURE=
BBS_NONAME_NAME=名無しさん
BBS_DELETE_NAME=名無しさん
BBS_SUBJECT_COUNT=64
BBS_NAME_COUNT=64
BBS_MAIL_COUNT=64
BBS_MESSAGE_COUNT=2048
BBS_THREAD_TATESUGI=0
BBS_LINE_NUMBER=40
BBS_UNICODE=pass
```

---

#### GET `/:boardId/subject.txt`

スレッド一覧。最終書き込みが新しい順に並べる。

- **Content-Type**: `text/plain; charset=Shift_JIS`
- **レスポンスボディ形式**（1行1スレッド、改行 `\n` 区切り）:

```
{threadKey}.dat<>{スレッドタイトル} ({レス数})\n
```

例:
```
1709000000.dat<>テスト雑談スレ (3)
1709100000.dat<>PoC検証用スレ (1)
```

並び順: `lastModified` の降順（最終書き込みが新しいスレッドが先頭）

---

#### GET `/:boardId/dat/:threadKey.dat`

スレッドのレスデータ。差分同期に対応する（後述 4.5）。

- **Content-Type**: `text/plain; charset=Shift_JIS`
- **レスポンスボディ形式**（1行1レス、改行 `\n` 区切り）:

```
{名前}<>{メール}<>{日付} ID:{ID}<>{本文}<>{スレッドタイトル（1行目のみ）}\n
```

1行目のみ末尾フィールドにスレッドタイトルが入る。2行目以降は空文字（ただしセパレータ `<>` は付与する）。

例:
```
名無しさん<><>2025/03/01(土) 10:00:00.00 ID:AbCd1234<>自由に話しましょう<>テスト雑談スレ
名無しさん<>sage<>2025/03/01(土) 10:05:00.00 ID:EfGh5678<>こんにちは<>
名無しさん<><>2025/03/01(土) 10:10:00.00 ID:AbCd1234<>&gt;&gt;2 よろしく<>
```

**本文のエスケープ処理:**
- `<` → `&lt;`
- `>` → `&gt;`
- `&` → `&amp;` （ただし `&lt;` `&gt;` `&amp;` 自体は二重変換しない）
- 改行 → `<br>`
- アンカー `>>数字` は本文に `&gt;&gt;数字` として格納されるが、専ブラ側がリンクとして認識する

---

#### POST `/:boardId/bbs.cgi`

書き込み投稿。専ブラからのPOSTを受け付ける。

- **リクエスト Content-Type**: `application/x-www-form-urlencoded`（Shift_JISエンコード）
- **レスポンス Content-Type**: `text/html; charset=Shift_JIS`

**POSTパラメータ:**

| パラメータ | 用途 | 必須 |
|---|---|---|
| `bbs` | 板ID | ○ |
| `key` | スレッドキー（返信時） | 返信時○ |
| `subject` | スレッドタイトル（新規作成時） | 新規時○ |
| `FROM` | 名前（空の場合「名無しさん」） | |
| `mail` | メール欄 | |
| `MESSAGE` | 本文 | ○ |
| `submit` | 送信ボタン値 | |

**POSTボディのデコード手順:**

専ブラはShift_JISでパーセントエンコードしたデータをPOSTする。Node.js の `URLSearchParams` はUTF-8前提のため直接使用できない。以下の手順で処理する。

1. リクエストボディをBufferとして読み取る（Expressの `raw` ボディパーサー使用）
2. Bufferを `latin1`（ISO-8859-1）エンコーディングで文字列化する（バイト値をそのまま保持するため）
3. `&` で分割してキー=値ペアを取得する
4. 各値のパーセントエンコードをデコードして生バイト列に戻す（`+` はスペース `0x20` に変換）
5. 生バイト列を `iconv-lite` で Shift_JIS → UTF-8 に変換する

**成功時レスポンス:**

```html
<html><head><title>書きこみました</title></head><body>書きこみました。</body></html>
```

**エラー時レスポンス（MESSAGEが空の場合など）:**

```html
<html><head><title>ＥＲＲＯＲ</title></head><body>本文が空です。</body></html>
```

**書き込み処理:**

1. パラメータをバリデーション（`MESSAGE` が空でないこと）
2. `key` が存在する場合は返信: 該当スレッドの `posts` 配列に追加
3. `subject` が存在する場合は新規作成: 新しいスレッドオブジェクトを作成し、1件目のレスとして追加
4. 日付文字列は現在時刻から生成する。フォーマット: `YYYY/MM/DD(曜日) HH:MM:SS.ff`
   - 曜日: `日月火水木金土` の1文字
   - `ff`: ミリ秒の上位2桁（センチ秒）
5. IDは固定値 `PoC00000` とする（認証不要のため）
6. スレッドの `lastModified` を現在時刻に更新する

### 4.5 差分同期

DATファイル取得時の差分同期に対応する。

#### Range ヘッダ（206 Partial Content）

1. リクエストに `Range: bytes={N}-` ヘッダが存在する場合:
   - DATファイルの **Shift_JISエンコード済みバイト列** を生成する
   - バイト列の `N` バイト目以降を切り出す
   - ステータスコード `206` で返す
   - `Content-Range: bytes {N}-{total-1}/{total}` ヘッダを付与する
2. Range ヘッダがない場合: ステータスコード `200` で全量を返す

#### If-Modified-Since ヘッダ（304 Not Modified）

1. リクエストに `If-Modified-Since` ヘッダが存在する場合:
   - スレッドの `lastModified` と比較する
   - 更新がない場合: ステータスコード `304`、ボディなしで返す
   - 更新がある場合: 通常どおり `200` または `206` で返す
2. すべての DAT レスポンスに `Last-Modified` ヘッダを付与する（`lastModified` のHTTP日付形式）

### 4.6 成功基準

以下の一連の操作がChMate（またはSiki）で正常に完了すること。

| # | 操作 | 確認事項 |
|---|---|---|
| 1 | PoCサーバーを板として追加 | エラーなく板登録できる |
| 2 | スレッド一覧を表示 | スレッドタイトル・レス数が文字化けなく表示される |
| 3 | スレッドを開く | レスが順番通りに表示され、名前・ID・本文が文字化けしない |
| 4 | スレッドに書き込む | 書き込みが成功し、「書きこみました」が返る |
| 5 | スレッドを更新（再読み込み） | 書き込んだレスが表示される |
| 6 | 差分取得の確認 | 2回目以降の読み込みでサーバーログに `Range` ヘッダが含まれている |

---

## 5. PoC-2: LLMボット生成・定期実行

### 5.1 概要

Gemini APIを使って「名無しさん」風のレスを生成するスクリプトを作成し、ローカル実行とGitHub Actionsの定期実行の両方を検証する。

### 5.2 ローカル実行スクリプト (`generate-post.js`)

以下の処理を行う単体実行可能なスクリプト。

1. `.env` から `GEMINI_API_KEY` を読み込む
2. Gemini API（モデル: `gemini-2.0-flash`）にプロンプトを送信する
3. 生成されたテキストをコンソールに出力する
4. レイテンシ（API呼び出しから応答完了までのミリ秒）を出力する
5. 3回連続で実行し、結果のばらつきを確認する

### 5.3 プロンプト仕様

以下のプロンプトをそのまま使用する。

```
あなたは匿名掲示板「BattleBoard」のユーザー「名無しさん」です。
以下のスレッドの流れを読んで、自然な返信を1件だけ書いてください。

制約:
- 5ch/2chの文化に馴染む文体（タメ口、略語、顔文字OK）
- 1〜3文程度の短いレス
- 過度に丁寧・説明的にならないこと
- 改行は最小限
- あなたがAI・ボットであることを示唆する内容は絶対に書かないこと

スレッドタイトル: 今日の雑談スレ

最近のレス:
1: 名無しさん ID:AbCd1234
自由に話しましょう

2: 名無しさん ID:EfGh5678
今日暑すぎワロタ

3: 名無しさん ID:AbCd1234
>>2 まだ3月なのにな

あなたの返信（本文のみ。名前やIDは不要）:
```

### 5.4 GitHub Actions ワークフロー (`poc-bot.yml`)

以下の仕様でワークフローファイルを作成する。

```yaml
name: PoC Bot - Periodic Generation

on:
  schedule:
    - cron: '0 */6 * * *'   # 6時間ごと（検証用。確認後に無効化する）
  workflow_dispatch:         # 手動実行ボタン（即時テスト用）

jobs:
  generate:
    runs-on: ubuntu-latest
    env:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
        working-directory: poc
      - name: Generate post
        run: node generate-post.js
        working-directory: poc
```

**重要:** 検証が完了したらワークフローを無効化するか削除すること（無駄なAPI消費を防ぐため）。

### 5.5 成功基準

| # | 確認事項 | 判定方法 |
|---|---|---|
| 1 | APIが呼び出せる | ローカル実行で200レスポンスが返り、テキストが出力される |
| 2 | 生成テキストの自然さ | 3回の出力を人間が読み、5ch/2chの書き込みとして違和感がないか主観判定する |
| 3 | レイテンシ | 各回のレイテンシがコンソールに出力され、概ね数秒以内であること |
| 4 | GitHub Actionsの手動実行 | `workflow_dispatch` で手動実行し、ログに生成テキストが出力される |
| 5 | GitHub Actionsの定期実行 | cron トリガーで自動実行された履歴がActionsタブに記録される |

---

## 6. 検証手順

### PoC-1 検証フロー

```
1. 人間: .env を作成（PORT, BOARD_ID を設定）
2. AI:   poc/ ディレクトリにコードを実装
3. 人間: npm install && node server.js でサーバー起動
4. 人間: PCのローカルIPを確認（ipconfig / ifconfig）
5. 人間: ChMateで外部板追加（URL: http://{ローカルIP}:{PORT}/{BOARD_ID}/）
6. 人間: 成功基準 #1〜#6 を順に確認
7. 人間: 問題があればサーバーログを確認し、原因を特定
```

### PoC-2 検証フロー

```
1. 人間: Gemini APIキーを取得し .env に設定
2. AI:   generate-post.js を実装
3. 人間: node generate-post.js をローカル実行し、成功基準 #1〜#3 を確認
4. AI:   .github/workflows/poc-bot.yml を作成
5. 人間: GEMINI_API_KEY を GitHub Secrets に登録
6. 人間: コードをGitHubにpush
7. 人間: Actions タブから手動実行（workflow_dispatch）し、成功基準 #4 を確認
8. 人間: 6時間後（または翌日）に定期実行の履歴を確認し、成功基準 #5 を確認
9. 人間: 検証完了後、ワークフローを無効化または削除
```

---

## 7. 本PoCで未検証の事項（本番環境での追加検証）

| 事項 | 理由 | 検証タイミング |
|---|---|---|
| Vercel上でのShift_JISレスポンス | Vercel Serverless FunctionsのNode.jsランタイムでバイナリレスポンスが正しく返せるかはデプロイ後に検証 | Phase 1 実装時 |
| HTTP POST → HTTPS リダイレクト | 専ブラがHTTPでPOSTした際に307/308でペイロード保持されるか。ローカルPoCはHTTPのみのため未検証 | Vercelデプロイ後 |
| Supabase接続・RLS | PoCではDB未使用 | Phase 1 実装時 |
| WAF/CDNによるUser-Agentブロック | ローカル環境では発生しない。Vercel/Cloudflare等のCDN経由時に `Monazilla/1.00` がブロックされないか確認 | Vercelデプロイ後 |
| ボットの書き込みAPI統合 | 本番ではbbs.cgi経由で書き込む設計だが、PoCではAPI呼び出しと生成品質の検証のみ | Phase 2 実装時 |
