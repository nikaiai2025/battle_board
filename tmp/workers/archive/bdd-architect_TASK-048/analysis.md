# TASK-048 本番問題分析レポート

> 作成: 2026-03-15 アーキテクトAI
> 分類: 本番バグ分析 / 設計レベル対応方針

---

## 問題1: Shift-JIS文字化け（CP932マッピング可能な文字が全角？に置換される）

### 原因推定

`isCp932Unmappable()` の判定ロジックに**構造的な偽陽性バグ**がある。

```typescript
private isCp932Unmappable(char: string): boolean {
  const encoded = iconv.encode(char, ShiftJisEncoder.ENCODING);
  return encoded.length === 1 && encoded[0] === 0x3f;
}
```

この判定は「iconv-liteが未マッピング文字を1バイトの `0x3F`（ASCII `?`）に変換する」という挙動を利用している。しかし、以下の偽陽性パターンが存在する:

**パターンA: CP932で1バイト `0x3F` に正しくエンコードされる文字**

CP932において、ASCII互換範囲の文字はそのまま1バイトにエンコードされる。呼び出し元で `char !== "?"` のガードがあるが、これは `U+003F`（半角?）のみを除外している。**ASCII範囲内で `0x3F` にマッピングされるのは `?` のみであるため、このパターン自体は問題ない。**

**パターンB: Cloudflare Workers環境でのiconv-liteの挙動差異（有力仮説）**

iconv-liteはNode.js環境ではネイティブのBuffer操作を使うが、Cloudflare Workers環境ではWeb APIベースのポリフィルで動作する。Workers環境では:

1. iconv-liteの内部テーブル（CP932マッピングテーブル）のロードが不完全になる可能性がある
2. 特にCP932の拡張領域（NEC特殊文字、IBM拡張文字、ユーザー定義文字）のマッピングが欠落し、本来エンコード可能な文字が `0x3F` にフォールバックする

**パターンC: 全角記号のCP932マッピング境界の問題**

CP932には JIS X 0208 の範囲外だがWindows拡張で追加された文字がある（丸数字 ①②③、ローマ数字 IVXI、単位記号 ㍉㍊ 等）。これらはiconv-liteの "CP932" テーブルではカバーされているはずだが、環境によってはマッピングが不完全な可能性がある。

### Sprint-18以前の「半角???」の根本原因

Sprint-18以前は `sanitizeForCp932()` が存在せず、`encode()` が直接 `iconv.encode(text, "CP932")` を呼んでいた。iconv-liteはエンコード不可能な文字を `0x3F`（半角?）に変換するのがデフォルト動作であるため:

- **ユーザー投稿の絵文字**（U+1F600以上のサロゲートペア文字）: 1文字が2つのサロゲートに分解され、各サロゲートが個別に `0x3F` に変換 → `??` になる
- **BMP内のUnicode記号**（U+2764 ❤ 等）: CP932未マッピングのため `0x3F` → `?` になる
- **固定テキスト中のUnicode文字**: DAT形式のフォーマット文字列内にUnicode文字が含まれていた場合も同様

最も可能性が高いのは**ユーザー投稿の絵文字**。現代のスマートフォンユーザーは日常的に絵文字を使用するため、これが「???」の主原因と推定する。

### 修正方針

**方針A（推奨）: encode時の入出力比較方式に変更**

`sanitizeForCp932()` の判定ロジックを、1文字ずつの個別エンコードではなく、**エンコード → デコードのラウンドトリップ**で検証する方式に変更する:

```typescript
sanitizeForCp932(text: string): string {
  let result = "";
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint > 0xffff) {
      result += CP932_FALLBACK_CHAR; // サロゲートペア → 全角？
    } else {
      // ラウンドトリップ検証: encode → decode して元の文字と一致するか
      const encoded = iconv.encode(char, "CP932");
      const decoded = iconv.decode(encoded, "CP932");
      if (decoded === char) {
        result += char; // 正常にラウンドトリップできる → そのまま使用
      } else {
        result += CP932_FALLBACK_CHAR; // ラウンドトリップ不一致 → 全角？
      }
    }
  }
  return result;
}
```

この方式のメリット:
- `0x3F` のバイト値に依存しないため、偽陽性が発生しない
- 半角 `?` の特別扱い（`char !== "?"`）が不要になる
- iconv-liteの内部実装に依存しない、より堅牢な判定

デメリット:
- encode + decode の2回処理でパフォーマンスが若干低下する（ただし1文字単位の処理自体が既にオーバーヘッドであり、追加コストは微小）

**方針B（調査優先）: Workers環境のiconv-lite動作を検証**

