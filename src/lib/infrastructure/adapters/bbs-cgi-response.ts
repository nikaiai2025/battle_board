/**
 * BbsCgiResponseBuilder — bbs.cgi レスポンスHTML生成
 *
 * 5ch専用ブラウザが解析できるHTMLレスポンスを生成する。
 * 専ブラはtitleタグの文字列でレスポンスの種類を判別する。
 *
 * レスポンスHTML仕様:
 *   - 成功: titleタグに "書きこみました"
 *   - エラー: titleタグに "ＥＲＲＯＲ"（全角）
 *   - 認証必要: titleタグに "ＥＲＲＯＲ"（全角）+ 認証コード + 認証ページURL + 手順説明
 *
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario 専ブラからの書き込みが正常に処理される
 *   @scenario 書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 *   @scenario 専ブラからの初回書き込みで認証案内が返される
 * See: docs/architecture/components/senbra-adapter.md §2 BbsCgiResponseBuilder, §3 公開インターフェース
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 */

/**
 * bbs.cgi HTMLレスポンスの構築クラス。
 *
 * 責務: 書き込み結果 → bbs.cgi互換HTMLレスポンス文字列変換
 * 出力はUTF-8文字列。Shift_JISへの変換は呼び出し元（Route Handler）が担う。
 */
export class BbsCgiResponseBuilder {
  /**
   * 書き込み成功時のレスポンスHTMLを生成する。
   *
   * 専ブラはtitleタグに "書きこみました" が含まれることを成功の判定に使う。
   *
   * @param threadKey - 書き込み先スレッドキー
   * @param boardId - 板ID
   * @returns 書き込み成功HTMLレスポンス文字列（UTF-8）
   */
  buildSuccess(threadKey: string, boardId: string): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>書きこみました</title>
</head>
<body>
<b>書きこみました</b>
<a href="/${boardId}/dat/${threadKey}.dat">スレッドを見る</a>
</body>
</html>`;
  }

  /**
   * 書き込みエラー時のレスポンスHTMLを生成する。
   *
   * 専ブラはtitleタグに "ＥＲＲＯＲ"（全角）が含まれることをエラーの判定に使う。
   * エラー理由はbodyに含める。
   *
   * @param message - エラー理由（UTF-8）
   * @returns エラーHTMLレスポンス文字列（UTF-8）
   */
  buildError(message: string): string {
    const escapedMessage = this.escapeHtml(message);
    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>ＥＲＲＯＲ</title>
</head>
<body>
<b>ＥＲＲＯＲ</b><br>
${escapedMessage}
</body>
</html>`;
  }

  /**
   * 認証が必要な場合の案内HTMLを生成する。
   *
   * 専ブラ向けに認証コード・認証ページURL・手順説明を明示する。
   * 専ブラは WebView を持たないため、ユーザーはブラウザで認証を完了後、
   * write_token をメール欄に貼り付けて再書き込みする（G4対応）。
   *
   * 認証ページURL形式（絶対URL）: {baseUrl}/auth/verify?code={code}&token={edgeToken}
   * 専ブラのWebViewでは相対パスがリンクとして認識されないため絶対URLを使用する。
   *
   * 手順:
   *   1. 以下のURLにアクセスして認証を完了する
   *   2. 表示された認証コードを入力する
   *   3. 発行された write_token をメール欄に "#write_token" 形式で貼り付けて再書き込みする
   *
   * See: features/constraints/specialist_browser_compat.feature @専ブラからの初回書き込みで認証案内が返される
   * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
   * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー > [認証ページ /auth/verify]
   *
   * @param code - 認証コード（6桁数字）
   * @param edgeToken - 発行済み edge-token
   * @param baseUrl - サービスのベースURL（例: "https://example.com"）。末尾スラッシュは除去される
   * @returns 認証案内HTMLレスポンス文字列（UTF-8）
   */
  buildAuthRequired(code: string, edgeToken: string, baseUrl: string): string {
    const escapedCode = this.escapeHtml(code);
    const escapedToken = this.escapeHtml(edgeToken);
    // 末尾スラッシュを除去して二重スラッシュを防ぐ
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const authUrl = `${normalizedBaseUrl}/auth/verify?code=${escapedCode}&token=${escapedToken}`;
    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>ＥＲＲＯＲ</title>
</head>
<body>
<b>ＥＲＲＯＲ</b><br>
認証が必要です。<br>
書き込みにはブラウザでの認証が必要です。<br>
<br>
【認証コード】${escapedCode}<br>
<br>
【手順】<br>
1. 以下のURLにブラウザでアクセスしてください<br>
2. 認証コード ${escapedCode} を入力して認証を完了してください<br>
3. 発行された write_token をメール欄に "#write_token値" 形式で貼り付けて再度書き込んでください<br>
<br>
【認証URL】<br>
<a href="${authUrl}">${authUrl}</a>
</body>
</html>`;
  }

  /**
   * HTML特殊文字をエスケープする。
   * XSS対策のためエラーメッセージ等のユーザー入力を含む値に適用する。
   *
   * @param text - エスケープ対象の文字列
   * @returns エスケープ済み文字列
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
