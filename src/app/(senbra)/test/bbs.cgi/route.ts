/**
 * POST /test/bbs.cgi — 書き込みAPI（専ブラ互換）
 *
 * 5ch専用ブラウザからの書き込み・スレッド作成リクエストを処理するエンドポイント。
 * リクエストボディはShift_JIS（CP932）エンコードされたapplication/x-www-form-urlencoded形式。
 *
 * 処理フロー:
 *   1. リクエストボディをBufferとして読み取る
 *   2. ShiftJisEncoderでShift_JIS → UTF-8 にデコードする
 *   3. URLSearchParamsとしてパースする
 *   4. BbsCgiParserでBbsCgiParsedRequestに変換する
 *   5. subjectパラメータがある場合は新規スレッド作成、ない場合は書き込み
 *   6. BbsCgiResponseBuilderでHTMLレスポンスを生成する
 *   7. ShiftJisEncoderでUTF-8 → Shift_JIS にエンコードして返す
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの新規スレッド作成が正常に処理される
 * See: features/constraints/specialist_browser_compat.feature @書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 * See: features/constraints/specialist_browser_compat.feature @専ブラのコマンド文字列がゲームコマンドとして解釈される
 * See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 * See: docs/specs/openapi.yaml > /test/bbs.cgi
 * See: docs/architecture/components/senbra-adapter.md §6 エンコーディング変換の境界
 */

import { NextRequest } from "next/server";
import { BbsCgiParser } from "@/lib/infrastructure/adapters/bbs-cgi-parser";
import { BbsCgiResponseBuilder } from "@/lib/infrastructure/adapters/bbs-cgi-response";
import { ShiftJisEncoder } from "@/lib/infrastructure/encoding/shift-jis";
import * as PostService from "@/lib/services/post-service";
import { hashIp, reduceIp } from "@/lib/services/auth-service";
import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";

/** BbsCgiParserのシングルトンインスタンス */
const bbsCgiParser = new BbsCgiParser();

/** BbsCgiResponseBuilderのシングルトンインスタンス */
const responseBuilder = new BbsCgiResponseBuilder();

/** ShiftJisEncoderのシングルトンインスタンス */
const encoder = new ShiftJisEncoder();

/**
 * リクエストからクライアント IP を取得し、ハッシュ化して返す。
 * x-forwarded-for → x-real-ip → '127.0.0.1' のフォールバックチェーン。
 *
 * @param req - Next.js リクエストオブジェクト
 * @returns クライアント IP の SHA-512 ハッシュ
 */
function getIpHash(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1";
  return hashIp(reduceIp(ip));
}

/**
 * HTMLレスポンスをShift_JISエンコードして返すヘルパー。
 *
 * @param html - UTF-8のHTMLレスポンス文字列
 * @param status - HTTPステータスコード
 * @returns Shift_JISエンコードされたHTMLレスポンス
 */
function buildShiftJisHtmlResponse(html: string, status = 200): Response {
  const sjisBuffer = encoder.encode(html);
  return new Response(new Uint8Array(sjisBuffer), {
    status,
    headers: {
      "Content-Type": "text/html; charset=Shift_JIS",
      "Content-Length": String(sjisBuffer.length),
    },
  });
}

/**
 * POST /test/bbs.cgi — 書き込み/スレッド作成（専ブラ互換）
 *
 * Shift_JISデコード → UTF-8変換はRoute Handler層で行い、
 * Application Layer（PostService）にはUTF-8文字列のみを渡す。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの新規スレッド作成が正常に処理される
 * See: docs/architecture/components/senbra-adapter.md §6 エンコーディング変換の境界（Inbound）
 *
 * @param req - リクエスト（application/x-www-form-urlencoded、Shift_JISエンコード）
 * @returns Shift_JISエンコードされたHTMLレスポンス
 */