本番環境（Cloudflare Workers）で具体的にどの文字が偽陽性になっているかを特定する。テスト用エンドポイントを一時的に設置し、CP932の主要文字範囲のエンコード結果をダンプする。

**判断: 方針Aを即時実施し、方針Bは並行調査とする。** 方針Aはどの環境でも正しく動作する汎用的な解決策であり、方針Bの調査結果に依存しない。

### パフォーマンスへの影響

`sanitizeForCp932()` は全ての専ブラ向けレスポンス（DAT出力、subject.txt、HTMLレスポンス等）で呼ばれる。ラウンドトリップ方式への変更により1文字あたりのコストが約2倍になるが:

- 元々1文字ずつ `iconv.encode()` を呼ぶ O(n) 処理であり、追加の `iconv.decode()` は定数倍の増加
- DAT出力のボトルネックはDB読み取りとネットワークI/Oであり、文字エンコード処理は支配的ではない
- 必要に応じて結果キャッシュ（LRUマップ等）で最適化可能

---

## 問題2: 認証後にメアド欄を消すと再認証される

### 原因推定

**原因D（最有力）: ChMateがbbs.cgiレスポンスのSet-Cookieでedge-tokenを更新しない**

write_tokenフローの処理シーケンスを追跡する:

```
1. ChMate初回書き込み
   → edge-token A 発行（is_verified=false）
   → 認証案内HTML返却 + Set-Cookie: edge-token=A

2. ブラウザで /auth/verify にアクセス
   → 認証コード + Turnstile 検証成功
   → users.is_verified = true（edge-token A のユーザー）
   → write_token W 発行

3. ChMateでメアド欄に #W を入れて書き込み
   → bbs.cgi route: write_token W を検出
   → verifyWriteToken(W): 成功。返却値 edgeToken = A（auth_codes.token_id）
   → parsedWithToken.edgeToken = A に差し替え
   → handleCreatePost → PostService.createPost → resolveAuth(A, ipHash, false)
   → verifyEdgeToken(A, ipHash)
   →→ user = findByAuthToken(A) → 存在する
   →→ user.isVerified = true ← ★ verifyAuthCode / verifyWriteToken で true に更新済み
   →→ user.authorIdSeed === ipHash？ ← ★ ここが問題の分岐点
   → 書き込み成功
   → setEdgeTokenCookie(response, A) ← Set-Cookie: edge-token=A

4. ChMateでメアド欄を空にして再度書き込み
   → ChMateが送るCookie: edge-token=？
```

**核心的な問題: ステップ4でChMateが送るedge-tokenの値**

以下の2つのサブケースがある:

**D-1: ChMateがSet-Cookieを保持しない場合**

ChMateの内部HTTP実装がbbs.cgiのSet-Cookieヘッダを無視または上書きしない場合、ステップ3のレスポンスで設定されるedge-token Cookie が反映されない。ステップ4ではCookieが空（edge-token=null）となり、`resolveAuth(null, ipHash)` が呼ばれ、新規ユーザーとして認証案内が返される。

**D-2: IP変更によるip_mismatch → valid:false 返却**

ステップ1（初回書き込み）とステップ4（再書き込み）でIPアドレスが異なる場合、`verifyEdgeToken` で `ip_mismatch` が返る。`resolveAuth` は `ip_mismatch` 時に `findByAuthToken` で再取得を試みるが、この処理自体は正しく動作するはず。

**ただし、現在の `verifyEdgeToken` 実装にはより根本的な問題がある:**

```typescript
// auth-service.ts L179
if (user.authorIdSeed !== ipHash) {
  return { valid: false, reason: 'ip_mismatch' }
}
```

`authorIdSeed` はユーザー作成時のIPハッシュであり、`ipHash` は現在リクエストのIPハッシュ。モバイル回線では頻繁にIPが変わるため、**同一セッション中でもIPが変わることは日常的**。`resolveAuth` は `ip_mismatch` を受けた後に `findByAuthToken` で取得し直して続行するため、IP変更自体は問題にならないはず。

**しかし、eddistの参考実装（docs/research/eddist_edge_token_ip_report_2026-03-14.md）では投稿時のIP一致チェック自体が存在しない**（「有効トークンの検証は『存在確認+validity』のみでIP一致チェックなし」）。現在の実装は不必要に厳格。

### 結論: D-1が最有力

ChMateのbbs.cgi向けHTTP実装は、レスポンスのSet-Cookieヘッダからedge-token Cookieを正しく更新するかどうかが不確定。多くの5ch専ブラは:

1. 初回接続時のCookieは保持する
2. しかし**書き込みAPIのレスポンスのSet-Cookieは処理しない実装が存在する**

