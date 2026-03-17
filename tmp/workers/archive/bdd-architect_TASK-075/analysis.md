# TASK-075: 専ブラ・Web間の絵文字ハンドリング網羅分析

## 1. 処理フロー概要

### 1.1 書き込み経路

#### Web書き込み
```
Web UI (UTF-8 JSON) → /api/threads/{id}/posts (route.ts)
  → PostService.createPost(body: UTF-8文字列)
  → PostRepository.create → DB(UTF-8そのまま保存)
```
- 絵文字はUTF-8のまま変換なしにDBに保存される
- `&#` 変換は発生しない

#### 専ブラ書き込み（本文/MESSAGE）
```
専ブラ (Shift_JIS URL-encoded) → /test/bbs.cgi (route.ts)
  → encoder.decodeFormData(bodyBuffer)
    → latin1でASCII読み取り → "&"で分割 → 各key=valueを:
      → urlDecodeToBytes(): %XX → rawバイト列
      → encoder.decode(): TextDecoder("shift_jis") → UTF-8文字列
  → bbsCgiParser.parseRequest(bodyParams) → parsed.message (UTF-8)
  → PostService.createPost(body: parsed.message) → DB保存
```

**重要ポイント**: 専ブラ(ChMate等)がShift_JISに存在しない絵文字をどう送るか:
- ChMateは絵文字をHTML数値参照 `&#128517;` (= `&#x1F605;`) に変換してShift_JISエンコードする
- `&#128517;` はASCII文字のみで構成されるため、Shift_JISエンコーディングで問題なく送信可能
- `decodeFormData` はこれをそのままUTF-8文字列 `"&#128517;"` としてデコードする
- **DBには `&#128517;` という生テキスト文字列が保存される**（UTF-8の絵文字コードポイントではない）

#### 専ブラ書き込み（スレタイ/subject）
```
bbs.cgi route.ts:
  const subject = bodyParams.get("subject") ?? "";
  → handleCreateThread(parsed, subject, ipHash)
    → PostService.createThread({ title: subject.trim(), ... })
      → ThreadRepository.create({ title: input.title, ... })
```
- スレタイもMESSAGEと同じ `decodeFormData` 経由でデコードされる
- しかし、**ChMateはスレタイの絵文字をHTML数値参照ではなくUnicode文字そのもので送信する可能性がある**
- ユーザー報告: パターン9(専ブラ→Web、スレタイ、通常絵文字)は正常 → スレタイの通常絵文字はUTF-8として正しく保存されている
- つまりChMateはスレタイフィールドのShift_JIS変換で一部の絵文字をそのまま（非Shift_JISバイトとして）送信している可能性、あるいはHTML数値参照で送り、Web表示時にHTMLレンダリングされている可能性がある

**検証**: パターン9が正常な理由を考えると、専ブラがsubjectの絵文字もHTML数値参照で送り、Web UIの `<h1>` 内で `{thread.title}` としてReactが表示する際にHTML数値参照がエスケープされず表示される...いや、ReactはテキストノードをHTMLエスケープするため `&#128517;` は生テキスト表示されるはず。

**再考**: パターン9が正常だというユーザー報告が正しいなら、以下のいずれかが考えられる:
1. ChMateのスレタイフィールドでは、絵文字がUnicodeバイトのまま送信される（Shift_JISエンコードされない）
2. TextDecoder("shift_jis") が未知バイト列をfallbackとして何らかの形で通す

**実際の挙動推定**: ChMateはスレタイフィールドでも本文と同様にHTML数値参照で送るが、Web UI上でスレタイがHTMLとして解釈される何らかの経路がある。ただしPostItemの本文表示は `parseAnchorLinks(post.body)` でテキストノードとして描画するため、HTML数値参照は生テキスト表示される。スレタイは `<h1>{thread.title}</h1>` でありこれもReactテキストノード。

**結論**: パターン9が本当に正常なら、ChMateはスレタイでは絵文字をUnicodeそのもので送信しており、TextDecoder("shift_jis")が未マッピングバイトをUnicode replacement characterにせず通している可能性がある。あるいはChMateがスレタイをUTF-8で送信している可能性もある。この点は実機検証が必要だが、コード分析上はスレタイも本文も同じ `decodeFormData` 経路を通るため、理論上は同じ挙動になるはず。

