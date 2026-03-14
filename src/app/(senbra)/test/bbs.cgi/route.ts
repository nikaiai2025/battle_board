/**
 * POST /test/bbs.cgi — 書き込みAPI（専ブラ互換）
 *
 * 5ch専用ブラウザからの書き込み・スレッド作成リクエストを処理するエンドポイント。
 * リクエストボディはShift_JIS（CP932）エンコードされたapplication/x-www-form-urlencoded形式。
 *
 * 処理フロー:
 *   1. リクエストボディをBufferとして読み取る
 *   2. ShiftJisEncoder.decodeFormData()でURL-エンコード済みShift-JISを正しい順序でデコードする
 *      （ASCIIとして読み取り → URLデコードでrawバイト取得 → Shift-JISデコード）
 *   3. BbsCgiParserでBbsCgiParsedRequestに変換する
 *   4. mail欄から write_token パターン (#<32文字hex>) を検出し除去する
 *   5. write_token が検出された場合: AuthService.verifyWriteToken() で検証し、
 *      成功時は edge-token Cookie を設定してから書き込みを続行する
 *   6. subjectパラメータがある場合は新規スレッド作成、ない場合は書き込み
 *   7. BbsCgiResponseBuilderでHTMLレスポンスを生成する
 *   8. ShiftJisEncoderでUTF-8 → Shift_JIS にエンコードして返す
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの新規スレッド作成が正常に処理される
 * See: features/constraints/specialist_browser_compat.feature @書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 * See: features/constraints/specialist_browser_compat.feature @専ブラのコマンド文字列がゲームコマンドとして解釈される
 * See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 * See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
 * See: features/constraints/specialist_browser_compat.feature @無効なwrite_tokenでは書き込みが拒否される
 * See: docs/specs/openapi.yaml > /test/bbs.cgi
 * See: docs/architecture/components/senbra-adapter.md §6 エンコーディング変換の境界
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 */

import { NextRequest } from "next/server";
import { BbsCgiParser } from "@/lib/infrastructure/adapters/bbs-cgi-parser";
import { BbsCgiResponseBuilder } from "@/lib/infrastructure/adapters/bbs-cgi-response";
import { ShiftJisEncoder } from "@/lib/infrastructure/encoding/shift-jis";
import * as PostService from "@/lib/services/post-service";
import { hashIp, reduceIp, verifyWriteToken } from "@/lib/services/auth-service";
import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";

/**
 * mail欄から write_token を検出・除去するための正規表現。
 * write_token は '#' に続く 32 文字の hex 文字列。
 *
 * See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式 > 正規表現: /#([0-9a-f]{32})/i
 */
const WRITE_TOKEN_PATTERN = /#([0-9a-f]{32})/i;

/**
 * BattleBoardのホストURLを環境変数から取得する。
 * 未設定の場合はデフォルトフォールバック値を使用する。
 *
 * NEXT_PUBLIC_BASE_URL を優先し、未設定時は "https://battleboard.vercel.app" を使用する。
 * 本番環境は Cloudflare Workers のため、ダッシュボードで正しい値を設定すること。
 *
 * See: src/app/(senbra)/bbsmenu.html/route.ts — 同パターンの参考実装
 *
 * @returns ベースURL文字列（末尾スラッシュなし）
 */
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "https://battleboard.vercel.app";
}

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
 * mail欄文字列から write_token を抽出する。
 * mail欄に "#<32文字hex>" パターンが含まれる場合、トークン値を返す。
 * 該当なしの場合は null を返す。
 *
 * 例: "sage#a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" → "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
 * 例: "#a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" → "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
 * 例: "sage" → null
 *
 * See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 *
 * @param mail - mail欄の文字列
 * @returns write_token 文字列（32文字hex）または null
 */
function extractWriteToken(mail: string): string | null {
  const match = WRITE_TOKEN_PATTERN.exec(mail);
  return match ? match[1].toLowerCase() : null;
}

/**
 * mail欄文字列から write_token パターンを除去した文字列を返す。
 * write_token がない場合は元の文字列をそのまま返す。
 *
 * 例: "sage#a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" → "sage"
 * 例: "#a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" → ""
 * 例: "sage" → "sage"
 *
 * See: features/constraints/specialist_browser_compat.feature @メール欄のwrite_tokenは書き込みデータに含まれない
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式 > DATに漏洩させない
 *
 * @param mail - mail欄の文字列
 * @returns write_tokenを除去したmail欄文字列
 */
