/**
 * BbsCgiResponseBuilder — bbs.cgi レスポンスHTML生成
 *
 * 5ch専用ブラウザが解析できるHTMLレスポンスを生成する。
 * 専ブラはtitleタグの文字列でレスポンスの種類を判別する。
 *
 * レスポンスHTML仕様:
 *   - 成功: titleタグに "書きこみました"
 *   - エラー: titleタグに "ＥＲＲＯＲ"（全角）
 *   - 認証必要: titleタグに "認証" + 認証URL
 *
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario 専ブラからの書き込みが正常に処理される
 *   @scenario 書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 * See: docs/architecture/components/senbra-adapter.md §2 BbsCgiResponseBuilder, §3 公開インターフェース
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
   * 専ブラにはOTP認証URLを提示する。
   *
   * @param code - 認証コード（OTP等）
   * @param edgeToken - Edgeトークン
   * @returns 認証案内HTMLレスポンス文字列（UTF-8）
   */
  buildAuthRequired(code: string, edgeToken: string): string {
    const escapedCode = this.escapeHtml(code);
    const escapedToken = this.escapeHtml(edgeToken);
    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>認証が必要です</title>
</head>
<body>
<b>認証が必要です</b><br>
以下のURLにアクセスして認証を完了してください。<br>
<a href="/auth/verify?code=${escapedCode}&token=${escapedToken}">認証ページへ</a>
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
