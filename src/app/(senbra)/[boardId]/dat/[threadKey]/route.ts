/**
 * GET /{boardId}/dat/{threadKey}.dat — DATファイル取得
 *
 * 5ch専用ブラウザがスレッドのレスデータを取得するためのエンドポイント。
 * Range差分応答（206 Partial Content）とIf-Modified-Since（304 Not Modified）に対応。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される
 * See: features/constraints/specialist_browser_compat.feature @DATファイルの1行目のみスレッドタイトルを含む
 * See: features/constraints/specialist_browser_compat.feature @レス内の改行がHTMLのbrタグに変換される
 * See: features/constraints/specialist_browser_compat.feature @レス内のHTML特殊文字がエスケープされる
 * See: features/constraints/specialist_browser_compat.feature @日次リセットIDがDATの日付フィールドに正しく含まれる
 * See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
 * See: features/constraints/specialist_browser_compat.feature @更新がない場合は304を返す
 * See: docs/specs/openapi.yaml > /{boardId}/dat/{threadKey}.dat
 * See: docs/architecture/components/senbra-adapter.md §4 Range差分応答の実装方針
 * See: docs/architecture/components/senbra-adapter.md §5.2 被依存
 */

import type { NextRequest } from "next/server";
import { DatFormatter } from "@/lib/infrastructure/adapters/dat-formatter";
import { ShiftJisEncoder } from "@/lib/infrastructure/encoding/shift-jis";
import * as PostRepository from "@/lib/infrastructure/repositories/post-repository";
import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";

/** DatFormatterのシングルトンインスタンス */
const datFormatter = new DatFormatter();

/** ShiftJisEncoderのシングルトンインスタンス */
const encoder = new ShiftJisEncoder();

/**
 * Rangeヘッダを解析してバイトオフセットを返す。
 *
 * 対応形式: "bytes=N-"（開始バイトから末尾まで）
 * 複数Rangeや末尾指定（bytes=-N）は非対応。
 *
 * @param rangeHeader - Range ヘッダ文字列
 * @returns 開始バイト数（解析失敗時は null）
 */
function parseRangeHeader(rangeHeader: string): number | null {
	// "bytes=N-" 形式のみ対応（専ブラは常にこの形式を使う）
	const match = rangeHeader.match(/^bytes=(\d+)-$/);
	if (!match) return null;
	return parseInt(match[1], 10);
}

/**
 * GET /{boardId}/dat/{threadKey}.dat — DATファイル取得（専ブラ互換）
 *
 * 処理フロー:
 * 1. threadKey でスレッドを取得（存在しない場合は 404）
 * 2. If-Modified-Since ヘッダがある場合: last_post_at と比較して 304 を返す可能性あり
 * 3. Range ヘッダがある場合: 差分レスのみを取得して 206 を返す
 * 4. Range ヘッダがない場合: 全レスを取得して 200 を返す
 *
 * Range差分応答の実装方針（senbra-adapter.md §4）:
 * - threads.dat_byte_size を取得
 * - リクエストのRangeヘッダを解析（N バイト目から）
 * - 全DATを構築せずに差分レスのみを構築（コスト削減）
 * - 206 Partial Content + Content-Range ヘッダを付けて返す
 *
 * @param req - リクエスト
 * @param params - ルートパラメータ（boardId, threadKey）
 * @returns Shift_JISエンコードされたDATファイル（全体/差分）
 */
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ boardId: string; threadKey: string }> },
): Promise<Response> {
	// [DIAG] プロトコル診断ログ（確認後に削除すること）
	console.log("[diag:dat]", {
		url: req.url,
		scheme: new URL(req.url).protocol,
		xForwardedProto: req.headers.get("x-forwarded-proto"),
		host: req.headers.get("host"),
		userAgent: req.headers.get("user-agent"),
	});
	const { threadKey } = await params;

	// スレッドをthreadKeyで取得する
	const thread = await ThreadRepository.findByThreadKey(threadKey);
	if (!thread) {
		return new Response("Not Found", { status: 404 });
	}

	// If-Modified-Since による 304 Not Modified 判定
	// threads.last_post_at と比較する（senbra-adapter.md §6 304 Not Modified の判定）
	const ifModifiedSince = req.headers.get("if-modified-since");
	if (ifModifiedSince) {
		const sinceDate = new Date(ifModifiedSince);
		if (!isNaN(sinceDate.getTime())) {
			// HTTP Date 形式は秒単位のため、秒単位で比較する
			const lastPostAtSec = Math.floor(thread.lastPostAt.getTime() / 1000);
			const sinceSec = Math.floor(sinceDate.getTime() / 1000);
			if (lastPostAtSec <= sinceSec) {
				return new Response(null, { status: 304 });
			}
		}
	}

	// Range ヘッダを解析する
	const rangeHeader = req.headers.get("range");
	const rangeStart = rangeHeader ? parseRangeHeader(rangeHeader) : null;

	if (rangeStart !== null) {
		// --- 差分応答（206 Partial Content）---
		return handleRangeRequest(thread, rangeStart);
	} else {
		// --- 全体応答（200 OK）---
		return handleFullRequest(thread);
	}
}