### 1.2 閲覧経路

#### Web閲覧
```
DB → PostService.getPostList(threadId) → Post[]
  → JSON API /api/threads/{id}/posts → { posts: Post[] }
  → PostItem.tsx: parseAnchorLinks(post.body) → React要素配列
  → テキストノードとして描画（HTMLエスケープされる）
```
- ReactはテキストノードをHTMLエスケープする
- `&#128517;` はHTMLエンティティとして解釈されず、**生テキスト `&#128517;` として画面に表示される**
- UTF-8の絵文字文字そのもの（Web書き込み）はブラウザが正しく絵文字として表示する

#### 専ブラ閲覧
```
DB → PostRepository.findByThreadId → Post[]
  → DatFormatter.buildDat(posts, threadTitle)
    → formatBody(post):
      1. escapeHtml(post.body)  ← "&" → "&amp;" に変換
      2. replaceBotEmoji(escaped) ← BOT絵文字4種のみ[BOT]置換
      3. .replace(/\n/g, "<br>")
    → スレタイは第1行のみに付加（escapeHtml/replaceBotEmojiなし: 直接付加）
  → ShiftJisEncoder.encode(datText)
    → sanitizeForCp932(text):
      1. 異体字セレクタ除去
      2. U+10000以上 → &#コードポイント;
      3. BMP内CP932未対応 → &#コードポイント;
    → iconv.encode(sanitized, "CP932") → Buffer
  → Response(sjisBuffer)
```

**重大な問題: escapeHtml と sanitizeForCp932 の干渉**

DBに `&#128517;` が保存されている場合（専ブラ書き込み経由）:
1. `escapeHtml("&#128517;")` → `"&amp;#128517;"` （`&` が `&amp;` にエスケープされる）
2. `sanitizeForCp932("&amp;#128517;")` → 全てASCII/CP932文字なのでそのまま通過
3. 専ブラで表示: `&amp;#128517;` → HTMLとして解釈すると `&#128517;` が表示される

→ これは実際のユーザー報告と一致する可能性がある。専ブラがHTMLとして解釈するなら `&amp;` → `&` → `&#128517;` → 絵文字表示になるかもしれないが、二重エスケープにより `&#128517;` というテキストが表示される可能性もある。

DBにUTF-8絵文字そのもの（Web書き込み経由）が保存されている場合:
1. `escapeHtml("テスト😅")` → `"テスト😅"`（絵文字はHTML特殊文字ではないのでそのまま）
2. `replaceBotEmoji("テスト😅")` → BOT絵文字以外はそのまま
3. `sanitizeForCp932("テスト😅")` → `"テスト&#128517;"` （U+1F605 → HTML数値参照）
4. iconv.encode → Shift_JISバッファ
5. 専ブラ: `&#128517;` をHTMLとして解釈 → 絵文字表示（期待動作）

**スレタイの処理（DatFormatter内）**:
```typescript
const title = index === 0 ? threadTitle : "";
return `${name}<>${mail}<>${dateId}<>${body}<>${title}`;
```
- スレタイは `escapeHtml` も `replaceBotEmoji` も通らない
- `sanitizeForCp932` のみが適用される（encode時）
- DBにUTF-8絵文字がある場合: `sanitizeForCp932` でHTML数値参照に正しく変換される
- DBに `&#128517;` がある場合: ASCII文字なのでそのまま通過し、専ブラでHTMLとして解釈される

## 2. 16パターン検証マトリクス

### 凡例
- **処理フロー**: 書き込み→保存→取得→表示の各ステップ
- **期待動作**: 正しくあるべき振る舞い
- **推定現状**: コード分析に基づく実際の挙動推定
- **判定**: OK=問題なし / NG=問題あり

---

### パターン1: Web → Web / スレタイ / 通常絵文字

