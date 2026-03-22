/**
 * GET /{boardId}/subject.txt — スレッド一覧
 *
 * 5ch専用ブラウザが板のスレッド一覧を取得するためのエンドポイント。
 * bump順（最終書き込み順）でスレッドを列挙したテキストをShift_JIS（CP932）エンコードして返す。
 *
 * See: features/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 * See: features/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
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
 * 304判定・Last-Modifiedヘッダに使う「最終更新時刻」を決定する。
 *
 * 固定スレッド（isPinned=true）の lastPostAt が遠未来（例: 2099-01-01）に設定されている場合、
 * その値をそのまま Last-Modified に使うと専ブラが If-Modified-Since=2099年を送り続け、
 * 通常スレッドの更新があっても永遠に304が返される（永久304バグ）。
 *
 * これを防ぐため、現在時刻より未来の lastPostAt を除外して最終更新時刻を求める。
 * 未来日時を除外した結果候補がない場合（固定スレッドのみ等）は、
 * 全スレッド中の最後の要素をフォールバックとして使用する。
 *
 * @param threads - スレッド一覧（bump順＝last_post_at DESC）
 * @returns 304判定・Last-Modifiedに使う日時
 *
 * See: sprint-51 TASK-146 固定スレッドlastPostAt=2099年による永久304バグ修正
 */
function resolveLatestPostAt(threads: { lastPostAt: Date }[]): Date {
	if (threads.length === 0) return new Date(0);

	const now = new Date();
	// 現在時刻以前のlastPostAtを持つスレッドの中で最新のものを使う（bump順先頭）
	// 未来の日時（固定スレッドの2099年等）を除外することで永久304を防ぐ
	return (
		threads.find((t) => t.lastPostAt <= now)?.lastPostAt ??
		// 全スレッドが未来日時の場合（固定スレッドのみ等）は最後の要素をフォールバック
		threads[threads.length - 1].lastPostAt
	);
}

/**
 * GET /{boardId}/subject.txt — スレッド一覧（専ブラ互換）
 *
 * bump順（last_post_at DESC）でソートされたスレッド一覧を
 * subject.txt形式（{threadKey}.dat<>{title} ({postCount})\n）で返す。
 *
 * See: features/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 * See: features/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
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

	// ThreadRepositoryからアクティブスレッド（is_dormant=false）のみを取得する
	// onlyActive: true により is_dormant=false の条件が付加され LIMIT は使用しない
	// See: docs/specs/thread_state_transitions.yaml #listing_rules LIMIT不使用
	// See: docs/architecture/components/senbra-adapter.md §6 subject.txtフィルタリング
	const threads = await ThreadRepository.findByBoardId(boardId, {
		onlyActive: true,
	});

	// 304判定・Last-Modifiedヘッダ用の最終更新時刻を決定する
	// 固定スレッドのlastPostAt（未来日時）を除外して実際の最新投稿時刻を求める
	// 詳細は resolveLatestPostAt のJSDocを参照
	const latestPostAt = resolveLatestPostAt(threads);

	// If-Modified-Since による 304 Not Modified 判定
	// スレッド一覧の最終更新時刻として resolveLatestPostAt の結果を使用する
	if (threads.length > 0) {
		const ifModifiedSince = req.headers.get("if-modified-since");
		if (ifModifiedSince && isNotModifiedSince(latestPostAt, ifModifiedSince)) {
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
	// 未来日時（固定スレッド等）は resolveLatestPostAt で除外済み
	const lastModified = latestPostAt.toUTCString();

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