初回書き込み（ステップ1）でSet-Cookie: edge-token=A が設定された場合、ChMateはこのCookieを保持する。ステップ3でwrite_tokenフロー成功後のSet-Cookie: edge-token=A は同一値なので影響なし。問題は:

- ChMateが初回のSet-Cookieを保持 → ステップ4でedge-token=A を送信 → `verifyEdgeToken(A, ipHash)` → **is_verified=true, IP一致 → 成功するはず**

つまり**D-1でもIPが変わっていなければ成功するはず**。

**真の原因候補の再検討:**

**D-3（新仮説）: ChMateが認証案内HTMLをエラーレスポンスとしてキャッシュしている**

ChMateはbbs.cgiのレスポンスHTMLの `<title>` タグを見て成功/失敗を判定する。ステップ1の認証案内レスポンスが `<title>` に「ＥＲＲＯＲ」を含んでいた場合、ChMateが**そのスレッドへの書き込みをエラー状態としてキャッシュ**し、以降の書き込み試行で内部的にブロックしている可能性がある。

**D-4（新仮説）: write_tokenフロー成功時にedge-token Aが既にis_verified=trueだが、IPが変わっている**

ステップ3の実行中:
1. `verifyWriteToken(W)` → 成功、`edgeToken = A` を返す
2. `parsedWithToken.edgeToken = A` に設定
3. `handleCreatePost` → `PostService.createPost` → `resolveAuth(A, ipHash)`
4. `verifyEdgeToken(A, ipHash)` → user存在、is_verified=true、**IPチェック**

ここで `user.authorIdSeed !== ipHash` の場合:
- `ip_mismatch` が返る
- `resolveAuth` が `findByAuthToken(A)` で取得し直し → 成功
- 書き込みは成功する

しかし、ステップ4（メアド欄空で再書き込み）:
- ChMateが edge-token=A を送信
- `verifyEdgeToken(A, ipHash2)` → IP不一致 → `ip_mismatch`
- `resolveAuth` → `findByAuthToken(A)` → user取得 → 成功するはず

**やはり理論上は成功するはず。**

### 確定的な原因特定のための調査項目

1. **サーバーログの確認**: ステップ4のリクエストで実際に送信されているedge-token Cookieの値を確認する
2. **ChMateのCookie保持挙動の確認**: ChMateがbbs.cgiレスポンスのSet-Cookieを保持するか実機で検証する
3. **bbs.cgiレスポンスのHTMLフォーマット確認**: 認証案内HTMLの `<title>` タグの内容がChMateのエラーキャッシュを誘発していないか確認する

### 修正方針

**即時対応（設計変更）:**

1. **`verifyEdgeToken` からIPチェックを削除する**

   eddistの参考実装に倣い、投稿時のIP一致チェックを完全に廃止する。`verifyEdgeToken` の責務を「edge-tokenの存在確認 + is_verified確認」のみに絞る。

   ```typescript
   export async function verifyEdgeToken(
     token: string,
     _ipHash: string  // 後方互換のためシグネチャは維持、使用しない
   ): Promise<VerifyResult> {
     const user = await UserRepository.findByAuthToken(token)
     if (!user) return { valid: false, reason: 'not_found' }
     if (!user.isVerified) return { valid: false, reason: 'not_verified' }
     return { valid: true, userId: user.id, authorIdSeed: user.authorIdSeed }
   }
   ```

   根拠:
   - eddistの本番運用実績: IP変更時に再認証を要求しない設計で問題なく運用されている
   - BDDシナリオ「認証済みユーザーのIPアドレスが変わっても書き込みが継続できる」と整合する
   - `resolveAuth` の `ip_mismatch` 分岐が不要になり、コードが大幅に簡素化される
   - `author_id_seed`（日次リセットID用）はユーザー作成時に固定されるため、IPチェック削除の影響を受けない

   これにより、`resolveAuth` の `ip_mismatch` 分岐（L160-181）が完全に不要になる。

2. **`resolveAuth` の簡素化**

   `verifyEdgeToken` が `ip_mismatch` を返さなくなるため、`resolveAuth` は以下のシンプルな分岐のみになる:
   - `valid: true` → 認証成功
   - `not_found` → 新規ユーザーとして認証フロー起動
   - `not_verified` → 認証コード再発行

3. **ChMateのCookie保持問題への保険策**

   write_tokenフロー成功時に、レスポンスのSet-CookieだけでなくHTMLレスポンス内にもedge-tokenを埋め込む（JavaScriptでの自動Cookie設定用）ことを検討する。ただしこれは専ブラがJavaScript実行しない場合は機能しないため、根本解決にはならない。

   より現実的な保険策: **write_tokenフロー成功時に、成功HTMLレスポンスのtitleを「書きこみました」にする**ことで、ChMateのエラーキャッシュを防止する。（現在の実装でも `buildSuccess` が使われているため、この点は問題ないはず。要確認。）