export async function POST(req: NextRequest): Promise<Response> {
  // Step 1: リクエストボディをBufferとして読み取る
  let bodyBuffer: Buffer;
  try {
    const arrayBuffer = await req.arrayBuffer();
    bodyBuffer = Buffer.from(arrayBuffer);
  } catch {
    const errorHtml = responseBuilder.buildError("リクエストの読み取りに失敗しました");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  // Step 2: Shift_JIS → UTF-8 デコード
  // 専ブラはPOSTボディをShift_JIS（CP932）でエンコードして送信する
  // このデコードはRoute Handler層の責任。Application Layerに漏出させない。
  // See: docs/architecture/components/senbra-adapter.md §6 エンコーディング変換の境界（Inbound）
  const decodedBody = encoder.decode(bodyBuffer);

  // Step 3: URLSearchParamsとしてパースする
  // デコード済みUTF-8文字列からURLSearchParamsを構築する
  let bodyParams: URLSearchParams;
  try {
    bodyParams = new URLSearchParams(decodedBody);
  } catch {
    const errorHtml = responseBuilder.buildError("POSTパラメータのパースに失敗しました");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  // Step 4: BbsCgiParserでBbsCgiParsedRequestに変換する
  const cookieHeader = req.headers.get("cookie") ?? "";
  const parsed = bbsCgiParser.parseRequest(bodyParams, cookieHeader);

  // Step 5: IP ハッシュを取得する
  const ipHash = getIpHash(req);

  // Step 6: subjectパラメータの有無でスレッド作成 or 書き込みを分岐する
  const subject = bodyParams.get("subject") ?? "";

  if (subject.trim() !== "") {
    // 新規スレッド作成
    return handleCreateThread(parsed, subject, ipHash);
  } else {
    // 既存スレッドへの書き込み
    return handleCreatePost(parsed, ipHash);
  }
}

/**
 * 新規スレッドを作成して専ブラ互換HTMLレスポンスを返す。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの新規スレッド作成が正常に処理される
 *
 * @param parsed - BbsCgiパース済みリクエスト
 * @param subject - スレッドタイトル（UTF-8）
 * @param ipHash - クライアントIPハッシュ
 * @returns Shift_JISエンコードされたHTMLレスポンス
 */
async function handleCreateThread(
  parsed: { boardId: string; message: string; name: string; mail: string; edgeToken: string | null },
  subject: string,
  ipHash: string
): Promise<Response> {
  const result = await PostService.createThread(
    {
      boardId: parsed.boardId || "battleboard",
      title: subject.trim(),
      firstPostBody: parsed.message,
    },
    parsed.edgeToken,
    ipHash
  );

  if (result.authRequired) {
    // 認証が必要な場合: 認証案内HTMLを返す
    const authHtml = responseBuilder.buildAuthRequired(
      result.authRequired.code,
      result.authRequired.edgeToken
    );
    const response = buildShiftJisHtmlResponse(authHtml, 200);
    // edge-token Cookie を設定する
    return setEdgeTokenCookie(response, result.authRequired.edgeToken);
  }

  if (!result.success) {
    const errorHtml = responseBuilder.buildError(result.error ?? "スレッドの作成に失敗しました");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  const threadKey = result.thread?.threadKey ?? "";
  const boardId = parsed.boardId || "battleboard";
  const successHtml = responseBuilder.buildSuccess(threadKey, boardId);
  return buildShiftJisHtmlResponse(successHtml, 200);
}

/**
 * 既存スレッドにレスを書き込んで専ブラ互換HTMLレスポンスを返す。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 * See: features/constraints/specialist_browser_compat.feature @書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 *
 * @param parsed - BbsCgiパース済みリクエスト
 * @param ipHash - クライアントIPハッシュ
 * @returns Shift_JISエンコードされたHTMLレスポンス
 */
async function handleCreatePost(
  parsed: { boardId: string; threadKey: string; message: string; name: string; mail: string; edgeToken: string | null },
  ipHash: string
): Promise<Response> {
  // threadKey が空の場合はエラー
  if (!parsed.threadKey) {
    const errorHtml = responseBuilder.buildError("スレッドキーが指定されていません");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  // threadKey からスレッド UUID を取得する
  const thread = await ThreadRepository.findByThreadKey(parsed.threadKey);
  if (!thread) {
    const errorHtml = responseBuilder.buildError("指定されたスレッドが存在しません");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  // PostServiceで書き込みを実行する
  const result = await PostService.createPost({
    threadId: thread.id,
    body: parsed.message,
    edgeToken: parsed.edgeToken,
    ipHash,
    displayName: parsed.name || undefined,
    email: parsed.mail || undefined,
    isBotWrite: false,
  });

  if ("authRequired" in result) {
    // 認証が必要な場合: 認証案内HTMLを返す
    const authHtml = responseBuilder.buildAuthRequired(result.code, result.edgeToken);
    const response = buildShiftJisHtmlResponse(authHtml, 200);
    return setEdgeTokenCookie(response, result.edgeToken);
  }

  if (!result.success) {
    const errorHtml = responseBuilder.buildError(result.error ?? "書き込みに失敗しました");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  const boardId = parsed.boardId || "battleboard";
  const successHtml = responseBuilder.buildSuccess(parsed.threadKey, boardId);
  return buildShiftJisHtmlResponse(successHtml, 200);
}

/**
 * edge-token Cookie を Set-Cookie ヘッダに追加した新しいレスポンスを返す。
 *
 * @param response - 元のレスポンス
 * @param edgeToken - 設定する edge-token の値
 * @returns Cookie が設定されたレスポンス
 */
function setEdgeTokenCookie(response: Response, edgeToken: string): Response {
  const headers = new Headers(response.headers);
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = [
    `${EDGE_TOKEN_COOKIE}=${edgeToken}`,
    "HttpOnly",
    isProduction ? "Secure" : "",
    "SameSite=Lax",
    "Max-Age=2592000", // 30日
    "Path=/",
  ]
    .filter(Boolean)
    .join("; ");
  headers.append("Set-Cookie", cookieOptions);

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