| 項目 | 内容 |
|---|---|
| 処理フロー | Web UI (UTF-8) → API → ThreadService.createThread → DB保存(UTF-8 `"テスト😀"`) → PostService.getThread → page.tsx `<h1>{thread.title}</h1>` |
| 期待動作 | 絵文字がそのまま表示される |
| 推定現状 | DB: `"テスト😀"` → React: テキストノード → ブラウザが絵文字を正しく表示 |
| 判定 | **OK** |

### パターン2: Web → Web / スレタイ / 末尾注意(VS/ZWJ)

| 項目 | 内容 |
|---|---|
| 処理フロー | 同上。DB保存: `"テスト🕳️"` (U+1F573 + U+FE0F) |
| 期待動作 | 絵文字がそのまま表示される |
| 推定現状 | DB: UTF-8そのまま → React: テキストノード → ブラウザが正しく表示 |
| 判定 | **OK** |

### パターン3: Web → Web / 本文 / 通常絵文字

| 項目 | 内容 |
|---|---|
| 処理フロー | Web UI → API → PostService.createPost(body: `"テスト😀"`) → DB保存 → getPostList → PostItem `parseAnchorLinks(post.body)` |
| 期待動作 | 絵文字がそのまま表示される |
| 推定現状 | DB: `"テスト😀"` → React: テキストノード → 正常表示 |
| 判定 | **OK** |

### パターン4: Web → Web / 本文 / 末尾注意(VS/ZWJ)

| 項目 | 内容 |
|---|---|
| 処理フロー | 同上。DB保存: `"テスト🕳️"` |
| 期待動作 | 絵文字がそのまま表示される |
| 推定現状 | DB: UTF-8そのまま → React: テキストノード → 正常表示 |
| 判定 | **OK** |

### パターン5: Web → 専ブラ / スレタイ / 通常絵文字

| 項目 | 内容 |
|---|---|
| 処理フロー | DB: `"テスト😀"` → DatFormatter.buildDat: スレタイはescapeHtml/replaceBotEmoji対象外 → `"テスト😀"` → ShiftJisEncoder.encode → sanitizeForCp932: `😀`(U+1F600) → `"テスト&#128512;"` → iconv CP932エンコード → 専ブラがHTMLとして解釈 |
| 期待動作 | 専ブラが `&#128512;` をHTMLエンティティとして解釈し絵文字を表示 |
| 推定現状 | sanitizeForCp932で正しくHTML数値参照に変換 → 専ブラで表示可能 |
| 判定 | **OK** |

### パターン6: Web → 専ブラ / スレタイ / 末尾注意(VS付き)

| 項目 | 内容 |
|---|---|
| 処理フロー | DB: `"テスト🕳️"` (U+1F573 + U+FE0F) → DatFormatter: スレタイそのまま → sanitizeForCp932: U+FE0F除去 + U+1F573→`&#128371;` → `"テスト&#128371;"` → CP932エンコード |
| 期待動作 | 異体字セレクタが除去され基底文字のみHTML数値参照で表示 |
| 推定現状 | BDDシナリオ通り: VS除去 + 基底文字保持。正常動作 |
| 判定 | **OK** |

### パターン7: Web → 専ブラ / 本文 / 通常絵文字

| 項目 | 内容 |
|---|---|
| 処理フロー | DB: `"テスト😀"` → DatFormatter.formatBody: escapeHtml(`"テスト😀"`) → `"テスト😀"`(変化なし) → replaceBotEmoji(同上、BOT絵文字以外変化なし) → sanitizeForCp932: `😀`→`&#128512;` → 専ブラ |
| 期待動作 | `&#128512;` がHTMLエンティティとして解釈され表示 |
| 推定現状 | 正常。escapeHtmlは絵文字に影響しない |
| 判定 | **OK** |

### パターン8: Web → 専ブラ / 本文 / 末尾注意(VS付き)

| 項目 | 内容 |
|---|---|
| 処理フロー | DB: `"テスト🕳️"` → escapeHtml: 変化なし → replaceBotEmoji: 変化なし → sanitizeForCp932: U+FE0F除去 + U+1F573→`&#128371;` |
| 期待動作 | VS除去、基底文字のHTML数値参照表示 |
| 推定現状 | 正常 |
| 判定 | **OK** |