function removeWriteToken(mail: string): string {
  return mail.replace(WRITE_TOKEN_PATTERN, "").trim();
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

  // Step 2-3: URL-エンコード済みShift-JISフォームデータをパースしてUTF-8のURLSearchParamsに変換する
  //
  // 専ブラはShift-JISバイトをURLエンコードして送信する（例: テスト → %83e%83X%83g）。
  // 正しいデコード順序: ASCIIとして読み取り → URLデコードでrawバイト取得 → Shift-JISデコード
  // NG: encoder.decode(bodyBuffer) → new URLSearchParams() の順では、
  //   URLSearchParams が %83 をUTF-8バイトとして誤解釈し文字化けが発生する。
  //
  // See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
  // See: docs/architecture/components/senbra-adapter.md §6 エンコーディング変換の境界（Inbound）
  let bodyParams: URLSearchParams;
  try {
    bodyParams = encoder.decodeFormData(bodyBuffer);
  } catch {
    const errorHtml = responseBuilder.buildError("POSTパラメータのパースに失敗しました");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  // Step 4: BbsCgiParserでBbsCgiParsedRequestに変換する
  const cookieHeader = req.headers.get("cookie") ?? "";

  // [診断ログ] Cookie headerの受信状況をログ出力する
  console.log(`[bbs.cgi] Cookie header: ${cookieHeader || "(absent)"}`);

  const parsed = bbsCgiParser.parseRequest(bodyParams, cookieHeader);

  // [診断ログ] extractEdgeToken結果をログ出力する（セキュリティ配慮: 先頭8文字のみ）
  const edgeTokenPrefix = parsed.edgeToken
    ? `${parsed.edgeToken.slice(0, 8)}...`
    : "null";
  console.log(`[bbs.cgi] edgeToken from cookie: ${edgeTokenPrefix}`);

  // Step 5: IP ハッシュを取得する
  const ipHash = getIpHash(req);

  // Step 6: mail欄から write_token を検出する
  // write_token が含まれる場合は検証し、除去した上で後続処理に渡す。
  // DAT漏洩防止のため write_token は PostService に渡す前に必ず除去する。
  // See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
  // See: features/constraints/specialist_browser_compat.feature @無効なwrite_tokenでは書き込みが拒否される
  // See: tmp/auth_spec_review_report.md §3.2 write_token 方式
  const detectedWriteToken = extractWriteToken(parsed.mail);

  // [診断ログ] write_token検出状況をログ出力する
  console.log(`[bbs.cgi] write_token detected: ${detectedWriteToken !== null}`);

  if (detectedWriteToken !== null) {
    // write_token を検証する
    const writeTokenResult = await verifyWriteToken(detectedWriteToken);

    // [診断ログ] write_token検証結果をログ出力する
    console.log(
      `[bbs.cgi] write_token verification: ${writeTokenResult.valid ? "valid" : "invalid"}`
    );

    if (!writeTokenResult.valid) {
      // 無効な write_token: エラーレスポンスを返す
      const errorHtml = responseBuilder.buildError("認証トークンが無効または期限切れです");
      return buildShiftJisHtmlResponse(errorHtml, 200);
    }

    // 検証成功: write_token を除去した mail 欄で処理を続行する
    // edge-token Cookie を verifyWriteToken が返した edgeToken 値で設定する
    const cleanedMail = removeWriteToken(parsed.mail);
    const verifiedEdgeToken = writeTokenResult.edgeToken!;

    // [診断ログ] Set-Cookie設定時にトークンのプレフィックスをログ出力する（セキュリティ配慮: 先頭8文字のみ）
    console.log(
      `[bbs.cgi] Setting edge-token cookie: ${verifiedEdgeToken.slice(0, 8)}...`
    );

    // edge-token が付与済みの parsed オブジェクトを生成する
    const parsedWithToken = {
      ...parsed,
      mail: cleanedMail,
      edgeToken: verifiedEdgeToken,
    };

    // Step 7: subjectパラメータの有無でスレッド作成 or 書き込みを分岐する
    const subject = bodyParams.get("subject") ?? "";
    let finalResponse: Response;
    if (subject.trim() !== "") {
      finalResponse = await handleCreateThread(parsedWithToken, subject, ipHash);
    } else {
      finalResponse = await handleCreatePost(parsedWithToken, ipHash);
    }

    // 書き込み成功時: edge-token Cookie を有効化済みユーザーのトークンで設定する
    return setEdgeTokenCookie(finalResponse, verifiedEdgeToken);
  }

  // write_token なし: 通常フロー
  // Step 7: subjectパラメータの有無でスレッド作成 or 書き込みを分岐する
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
    // [診断ログ] resolveAuth結果: 認証要求（未認証またはトークン未検証）
    console.log(
      `[bbs.cgi] resolveAuth result: authenticated=false, reason=${result.authRequired.code}`
    );
    // 認証が必要な場合: 認証案内HTMLを返す（絶対URLで生成する）
    const authHtml = responseBuilder.buildAuthRequired(
      result.authRequired.code,
      result.authRequired.edgeToken,
      getBaseUrl()
    );
    const response = buildShiftJisHtmlResponse(authHtml, 200);
    // edge-token Cookie を設定する
    return setEdgeTokenCookie(response, result.authRequired.edgeToken);
  }

  if (!result.success) {
    const errorHtml = responseBuilder.buildError(result.error ?? "スレッドの作成に失敗しました");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  // [診断ログ] resolveAuth結果: 認証済みユーザーによる書き込み成功
  console.log("[bbs.cgi] resolveAuth result: authenticated=true, reason=N/A");

  const threadKey = result.thread?.threadKey ?? "";
  const boardId = parsed.boardId || "battleboard";
  const successHtml = responseBuilder.buildSuccess(threadKey, boardId);
  const response = buildShiftJisHtmlResponse(successHtml, 200);
  // 認証済みユーザーのedge-tokenをSet-Cookieで更新する（eddist整合）
  // parsed.edgeTokenがnullの場合（authRequiredパスで先にreturnされる）、ここには到達しないためnullチェック不要
  return parsed.edgeToken ? setEdgeTokenCookie(response, parsed.edgeToken) : response;
}

/**
 * 既存スレッドにレスを書き込んで専ブラ互換HTMLレスポンスを返す。
 *
 * NOTE: この関数に渡される parsed.mail は write_token 除去済みであること。
 * write_token の検出・除去は呼び出し元の POST ハンドラーで行う。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 * See: features/constraints/specialist_browser_compat.feature @書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 * See: features/constraints/specialist_browser_compat.feature @メール欄のwrite_tokenは書き込みデータに含まれない
 *
 * @param parsed - BbsCgiパース済みリクエスト（mail欄はwrite_token除去済み）
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
    // [診断ログ] resolveAuth結果: 認証要求（未認証またはトークン未検証）
    console.log(
      `[bbs.cgi] resolveAuth result: authenticated=false, reason=${result.code}`
    );
    // 認証が必要な場合: 認証案内HTMLを返す（絶対URLで生成する）
    const authHtml = responseBuilder.buildAuthRequired(result.code, result.edgeToken, getBaseUrl());
    const response = buildShiftJisHtmlResponse(authHtml, 200);
    return setEdgeTokenCookie(response, result.edgeToken);
  }

  if (!result.success) {
    const errorHtml = responseBuilder.buildError(result.error ?? "書き込みに失敗しました");
    return buildShiftJisHtmlResponse(errorHtml, 200);
  }

  // [診断ログ] resolveAuth結果: 認証済みユーザーによる書き込み成功
  console.log("[bbs.cgi] resolveAuth result: authenticated=true, reason=N/A");

  const boardId = parsed.boardId || "battleboard";
  const successHtml = responseBuilder.buildSuccess(parsed.threadKey, boardId);
  const response = buildShiftJisHtmlResponse(successHtml, 200);
  // 認証済みユーザーのedge-tokenをSet-Cookieで更新する（eddist整合）
  // parsed.edgeTokenがnullの場合（authRequiredパスで先にreturnされる）、ここには到達しないためnullチェック不要
  return parsed.edgeToken ? setEdgeTokenCookie(response, parsed.edgeToken) : response;
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
  const cookieOptions = [
    `${EDGE_TOKEN_COOKIE}=${edgeToken}`,
    "HttpOnly",
    "Max-Age=2592000", // 30日
    "Path=/",
  ].join("; ");
  headers.append("Set-Cookie", cookieOptions);

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