---

## BDDシナリオ変更の要否判定

### 問題1（文字化け）: BDDシナリオ変更 **不要**

既存シナリオ:
- 「すべてのレスポンスがShift_JIS（CP932）でエンコードされる」
- 「専ブラからのPOSTデータがShift_JISとして正しくデコードされる」

これらは修正後も有効なまま。`sanitizeForCp932()` の内部実装変更であり、外部から見た振る舞い（CP932エンコードされたレスポンスが返される）は変わらない。

**ただし、単体テスト（Vitest）の追加を推奨する:**
- `src/__tests__/lib/infrastructure/encoding/shift-jis.test.ts` に、CP932でエンコード可能な日本語文字（ひらがな、カタカナ、漢字、全角記号、丸数字等）が `sanitizeForCp932()` で置換されないことを検証するテストケースを追加する

### 問題2（再認証）: BDDシナリオ変更 **不要** （ただし条件付き）

既存シナリオ:
- 「認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する」 → ステップ3をカバー
- 「Cookie共有の専ブラでは認証後そのまま書き込みできる」 → ステップ4の期待動作と合致

「Cookie共有の専ブラでは認証後そのまま書き込みできる」シナリオが、write_tokenフロー成功**後**のCookieベース書き込みをカバーしている。修正方針（IPチェック削除）はこのシナリオの期待動作を変更しない。

**`verifyEdgeToken` の VerifyResult型から `ip_mismatch` を削除する場合:**
- `ip_mismatch` reason は型定義からも削除可能
- 既存の単体テスト（`auth-service.test.ts` の `ip_mismatch` テストケース）は削除または「IP変更時も成功する」テストに書き換えが必要
- BDDシナリオ「認証済みユーザーのIPアドレスが変わっても書き込みが継続できる」はそのまま有効（むしろこのシナリオにより適合する実装になる）

### 新規BDDシナリオの追加提案

以下のシナリオは**現時点では追加不要**だが、G5（ChMateで認証キャンセル後に書き込み不能）の実機検証結果次第で検討する:

```gherkin
Scenario: write_tokenでの認証成功後、メール欄を空にして2回目の書き込みが成功する
  Given ユーザーがwrite_tokenでの認証を完了している
  And 専ブラがedge-token Cookieを保持している
  When メール欄を空にしてbbs.cgiに書き込みをPOSTする
  Then 書き込みがスレッドに追加される
```

このシナリオは今回報告された問題そのものを記述しているが、**Cookie保持はクライアント（専ブラ）側の実装に依存する**ため、サーバー側のBDDシナリオとして記述するのは適切でない可能性がある。実機検証でサーバー側の原因が特定された場合にのみ追加を検討する。

---

## 実装タスクのサマリ

| # | タスク | 対象ファイル | 優先度 |
|---|---|---|---|
| 1 | `sanitizeForCp932()` をラウンドトリップ方式に変更 | `src/lib/infrastructure/encoding/shift-jis.ts` | 高 |
| 2 | shift-jis単体テスト: CP932マッピング可能文字の非置換テスト追加 | `src/__tests__/lib/infrastructure/encoding/shift-jis.test.ts` | 高 |
| 3 | `verifyEdgeToken` からIPチェックを削除 | `src/lib/services/auth-service.ts` | 高 |
| 4 | `resolveAuth` の `ip_mismatch` 分岐を削除・簡素化 | `src/lib/services/post-service.ts` | 高 |
| 5 | VerifyResult型から `ip_mismatch` を削除 | `src/lib/services/auth-service.ts` | 中 |
| 6 | 単体テスト: `ip_mismatch` テストケースの書き換え | `src/__tests__/` | 中 |
| 7 | 本番環境でのiconv-lite CP932マッピング調査（Workers環境） | 調査用エンドポイント | 低 |
| 8 | G5実機検証: ChMateのCookie保持・エラーキャッシュ挙動 | 実機テスト | 中 |

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `src/lib/infrastructure/encoding/shift-jis.ts` | 問題1の修正対象 |
| `src/lib/services/auth-service.ts` | 問題2の修正対象 |
| `src/lib/services/post-service.ts` | 問題2の修正対象（resolveAuth簡素化） |
| `src/app/(senbra)/test/bbs.cgi/route.ts` | 問題2の関連（write_tokenフロー） |
| `features/constraints/specialist_browser_compat.feature` | BDDシナリオ（変更不要） |
| `features/phase1/authentication.feature` | BDDシナリオ（変更不要） |
| `docs/research/eddist_edge_token_ip_report_2026-03-14.md` | eddist参考実装（IPチェック削除の根拠） |