---

### パターン9: 専ブラ → Web / スレタイ / 通常絵文字

| 項目 | 内容 |
|---|---|
| 処理フロー | 専ブラ(Shift_JIS): 絵文字→HTML数値参照 `&#128512;` → decodeFormData → `"テスト&#128512;"` → ThreadRepository.create(title: `"テスト&#128512;"`) → DB保存 → Web page.tsx `<h1>{thread.title}</h1>` |
| 期待動作 | 絵文字が表示される |
| 推定現状 | DB: `"テスト&#128512;"` → React: テキストノード → `&#128512;` が**生テキスト表示** |
| ユーザー報告 | 正常とのこと |
| 判定 | **要確認** — ReactがHTMLエスケープするため生テキスト表示になるはず。ユーザー報告が正常だとすると、専ブラがスレタイの絵文字をShift_JIS以外の方法(UTF-8?)で送信しているか、別の経路で処理されている可能性がある。あるいは通常絵文字の場合にChMateが特殊な処理をしている可能性。 |

### パターン10: 専ブラ → Web / スレタイ / 末尾注意(VS付き)

| 項目 | 内容 |
|---|---|
| 処理フロー | 専ブラ: `🕳️`→ `&#128371;&#65039;` or `&#128371;️` (VSの扱いはChMate依存) → decodeFormData → DB保存 → Web表示 |
| 期待動作 | 絵文字が表示される |
| 推定現状 | DB: `"テスト&#128371;"` 等 → React: 生テキスト表示 `&#128371;` |
| ユーザー報告 | NG: `&#128371;` が生テキスト表示 |
| 判定 | **NG** — 根本原因: 専ブラ経由の書き込みがHTML数値参照テキストとしてDBに保存され、Web UIはHTMLをレンダリングしないためそのまま表示される |

### パターン11: 専ブラ → Web / 本文 / 通常絵文字

| 項目 | 内容 |
|---|---|
| 処理フロー | 専ブラ: 絵文字→HTML数値参照 → decodeFormData → PostService.createPost(body: `"テスト&#128512;"`) → DB → Web PostItem: `parseAnchorLinks("テスト&#128512;")` → テキストノード |
| 期待動作 | 絵文字が表示される |
| 推定現状 | DB: `"テスト&#128512;"` → React: 生テキスト表示 `&#128512;` |
| ユーザー報告 | NG: `&#....` になる |
| 判定 | **NG** — 根本原因: パターン10と同じ。HTML数値参照がDBに生テキストとして保存 → Web UIでHTMLレンダリングされない |

### パターン12: 専ブラ → Web / 本文 / 末尾注意(VS/ZWJ)

| 項目 | 内容 |
|---|---|
| 処理フロー | パターン11と同様 |
| 期待動作 | 絵文字（またはその構成要素）が表示される |
| 推定現状 | DB: `"&#128371;&#65039;"` 等 → React: 生テキスト表示 |
| 判定 | **NG** — 同上 |

---

### パターン13: 専ブラ → 専ブラ / スレタイ / 通常絵文字

| 項目 | 内容 |
|---|---|
| 処理フロー | 専ブラ書き込み: DB保存 `"テスト&#128512;"` → DAT出力: スレタイはescapeHtml対象外 → sanitizeForCp932: `&#128512;` は全てASCII/CP932対応文字なのでそのまま → 専ブラ: `&#128512;` をHTMLエンティティとして解釈 → 絵文字表示 |
| 期待動作 | 絵文字が表示される |
| 推定現状 | `&#128512;` がそのままDAT出力 → 専ブラがHTML解釈 → 正常表示 |
| ユーザー報告 | 正常 |
| 判定 | **OK** — HTML数値参照がスレタイフィールドではescapeHtmlされないため、専ブラがHTMLとして正しく解釈できる |

### パターン14: 専ブラ → 専ブラ / スレタイ / 末尾注意(VS付き)

