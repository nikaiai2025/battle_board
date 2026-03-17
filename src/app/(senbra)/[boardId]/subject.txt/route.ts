/**
 * GET /{boardId}/subject.txt — スレッド一覧
 *
 * 5ch専用ブラウザが板のスレッド一覧を取得するためのエンドポイント。
 * bump順（最終書き込み順）でスレッドを列挙したテキストをShift_JIS（CP932）エンコードして返す。
 *
 * See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 * See: features/constraints/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
 * See: docs/specs/openapi.yaml > /{boardId}/subject.txt
 * See: docs/architecture/components/senbra-adapter.md §5.2 被依存
 */

import type { NextRequest } from "next/server";
import { isNotModifiedSince } from "@/lib/infrastructure/adapters/http-cache";
import { SubjectFormatter } from "@/lib/infrastructure/adapters/subject-formatter";
import { ShiftJisEncoder } from "@/lib/infrastructure/encoding/shift-jis";
import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";

/** SubjectFormatterのシングルトンインスタンス */
const subjectFormatter = new SubjectFormatter();

/** ShiftJisEncoderのシングルトンインスタンス */
const encoder = new ShiftJisEncoder();

/**
 * GET /{boardId}/subject.txt — スレッド一覧（専ブラ互換）
 *
 * bump順（last_post_at DESC）でソートされたスレッド一覧を
 * subject.txt形式（{threadKey}.dat<>{title} ({postCount})\n）で返す。
 *
 * See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 * See: features/constraints/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
 *
 * @param req - リクエスト（If-Modified-Since ヘッダを参照）
 * @param params - ルートパラメータ（boardId）
 * @returns Shift_JISエンコードされたsubject.txtテキスト
 */
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ boardId: string }> },
): Promise<Response> {
	const { boardId } = await params;

	// ThreadRepositoryからbump順（last_post_at DESC）でスレッド一覧を取得する
	// findByBoardId は is_deleted=false かつ last_post_at DESC ソート済みを返す
	const threads = await ThreadRepository.findByBoardId(boardId, { limit: 100 });

	// If-Modified-Since による 304 Not Modified 判定
	// スレッド一覧の最終更新時刻として最新スレッドの last_post_at を使用する
	if (threads.length > 0) {
		const ifModifiedSince = req.headers.get("if-modified-since");
		if (
			ifModifiedSince &&
			isNotModifiedSince(threads[0].lastPostAt, ifModifiedSince)
		) {
			// Cache-Control: no-cache を付与し、専ブラが毎回条件付きリクエストを送るよう強制する
			// RFC 7234 §4.2.2 ヒューリスティックキャッシュ防止のため
			return new Response(null, {
				status: 304,
				headers: { "Cache-Control": "no-cache" },
			});
		}
	}

	// SubjectFormatterでsubject.txtテキストを構築する（UTF-8）
	// SubjectFormatterはbump順ソート済みのリストを受け取る（呼び出し元がソート責任を持つ）
	const subjectText = subjectFormatter.buildSubjectTxt(threads);

	// UTF-8 → Shift_JIS に変換
	const sjisBuffer = encoder.encode(subjectText);

	// Last-Modified ヘッダ用の日時を設定する
	// toUTCString() は RFC 7231 形式（"Www, DD Mon YYYY HH:MM:SS GMT"）で秒精度のため、
	// ミリ秒は自動的に切り捨てられる。これにより Last-Modified → If-Modified-Since の
	// ラウンドトリップでのミリ秒精度ズレを防ぐことができる
	const lastModified =
		threads.length > 0
			? threads[0].lastPostAt.toUTCString()
			: new Date(0).toUTCString();

	return new Response(new Uint8Array(sjisBuffer), {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=Shift_JIS",
			"Content-Length": String(sjisBuffer.length),
			"Last-Modified": lastModified,
			// Cache-Control: no-cache を付与し、専ブラが毎回条件付きリクエストを送るよう強制する
			// RFC 7234 §4.2.2 ヒューリスティックキャッシュ防止のため
			"Cache-Control": "no-cache",
		},
	});
}
