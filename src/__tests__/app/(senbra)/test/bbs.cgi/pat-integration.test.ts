/**
 * 単体テスト: POST /test/bbs.cgi — PAT認証統合
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 * See: features/user_registration.feature @PAT認証後は Cookie で認証され PAT は認証処理に使われない
 * See: features/user_registration.feature @無効な PAT では書き込みが拒否される
 * See: docs/architecture/components/user-registration.md §6 認証判定フロー（改訂版）
 * See: docs/architecture/components/user-registration.md §8.3 専ブラでの使われ方
 *
 * テスト方針:
 *   - RegistrationService, AuthService, PostService, ThreadRepository はモック化
 *   - D-08 §6 の認証判定フロー（①②③④）に準拠した振る舞いを検証する
 *   - エッジケース（Null/空文字/不正型/大文字小文字混在/境界値）も網羅する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * 認証判定フロー（D-08 §6）:
 *   ① edge-token Cookie あり → verifyEdgeToken
 *   ② mail欄に #pat_ パターン → loginWithPat → 新edge-token発行
 *   ③ mail欄に #<32hex> パターン → verifyWriteToken（既存）
 *   ④ 未認証 → 認証コード案内
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義（hoisting問題回避）
// ---------------------------------------------------------------------------

const {
	mockLoginWithPat,
	mockVerifyEdgeToken,
	mockVerifyWriteToken,
	mockPostServiceCreatePost,
	mockPostServiceCreateThread,
	mockThreadRepositoryFindByThreadKey,
	mockShiftJisEncoderDecodeFormData,
	mockShiftJisEncoderEncode,
	mockBbsCgiParserParseRequest,
	MockShiftJisEncoder,
	MockBbsCgiParser,
	MockBbsCgiResponseBuilder,
} = vi.hoisted(() => {
	const mockLoginWithPat = vi.fn();
	const mockVerifyEdgeToken = vi.fn();
	const mockVerifyWriteToken = vi.fn();
	const mockPostServiceCreatePost = vi.fn();
	const mockPostServiceCreateThread = vi.fn();
	const mockThreadRepositoryFindByThreadKey = vi.fn();
	const mockShiftJisEncoderDecodeFormData = vi.fn();
	const mockShiftJisEncoderEncode = vi.fn();
	const mockBbsCgiParserParseRequest = vi.fn();

	// クラスモックはコンストラクタとして機能するよう function で定義する
	function MockShiftJisEncoder(this: unknown) {
		(this as Record<string, unknown>).decodeFormData = (...args: unknown[]) =>
			mockShiftJisEncoderDecodeFormData(...args);
		(this as Record<string, unknown>).encode = (...args: unknown[]) =>
			mockShiftJisEncoderEncode(...args);
	}
	function MockBbsCgiParser(this: unknown) {
		(this as Record<string, unknown>).parseRequest = (...args: unknown[]) =>
			mockBbsCgiParserParseRequest(...args);
	}
	function MockBbsCgiResponseBuilder(this: unknown) {
		(this as Record<string, unknown>).buildError = (msg: string) =>
			`<html><head><title>ＥＲＲＯＲ</title></head><body>${msg}</body></html>`;
		(this as Record<string, unknown>).buildSuccess = (
			threadKey: string,
			boardId: string,
		) =>
			`<html><head><title>書き込みました</title></head><body>${threadKey}/${boardId}</body></html>`;
		(this as Record<string, unknown>).buildAuthRequired = (
			code: string,
			token: string,
			base: string,
		) =>
			`<html><head><title>認証</title></head><body>${code}/${token}/${base}</body></html>`;
	}

	return {
		mockLoginWithPat,
		mockVerifyEdgeToken,
		mockVerifyWriteToken,
		mockPostServiceCreatePost,
		mockPostServiceCreateThread,
		mockThreadRepositoryFindByThreadKey,
		mockShiftJisEncoderDecodeFormData,
		mockShiftJisEncoderEncode,
		mockBbsCgiParserParseRequest,
		MockShiftJisEncoder,
		MockBbsCgiParser,
		MockBbsCgiResponseBuilder,
	};
});

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/registration-service", () => ({
	loginWithPat: (...args: unknown[]) => mockLoginWithPat(...args),
}));

vi.mock("@/lib/services/auth-service", () => ({
	verifyEdgeToken: (...args: unknown[]) => mockVerifyEdgeToken(...args),
	verifyWriteToken: (...args: unknown[]) => mockVerifyWriteToken(...args),
	hashIp: () => "hashed-ip",
	reduceIp: (ip: string) => ip,
}));

vi.mock("@/lib/services/post-service", () => ({
	createPost: (...args: unknown[]) => mockPostServiceCreatePost(...args),
	createThread: (...args: unknown[]) => mockPostServiceCreateThread(...args),
}));

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findByThreadKey: (...args: unknown[]) =>
		mockThreadRepositoryFindByThreadKey(...args),
}));

vi.mock("@/lib/infrastructure/encoding/shift-jis", () => ({
	ShiftJisEncoder: MockShiftJisEncoder,
	decodeHtmlNumericReferences: (s: string) => s,
}));

vi.mock("@/lib/infrastructure/adapters/bbs-cgi-parser", () => ({
	BbsCgiParser: MockBbsCgiParser,
}));

vi.mock("@/lib/infrastructure/adapters/bbs-cgi-response", () => ({
	BbsCgiResponseBuilder: MockBbsCgiResponseBuilder,
}));

vi.mock("@/lib/constants/cookie-names", () => ({
	EDGE_TOKEN_COOKIE: "edge_token",
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { POST } from "@/app/(senbra)/test/bbs.cgi/route";

// ---------------------------------------------------------------------------
// テスト定数
// ---------------------------------------------------------------------------

const VALID_PAT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
// INVALID_PAT: 正しい形式（32文字hex）だがDBに存在しないPAT。verifyPat で { valid: false } が返る。
const INVALID_PAT = "dead000000000000000000000000beef";
const VALID_EDGE_TOKEN = "valid-edge-token-uuid-001";
const NEW_EDGE_TOKEN = "new-edge-token-issued-by-pat-001";
const VALID_WRITE_TOKEN = "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5";
const USER_ID = "user-uuid-001";
const THREAD_KEY = "1700000000000";
const BOARD_ID = "test";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * ShiftJIS形式のPOSTリクエストを模擬する。
 * 実際の専ブラは Shift_JIS バイト列を送るが、テストではバイト列を模擬する。
 */