| 項目 | 内容 |
|---|---|
| 処理フロー | 専ブラ書き込み: ChMateが `🕳️` を送信する際の処理が鍵。VS (U+FE0F) の扱い: (a) ChMateがVSもHTML数値参照にする: `&#128371;&#65039;` → DB保存 → DAT出力: sanitizeForCp932では全てASCIIなので変化なし → 専ブラ: `&#128371;&#65039;` → HTML解釈 → U+1F573 + U+FE0F → 正常表示? (b) ChMateがVSを除去して送る: `&#128371;` のみ → 正常 (c) ChMateがVSをそのまま(非Shift_JISバイト)送る: TextDecoder("shift_jis")がreplacement character(`�`)を挿入 |
| 期待動作 | 基底絵文字が表示される（VS有無は問わない） |
| 推定現状 | ChMateの動作次第だが、VSのHTML数値参照 `&#65039;` がDAT出力に残る場合、専ブラがHTMLとして解釈して U+FE0F を文字化けマーク(`�`)として表示する可能性 |
| ユーザー報告 | NG: 絵文字+`�`付着 |
| 判定 | **NG** — 原因推定: ChMateがVS(U+FE0F)をHTML数値参照 `&#65039;` で送信 → DBに保存 → DAT出力で `&#65039;` がそのまま残る → 専ブラがHTMLとして解釈しU+FE0Fを表示しようとするが、専ブラのフォントがU+FE0Fを独立文字として描画できず化ける。あるいはChMateがVSバイトをそのまま送り、TextDecoder("shift_jis")がreplacement character(`�`)を挿入してDB保存される |

### パターン15: 専ブラ → 専ブラ / 本文 / 通常絵文字

| 項目 | 内容 |
|---|---|
| 処理フロー | DB: `"テスト&#128512;"` → DatFormatter.formatBody: escapeHtml(`"テスト&#128512;"`) → `"テスト&amp;#128512;"` (**`&` が `&amp;` に変換される**) → replaceBotEmoji: 変化なし → sanitizeForCp932: ASCIIなので変化なし → 専ブラ: `&amp;#128512;` をHTMLとして解釈 → `&#128512;` という生テキストが表示される |
| 期待動作 | 絵文字が表示される |
| 推定現状 | escapeHtmlが `&#128512;` の `&` を `&amp;` に変換し、二重エスケープが発生 → 専ブラで `&#128512;` テキストが表示される |
| ユーザー報告 | NG: `&#....` になる |
| 判定 | **NG** — **根本原因: escapeHtmlによるHTML数値参照の二重エスケープ**。`&` → `&amp;` により `&#N;` が壊れる |

### パターン16: 専ブラ → 専ブラ / 本文 / 末尾注意(VS/ZWJ)

| 項目 | 内容 |
|---|---|
| 処理フロー | パターン15と同様。加えてVS由来の `&#65039;` も二重エスケープされる |
| 期待動作 | 基底絵文字が表示される |
| 推定現状 | 二重エスケープにより `&#128371;&amp;#65039;` 等のテキストが表示される |
| 判定 | **NG** — パターン15と同じ根本原因 |

## 3. 問題の根本原因分析

### 原因A: 専ブラ書き込み時のHTML数値参照がUTF-8に逆変換されない（書き込み時問題）

専ブラがShift_JIS非対応文字をHTML数値参照 `&#NNNNN;` で送信する場合、サーバーはこれをUTF-8のコードポイントに逆変換すべきだが、現在の `decodeFormData` はそのまま生テキストとしてDB保存している。

- **影響パターン**: 9, 10, 11, 12, 13, 14, 15, 16（専ブラ書き込み全パターン）
- **影響の深刻度**: パターン13は偶然正常（スレタイ+専ブラ閲覧ではescapeHtmlを通らないため）

### 原因B: DatFormatter.escapeHtmlがDB内のHTML数値参照を二重エスケープする（閲覧時問題）

DB内に `&#NNNNN;` がある場合、`escapeHtml` が `&` を `&amp;` に変換するため、専ブラで表示すると `&#NNNNN;` が生テキストとして見える。