/**
 * DATファイル全体を返す（200 OK）。
 *
 * @param thread - スレッドエンティティ
 * @returns 全DATのShift_JISエンコードレスポンス（200 OK）
 */
async function handleFullRequest(thread: {
	id: string;
	title: string;
	lastPostAt: Date;
	datByteSize: number;
}): Promise<Response> {
	// 全レスを取得する
	const posts = await PostRepository.findByThreadId(thread.id);

	// DatFormatterでDAT形式テキストを構築する（UTF-8）
	const datText = datFormatter.buildDat(posts, thread.title);

	// UTF-8 → Shift_JIS に変換
	const sjisBuffer = encoder.encode(datText);

	return new Response(new Uint8Array(sjisBuffer), {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=Shift_JIS",
			"Content-Length": String(sjisBuffer.length),
			"Last-Modified": thread.lastPostAt.toUTCString(),
		},
	});
}

/**
 * DATファイルの差分を返す（206 Partial Content）。
 *
 * Range差分応答の実装（senbra-adapter.md §4）:
 * 1. 現在のdat_byte_sizeを取得
 * 2. rangeStart と dat_byte_size を比較
 *    - rangeStart >= dat_byte_size: 更新なし → 空の206を返す
 *    - rangeStart < dat_byte_size: 差分レスを構築して206を返す
 *
 * 差分レスの特定方法:
 * - 全DATを構築してrangeStart以降のバイトを切り出す方式を採用する
 * - 理由: post_numberからバイトオフセットを逆算するより、
 *         DATを全構築してスライスする方が実装が正確で単純なため
 *
 * @param thread - スレッドエンティティ
 * @param rangeStart - 差分開始バイト位置
 * @returns 差分DATのShift_JISエンコードレスポンス（206 Partial Content）
 */
async function handleRangeRequest(
	thread: { id: string; title: string; lastPostAt: Date; datByteSize: number },
	rangeStart: number,
): Promise<Response> {
	// 全レスを取得する（差分計算のために全体が必要）
	const allPosts = await PostRepository.findByThreadId(thread.id);

	// 全DATを構築する（UTF-8）
	const fullDatText = datFormatter.buildDat(allPosts, thread.title);

	// UTF-8 → Shift_JIS に変換（バイト単位の計算のため）
	const fullSjisBuffer = encoder.encode(fullDatText);
	const totalBytes = fullSjisBuffer.length;

	if (rangeStart >= totalBytes) {
		// 更新なし: rangeStart 以降のデータが存在しない
		// 空の206を返す（専ブラは更新なしと判断する）
		return new Response(new Uint8Array(0), {
			status: 206,
			headers: {
				"Content-Type": "text/plain; charset=Shift_JIS",
				"Content-Range": `bytes ${rangeStart}-${totalBytes - 1}/${totalBytes}`,
				"Content-Length": "0",
				"Last-Modified": thread.lastPostAt.toUTCString(),
			},
		});
	}

	// rangeStart 以降の差分データを切り出す
	const diffBuffer = fullSjisBuffer.slice(rangeStart);
	const diffEnd = totalBytes - 1;

	return new Response(new Uint8Array(diffBuffer), {
		status: 206,
		headers: {
			"Content-Type": "text/plain; charset=Shift_JIS",
			"Content-Range": `bytes ${rangeStart}-${diffEnd}/${totalBytes}`,
			"Content-Length": String(diffBuffer.length),
			"Last-Modified": thread.lastPostAt.toUTCString(),
		},
	});
}
