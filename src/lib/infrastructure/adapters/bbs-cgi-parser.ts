/**
 * BbsCgiParser — bbs.cgi POSTリクエストのパース → BbsCgiParsedRequest変換
 *
 * 5ch専用ブラウザからのbbs.cgi POSTリクエストをパースし、
 * アプリケーション層が扱えるUTF-8の構造体に変換する。
 *
 * エンコーディング変換の境界（Inbound）:
 *   bbs.cgi POSTのShift_JISデコードは本クラス内またはRoute Handlerで行い、
 *   以降はすべてUTF-8で流れる設計を守る。
 *   URLSearchParamsはNode.jsがURLデコード済みの文字列を提供するため、
 *   Shift_JISデコードは呼び出し元（Route Handler）がBufferをデコードしてから
 *   URLSearchParamsを構築する責任を持つ。本クラスはデコード済み文字列を受け取る。
 *
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario 専ブラからの書き込みが正常に処理される
 *   @scenario 専ブラからの新規スレッド作成が正常に処理される
 *   @scenario 専ブラのコマンド文字列がゲームコマンドとして解釈される
 * See: docs/architecture/components/senbra-adapter.md §2 BbsCgiParser, §3 公開インターフェース
 */

import { EDGE_TOKEN_COOKIE } from '../../constants/cookie-names'

/**
 * BbsCgiParserのパース結果型。
 * フィールドはすべてデコード済みUTF-8文字列。
 */
export interface BbsCgiParsedRequest {
  /** 専ブラが指定したスレッドキー（keyパラメータ） */
  threadKey: string;
  /** 板ID（bbsパラメータ） */
  boardId: string;
  /** 投稿本文（MESSAGEパラメータ、デコード済み） */
  message: string;
  /** 投稿者名（FROMパラメータ、デコード済み） */
  name: string;
  /** メールフィールド（mailパラメータ、sagageなど） */
  mail: string;
  /**
   * 認証トークン（cookieのedge-tokenから取得）。
   * cookie未設定または該当cookieがない場合はnull。
   */
  edgeToken: string | null;
}

/**
 * bbs.cgi POSTリクエストのパーサー。
 *
 * 責務: URLSearchParams + cookieヘッダ → BbsCgiParsedRequest変換
 */
export class BbsCgiParser {
  /**
   * edge-tokenを格納するcookie名。
   * See: src/lib/constants/cookie-names.ts
   */
  private static readonly EDGE_TOKEN_COOKIE = EDGE_TOKEN_COOKIE;

  /**
   * bbs.cgi POSTリクエストをパースし、BbsCgiParsedRequestを返す。
   *
   * パラメータが省略された場合は空文字列で補填する（エラーはスローしない）。
   * バリデーション・エラー判定はアプリケーション層（サービス）の責任。
   *
   * @param body - デコード済みURLSearchParams（呼び出し元でShift_JISデコード済み）
   * @param cookieHeader - HTTPリクエストのCookieヘッダ文字列
   * @returns パース済みリクエスト構造体
   */
  parseRequest(body: URLSearchParams, cookieHeader: string): BbsCgiParsedRequest {
    return {
      boardId: body.get("bbs") ?? "",
      threadKey: body.get("key") ?? "",
      name: body.get("FROM") ?? "",
      mail: body.get("mail") ?? "",
      message: body.get("MESSAGE") ?? "",
      edgeToken: this.extractEdgeToken(cookieHeader),
    };
  }

  /**
   * CookieヘッダからedgeTokenを抽出する。
   *
   * 形式: "name1=value1; name2=value2; ..."
   * edge-tokenが存在しない場合はnullを返す。
   *
   * @param cookieHeader - HTTPリクエストのCookieヘッダ文字列
   * @returns edge-tokenの値またはnull
   */
  private extractEdgeToken(cookieHeader: string): string | null {
    if (!cookieHeader) return null;

    // セミコロン区切りでcookieを分割し、edge-token=valueを探す
    const cookies = cookieHeader.split(";");
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.trim().split("=");
      if (name === BbsCgiParser.EDGE_TOKEN_COOKIE) {
        return valueParts.join("=") || null;
      }
    }
    return null;
  }
}