- **影響パターン**: 15, 16（専ブラ書き込み→専ブラ閲覧の本文パターン）
- **注意**: これは原因Aを修正すればDB内にHTML数値参照が存在しなくなるため自動的に解消される

### 原因C: Web UIがHTML数値参照をHTMLとして解釈しない（閲覧時問題）

ReactのテキストノードはHTMLエスケープされるため、DB内の `&#NNNNN;` は生テキストとして表示される。

- **影響パターン**: 10, 11, 12（専ブラ書き込み→Web閲覧パターン）
- **注意**: 原因Aを修正すればDB内にUTF-8文字が保存されるため自動的に解消される

### 原因D: 専ブラ書き込み時のVariation Selector処理が不十分

ChMateがVSをどう送信するかにより挙動が異なるが、DB保存時にVSが除去されていないことが問題。

- **影響パターン**: 14（専ブラ→専ブラ、スレタイ、末尾注意）
- **注意**: 原因Aの修正に含めてVSの除去処理を書き込み受信時に追加すれば解消

## 4. 修正方針

### 方針1: 書き込み受信時にHTML数値参照をUTF-8に逆変換する（推奨）

**場所**: `bbs.cgi/route.ts`（専ブラ書き込みルート）

**タイミング**: `decodeFormData` の後、`PostService.createPost` / `createThread` の前

**処理内容**:
1. デコード済みUTF-8文字列中のHTML数値参照パターン `&#(\d+);` を検出
2. 各マッチのコードポイント番号から `String.fromCodePoint(N)` でUTF-8文字に変換
3. 異体字セレクタ(U+FE0F, U+FE0E)のHTML数値参照は除去する（UTF-8に変換しない）

**実装イメージ**:
```typescript
// src/lib/infrastructure/encoding/shift-jis.ts に追加
// または新規ユーティリティ関数として

function decodeHtmlNumericReferences(text: string): string {
  return text.replace(/&#(\d+);/g, (match, numStr) => {
    const codePoint = parseInt(numStr, 10);
    // 異体字セレクタは除去
    if (codePoint === 0xFE0F || codePoint === 0xFE0E) {
      return "";
    }
    // 有効なUnicodeコードポイントならUTF-8文字に変換
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match; // 無効なコードポイントはそのまま残す
    }
  });
}
```

**適用箇所** (`bbs.cgi/route.ts`):
```typescript
// decodeFormData後、PostService呼び出し前に適用
const decodedMessage = decodeHtmlNumericReferences(parsed.message);
const decodedSubject = subject ? decodeHtmlNumericReferences(subject.trim()) : "";
```

**変更ファイル**:
- `src/lib/infrastructure/encoding/shift-jis.ts` — `decodeHtmlNumericReferences` 関数を追加
- `src/app/(senbra)/test/bbs.cgi/route.ts` — MESSAGE, subject に逆変換を適用

**メリット**:
- DBには常にUTF-8ネイティブの絵文字が保存される（書き込み元に依存しない統一形式）
- Web閲覧時もReactが正しく絵文字を表示できる
- 専ブラ閲覧時はsanitizeForCp932が再びHTML数値参照に変換する（正しいフロー）
- escapeHtmlの二重エスケープ問題が発生しない
- 既存のDatFormatter/ShiftJisEncoderの変更が不要

**デメリット**:
- 専ブラからの書き込み受信パスに追加処理が必要
- 既にDBに保存されているHTML数値参照データ（過去データ）は別途マイグレーションが必要

### 方針2（代替案）: DatFormatter出力時にHTML数値参照を二重エスケープしないようにする

`escapeHtml` を修正して `&#NNNNN;` パターンの `&` はエスケープしない案。しかしこれは:
- セキュリティリスクがある（XSSベクトルになりうる）
- Web閲覧の問題は解消しない
- 根本原因（DBのデータ形式の不統一）を解消しない

→ **非推奨**

### 方針3（代替案）: Web UIでHTML数値参照をReactコンポーネントで解釈する

PostItemの本文表示でHTML数値参照を検出してUnicode文字に変換する処理を追加する案。