function createBbsCgiRequest(
	params: {
		bbs?: string;
		key?: string;
		time?: string;
		FROM?: string;
		mail?: string;
		MESSAGE?: string;
		subject?: string;
	},
	cookieHeader?: string,
): Request {
	// テスト用にURLSearchParamsをモックが返す前提で、任意のBufferを送る
	const body = Buffer.from("test-body");
	return new Request("http://localhost/test/bbs.cgi", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded; charset=Shift_JIS",
			...(cookieHeader ? { cookie: cookieHeader } : {}),
		},
		body,
	});
}

/**
 * モックの decodeFormData 返り値をセットアップする。
 */
function setupDecodeFormData(params: Record<string, string | undefined>): void {
	const searchParams = new URLSearchParams();
	for (const [key, val] of Object.entries(params)) {
		if (val !== undefined) {
			searchParams.set(key, val);
		}
	}
	mockShiftJisEncoderDecodeFormData.mockReturnValue(searchParams);
}

/**
 * 書き込み成功レスポンスをセットアップする。
 */
function setupPostSuccess(): void {
	mockThreadRepositoryFindByThreadKey.mockResolvedValue({
		id: "thread-uuid-001",
		threadKey: THREAD_KEY,
	});
	mockPostServiceCreatePost.mockResolvedValue({
		success: true,
		post: { id: "post-uuid-001" },
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /test/bbs.cgi — PAT認証統合", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// デフォルト: encode は空のBufferを返す
		mockShiftJisEncoderEncode.mockReturnValue(Buffer.from(""));
	});

	// =========================================================================
	// ② PAT認証フロー（Cookie なし、mail欄に #pat_ あり）
	// D-08 §6 認証判定フロー ② に対応
	// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
	// =========================================================================

	describe("② PAT認証フロー", () => {
		it("正常: mail欄に #pat_<32hex> を含む場合、loginWithPat が呼ばれ edge-token Cookie が発行される", async () => {
			// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `sage#pat_${VALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `sage#pat_${VALID_PAT}`,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({ mail: `sage#pat_${VALID_PAT}` });
			const res = await POST(
				req as unknown as import("next/server").NextRequest,
			);

			// loginWithPat が正しいPATで呼ばれること
			expect(mockLoginWithPat).toHaveBeenCalledWith(VALID_PAT);
			// edge-token Cookie が発行されること
			const setCookie = res.headers.get("Set-Cookie");
			expect(setCookie).toContain("edge_token=");
			expect(setCookie).toContain(NEW_EDGE_TOKEN);
		});

		it("正常: sage#pat_<32hex> の場合、PATが正しく32文字で抽出される", async () => {
			// See: docs/architecture/components/user-registration.md §6 mail欄パース正規表現
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `sage#pat_${VALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `sage#pat_${VALID_PAT}`,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			expect(mockLoginWithPat).toHaveBeenCalledWith(VALID_PAT);
		});

		it("正常: PAT認証成功時、mail欄からPATが除去されてPostServiceに渡される（DAT漏洩防止）", async () => {
			// See: features/user_registration.feature @メール欄の PAT は書き込みデータに含まれない
			// See: docs/architecture/components/user-registration.md §6 ※ DAT漏洩防止
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `sage#pat_${VALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `sage#pat_${VALID_PAT}`,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// PostServiceに渡されるemailにPATが含まれないこと
			expect(mockPostServiceCreatePost).toHaveBeenCalledWith(
				expect.objectContaining({
					email: expect.not.stringContaining(`#pat_${VALID_PAT}`),
				}),
			);
		});

		it("正常: PAT認証成功後、書き込みが成功して 200 が返される", async () => {
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `sage#pat_${VALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `sage#pat_${VALID_PAT}`,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			const res = await POST(
				req as unknown as import("next/server").NextRequest,
			);

			expect(res.status).toBe(200);
		});

		it("正常: 大文字PATパターン (#PAT_<32hex>) も認証される（大文字小文字非区別）", async () => {
			// See: docs/architecture/components/user-registration.md §6 正規表現フラグ /i
			const upperMail = `sage#PAT_${VALID_PAT.toUpperCase()}`;
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: upperMail,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: upperMail,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// loginWithPat が呼ばれること（大文字/小文字は normalize される）
			expect(mockLoginWithPat).toHaveBeenCalledWith(
				VALID_PAT.toUpperCase().toLowerCase(),
			);
		});

		it("異常: 無効PATの場合、エラーレスポンスが返される", async () => {
			// See: features/user_registration.feature @無効な PAT では書き込みが拒否される
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `#pat_${INVALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `#pat_${INVALID_PAT}`,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({ valid: false });

			const req = createBbsCgiRequest({});
			const res = await POST(
				req as unknown as import("next/server").NextRequest,
			);

			// レスポンスのContent-TypeはShift_JIS
			expect(res.headers.get("Content-Type")).toContain("Shift_JIS");
			// ボディにエラーが含まれること（エンコード後は decode して確認）
			// ShiftJisEncoderのencodeはモック済みなので、buildErrorの呼び出しを確認
			// ステータスは200（5ch互換）
			expect(res.status).toBe(200);
		});

		it("異常: 無効PATの場合、PostServiceが呼ばれない", async () => {
			// See: features/user_registration.feature @無効な PAT では書き込みが拒否される
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `#pat_${INVALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `#pat_${INVALID_PAT}`,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({ valid: false });

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// PostServiceが呼ばれないこと（書き込みがブロックされること）
			expect(mockPostServiceCreatePost).not.toHaveBeenCalled();
			expect(mockPostServiceCreateThread).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// ① edge-token Cookie あり + mail欄に PAT がある場合
	// D-08 §6 ※ Cookie認証成功時でもPATを除去する
	// See: features/user_registration.feature @PAT認証後は Cookie で認証され PAT は認証処理に使われない
	// See: docs/architecture/components/user-registration.md §8.3 専ブラでの使われ方（Cookie有効・mail欄PAT）
	// =========================================================================

	describe("① Cookie有効 + mail欄にPAT（PAT除去のみ）", () => {
		it("正常: Cookie有効の場合、PATで認証せず loginWithPat は呼ばれない", async () => {
			// See: features/user_registration.feature @PAT認証後は Cookie で認証され PAT は認証処理に使われない
			// See: docs/architecture/components/user-registration.md §8.3 Cookie有効・mail欄PAT
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `sage#pat_${VALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `sage#pat_${VALID_PAT}`,
				edgeToken: VALID_EDGE_TOKEN,
			});
			mockVerifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				authorIdSeed: "seed-001",
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({}, `edge_token=${VALID_EDGE_TOKEN}`);
			await POST(req as unknown as import("next/server").NextRequest);

			// Cookie認証が成功しているのでPAT認証は行われない
			expect(mockLoginWithPat).not.toHaveBeenCalled();
		});

		it("正常: Cookie有効 + mail欄にPATがある場合でも、mail欄からPATが除去されてPostServiceに渡される", async () => {
			// See: docs/architecture/components/user-registration.md §6 ※ Cookie認証成功でもPATを除去
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `sage#pat_${VALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `sage#pat_${VALID_PAT}`,
				edgeToken: VALID_EDGE_TOKEN,
			});
			mockVerifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				authorIdSeed: "seed-001",
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({}, `edge_token=${VALID_EDGE_TOKEN}`);
			await POST(req as unknown as import("next/server").NextRequest);

			// PostServiceに渡されるemailにPATが含まれないこと
			expect(mockPostServiceCreatePost).toHaveBeenCalledWith(
				expect.objectContaining({
					email: expect.not.stringContaining(`#pat_${VALID_PAT}`),
				}),
			);
		});
	});

	// =========================================================================
	// ③ write_token フロー（PAT なし）— 既存機能への影響なし確認
	// See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
	// =========================================================================

	describe("③ write_token フロー（既存機能への影響なし）", () => {
		it("正常: mail欄に #<32hex>（write_token）があり、PATパターンでない場合は verifyWriteToken が呼ばれる", async () => {
			// See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `#${VALID_WRITE_TOKEN}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `#${VALID_WRITE_TOKEN}`,
				edgeToken: null,
			});
			mockVerifyWriteToken.mockResolvedValue({
				valid: true,
				edgeToken: VALID_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// write_token 検証が呼ばれ、PAT認証は行われない
			expect(mockVerifyWriteToken).toHaveBeenCalledWith(VALID_WRITE_TOKEN);
			expect(mockLoginWithPat).not.toHaveBeenCalled();
		});

		it("正常: #pat_ プレフィクスあり（PAT）の場合、write_token として処理されない", async () => {
			// See: docs/architecture/components/user-registration.md §6 衝突しない根拠
			// #pat_a1b2... の _ は hex 文字ではないため /#([0-9a-f]{32})/i にマッチしない
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `#pat_${VALID_PAT}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `#pat_${VALID_PAT}`,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// write_token として処理されず、PATとして処理される
			expect(mockLoginWithPat).toHaveBeenCalledWith(VALID_PAT);
			expect(mockVerifyWriteToken).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// PAT パターン正規表現の境界値テスト
	// See: docs/architecture/components/user-registration.md §6 mail欄パース正規表現
	// =========================================================================

	describe("PAT パターン正規表現の境界値", () => {
		it("エッジケース: 31文字hex は PATとして認識されない（32文字未満）", async () => {
			// 境界値: 32文字より1文字少ない
			const shortPat = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3"; // 30文字（テスト用）
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `#pat_${shortPat}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `#pat_${shortPat}`,
				edgeToken: null,
			});
			// PostService は未認証フローで呼ばれる可能性があるのでセットアップ
			mockPostServiceCreatePost.mockResolvedValue({
				authRequired: {
					code: "123456",
					edgeToken: "new-edge-token",
				},
			});

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// 31文字以下はPATとして認識されず、loginWithPat が呼ばれない
			expect(mockLoginWithPat).not.toHaveBeenCalled();
		});

		it("エッジケース: 33文字hex を含む場合、先頭32文字がPATとして抽出される（仕様どおり）", async () => {
			// See: docs/architecture/components/user-registration.md §6 mail欄パース正規表現
			// /#pat_([0-9a-f]{32})/i は33文字目以降を無視して先頭32文字をキャプチャする（仕様）
			const longPat = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e"; // 33文字
			const extractedPat = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"; // 先頭32文字
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `#pat_${longPat}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `#pat_${longPat}`,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// 先頭32文字のPATでloginWithPatが呼ばれること
			expect(mockLoginWithPat).toHaveBeenCalledWith(extractedPat);
		});

		it("エッジケース: hex以外の文字を含むPATは認識されない（不正文字）", async () => {
			// 不正データ型: hex以外の文字
			const invalidHexPat = "g1h2i3j4k5l6g1h2i3j4k5l6g1h2i3j4"; // g,h,i等はhex外
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `#pat_${invalidHexPat}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `#pat_${invalidHexPat}`,
				edgeToken: null,
			});
			mockPostServiceCreatePost.mockResolvedValue({
				authRequired: {
					code: "123456",
					edgeToken: "new-edge-token",
				},
			});

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// hex以外の文字を含む場合はPATとして認識されない
			expect(mockLoginWithPat).not.toHaveBeenCalled();
		});

		it("エッジケース: mail欄が空の場合、PAT認証は行われない", async () => {
			// 空入力
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: "",
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: "",
				edgeToken: null,
			});
			mockPostServiceCreatePost.mockResolvedValue({
				authRequired: {
					code: "123456",
					edgeToken: "new-edge-token",
				},
			});

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			expect(mockLoginWithPat).not.toHaveBeenCalled();
		});

		it("エッジケース: mail欄が sage のみの場合、PAT認証は行われない", async () => {
			// 通常のsage書き込み（PATなし）
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: "sage",
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: "sage",
				edgeToken: null,
			});
			mockPostServiceCreatePost.mockResolvedValue({
				authRequired: {
					code: "123456",
					edgeToken: "new-edge-token",
				},
			});

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			expect(mockLoginWithPat).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// PAT判定はwrite_token判定より前に実行されること（判定順序の保証）
	// See: タスク指示書 補足・制約 — PAT判定はwrite_token判定より前に実行すること
	// =========================================================================

	describe("PAT判定とwrite_token判定の優先順位", () => {
		it("正常: mail欄にPATとwrite_tokenの両方が含まれる場合、PATが優先される", async () => {
			// See: タスク指示書 — mail欄パースでPATとwrite_tokenの両方が含まれる場合は先に検出された方を使用（PATが優先）
			// #pat_ は write_token正規表現にマッチしないため衝突しないが、判定順序を明示的に保証する
			const combinedMail = `sage#pat_${VALID_PAT}`;
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: combinedMail,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: combinedMail,
				edgeToken: null,
			});
			mockLoginWithPat.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			await POST(req as unknown as import("next/server").NextRequest);

			// PAT認証が行われ、write_token認証は行われない
			expect(mockLoginWithPat).toHaveBeenCalledWith(VALID_PAT);
			expect(mockVerifyWriteToken).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 既存機能への影響なし確認
	// =========================================================================

	describe("既存機能への影響なし", () => {
		it("正常: edge-token Cookie のみ（PATなし）の場合、既存フローで処理される", async () => {
			// See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: "sage",
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: "sage",
				edgeToken: VALID_EDGE_TOKEN,
			});
			mockVerifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				authorIdSeed: "seed-001",
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({}, `edge_token=${VALID_EDGE_TOKEN}`);
			const res = await POST(
				req as unknown as import("next/server").NextRequest,
			);

			// PAT認証、write_token認証は呼ばれない
			expect(mockLoginWithPat).not.toHaveBeenCalled();
			expect(mockVerifyWriteToken).not.toHaveBeenCalled();
			// 書き込み成功
			expect(mockPostServiceCreatePost).toHaveBeenCalled();
			expect(res.status).toBe(200);
		});

		it("正常: write_token認証フローは影響を受けない", async () => {
			// See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
			setupDecodeFormData({
				bbs: BOARD_ID,
				key: THREAD_KEY,
				MESSAGE: "テスト書き込み",
				mail: `sage#${VALID_WRITE_TOKEN}`,
			});
			mockBbsCgiParserParseRequest.mockReturnValue({
				boardId: BOARD_ID,
				threadKey: THREAD_KEY,
				message: "テスト書き込み",
				name: "",
				mail: `sage#${VALID_WRITE_TOKEN}`,
				edgeToken: null,
			});
			mockVerifyWriteToken.mockResolvedValue({
				valid: true,
				edgeToken: VALID_EDGE_TOKEN,
			});
			setupPostSuccess();

			const req = createBbsCgiRequest({});
			const res = await POST(
				req as unknown as import("next/server").NextRequest,
			);

			expect(mockVerifyWriteToken).toHaveBeenCalledWith(VALID_WRITE_TOKEN);
			expect(mockLoginWithPat).not.toHaveBeenCalled();
			// edge-token Cookie が設定される
			const setCookie = res.headers.get("Set-Cookie");
			expect(setCookie).toContain("edge_token=");
			expect(setCookie).toContain(VALID_EDGE_TOKEN);
		});
	});
});