→ **非推奨**: 閲覧側で書き込み元の違いを吸収するのは責務が不適切。DBのデータ形式を統一する方針1が正しい。

## 5. BOT_EMOJI_REPLACEMENTSの設計見直し

### 現状

```typescript
const BOT_EMOJI_REPLACEMENTS: [RegExp, string][] = [
  [/🤖/g, "[BOT]"],
  [/🦾/g, "[BOT]"],
  [/🦿/g, "[BOT]"],
  [/🧠/g, "[BOT]"],
];
```

- DatFormatter内でBOT絵文字4種のみを `[BOT]` に置換
- `formatBody` と `buildDat`(displayName) で使用
- `sanitizeForCp932` の前に適用されるため、`[BOT]` はASCIIとしてCP932エンコード可能

### Phase 2で追加されたinlineSystemInfo内の絵文字

PostServiceの `createPost` 内:
```typescript
const rewardMessages = incentiveGranted.map(
  (g) => `📝 ${g.eventType} +${g.amount}`,
);
```

この `📝` (U+1F4DD) はDB保存時にUTF-8文字として保存される。DatFormatter.formatBody内で `inlineSystemInfo` は `escapeHtml` → `replaceBotEmoji` を経由するが、`📝` はBOT_EMOJI_REPLACEMENTSに含まれないため、最終的に `sanitizeForCp932` でHTML数値参照に変換される。

**現状の挙動**: `📝` → `&#128221;` → 専ブラがHTMLとして解釈 → 絵文字表示。これは正常に動作するはず。

### 見直し方針

**結論: BOT_EMOJI_REPLACEMENTSの拡充は不要**

理由:
1. `sanitizeForCp932` がCP932非対応文字を全てHTML数値参照に変換する汎用処理を担っている
2. BOT_EMOJI_REPLACEMENTSはセマンティックな意味（BOTマーク絵文字→[BOT]テキスト）のための置換であり、エンコーディング変換とは目的が異なる
3. `📝` `💰` `🌿` `🗑️` 等のinlineSystemInfo絵文字は専ブラでもHTML数値参照として正しく表示されるため、[BOT]のようなテキスト置換は不要
4. BOT_EMOJI_REPLACEMENTSを汎用化すると、意図しない絵文字が置換対象になるリスクがある

**推奨**: 現行のBOT_EMOJI_REPLACEMENTSは据え置き。新たなBOT絵文字が追加された場合のみ個別にマッピングを追記する。

ただし以下の注意点がある:
- `🗑️` (U+1F5D1 + U+FE0F) のようなVS付き絵文字がinlineSystemInfo内にある場合、`sanitizeForCp932` でVSが除去されるため、表示は基底文字のみ。これは許容範囲（専ブラの制約）。
- replaceBotEmojiがescapeHtml後に適用されているが、BOT絵文字はHTML特殊文字を含まないため干渉は発生しない（現状で問題なし）

### 処理タイミングについて

- **書き込み時（受信）で処理**: 方針1のHTML数値参照逆変換のみ
- **閲覧時（送信）で処理**: BOT_EMOJI_REPLACEMENTS + sanitizeForCp932（現状維持）

書き込み時にBOT絵文字を置換する案もあるが、これはDB内のデータから絵文字情報が消失し、Web閲覧時に `[BOT]` テキストが表示されてしまうため不適切。閲覧時（DAT変換時）の処理が正しい。

## 6. 修正による影響範囲と実装タスク一覧

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/infrastructure/encoding/shift-jis.ts` | `decodeHtmlNumericReferences()` 関数を追加（VS除去含む） |
| `src/app/(senbra)/test/bbs.cgi/route.ts` | MESSAGE, subject, FROM に逆変換を適用 |

### 変更不要ファイル

| ファイル | 理由 |
|---|---|
| `src/lib/infrastructure/adapters/dat-formatter.ts` | escapeHtml/replaceBotEmoji/sanitizeForCp932 いずれも変更不要 |
| `src/lib/services/post-service.ts` | DBにUTF-8が保存されるため変更不要 |
| `src/app/(web)/_components/PostItem.tsx` | UTF-8絵文字はReactが正しく表示するため変更不要 |

### テスト追加・修正

1. `src/__tests__/lib/infrastructure/encoding/shift-jis.test.ts` — `decodeHtmlNumericReferences` のユニットテスト
   - 通常絵文字: `&#128512;` → `😀`
   - VS除去: `&#128371;&#65039;` → `🕳`（VSなし）
   - ZWJ保持: `&#128104;&#8205;&#128187;` → `👨‍💻`
   - 無効コードポイント: そのまま残す
   - 通常テキスト: 変化なし
2. BDDシナリオ（エスカレーション対象: 既存シナリオの期待値変更が必要かの確認）

### 既存データのマイグレーション

DBに既にHTML数値参照テキストとして保存されたデータが存在する場合、以下のSQL更新が必要:
```sql
-- posts.body 内の &#N; パターンをUTF-8に変換するマイグレーションスクリプト
-- 注意: PostgreSQLの chr() 関数を使用
```
ただしMVPフェーズでは既存データ量が少ないため、手動対応または無視で十分かもしれない。

## 7. パターン9のユーザー報告との矛盾について

ユーザー報告ではパターン9（専ブラ→Web、スレタイ、通常絵文字）が「正常」とされている。しかしコード分析上は、HTML数値参照がDBに保存されReactが生テキスト表示するため、NGであるべき。

考えられる説明:
1. **ChMateがスレタイの通常絵文字をUTF-8バイトで送信している**: Shift_JISに存在しないバイトが含まれるため、TextDecoder("shift_jis")がU+FFFD(replacement character)に変換する可能性が高い。ただしユーザーが「正常」と判断しているなら、何らかの形で絵文字が表示されている。
2. **テストに使用した絵文字がShift_JIS/CP932に含まれる文字だった**: 一部の記号はCP932に含まれるが、通常の絵文字(U+1F600等)はCP932に存在しない。
3. **ユーザーの確認が不十分だった可能性**: 実際にはNGだがスレタイの一部しか確認していない。

**推奨**: 方針1の修正を実装した後、16パターン全てを実機で再検証すること。パターン9の報告を鵜呑みにせず、修正後の統合テストで確認する。

## 8. まとめ

| パターン | 書き込み元 | 閲覧先 | フィールド | 絵文字種別 | 判定 | 問題原因 |
|---|---|---|---|---|---|---|
| 1 | Web | Web | スレタイ | 通常 | OK | - |
| 2 | Web | Web | スレタイ | 末尾注意 | OK | - |
| 3 | Web | Web | 本文 | 通常 | OK | - |
| 4 | Web | Web | 本文 | 末尾注意 | OK | - |
| 5 | Web | 専ブラ | スレタイ | 通常 | OK | - |
| 6 | Web | 専ブラ | スレタイ | 末尾注意 | OK | - |
| 7 | Web | 専ブラ | 本文 | 通常 | OK | - |
| 8 | Web | 専ブラ | 本文 | 末尾注意 | OK | - |
| 9 | 専ブラ | Web | スレタイ | 通常 | **要確認** | 原因A (HTML数値参照未逆変換) |
| 10 | 専ブラ | Web | スレタイ | 末尾注意 | **NG** | 原因A + C |
| 11 | 専ブラ | Web | 本文 | 通常 | **NG** | 原因A + C |
| 12 | 専ブラ | Web | 本文 | 末尾注意 | **NG** | 原因A + C + D |
| 13 | 専ブラ | 専ブラ | スレタイ | 通常 | OK | 偶然正常（escapeHtml非経由） |
| 14 | 専ブラ | 専ブラ | スレタイ | 末尾注意 | **NG** | 原因D (VS未除去) |
| 15 | 専ブラ | 専ブラ | 本文 | 通常 | **NG** | 原因A + B (二重エスケープ) |
| 16 | 専ブラ | 専ブラ | 本文 | 末尾注意 | **NG** | 原因A + B + D |

**修正方針**: bbs.cgi受信時にHTML数値参照をUTF-8に逆変換する（方針1）。これにより原因A/B/C/Dの全てが解消される。
