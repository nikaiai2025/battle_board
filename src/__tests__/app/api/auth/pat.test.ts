/**
 * 単体テスト: GET /api/auth/pat, POST /api/auth/pat
 *
 * See: features/user_registration.feature @マイページでPATを確認できる
 * See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
 * See: features/user_registration.feature @仮ユーザーにはPATが表示されない
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 *
 * テスト方針:
 *   - AuthService, RegistrationService, UserRepository, next/headers はモック化
 *   - HTTPレベルの振る舞い（ステータスコード、レスポンスボディ）を検証する
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言
// ---------------------------------------------------------------------------

const mockCookies = {
	get: vi.fn(),
};

vi.mock("next/headers", () => ({
	cookies: vi.fn(() => Promise.resolve(mockCookies)),
}));

const mockVerifyEdgeToken = vi.fn();
vi.mock("../../../../lib/services/auth-service", () => ({
	verifyEdgeToken: (...args: unknown[]) => mockVerifyEdgeToken(...args),
}));

const mockFindById = vi.fn();
vi.mock("../../../../lib/infrastructure/repositories/user-repository", () => ({
	findById: (...args: unknown[]) => mockFindById(...args),
}));

const mockRegeneratePat = vi.fn();
vi.mock("../../../../lib/services/registration-service", () => ({
	regeneratePat: (...args: unknown[]) => mockRegeneratePat(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { GET, POST } from "../../../../app/api/auth/pat/route";
import type { User } from "../../../../lib/domain/models/user";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

const USER_ID = "user-uuid-001";
const EDGE_TOKEN = "edge-token-value-001";
const PAT_TOKEN = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const NEW_PAT_TOKEN = "f4e3d2c1b0a9f4e3d2c1b0a9f4e3d2c1";

function createRegisteredUser(overrides: Partial<User> = {}): User {
	return {
		id: USER_ID,
		authToken: "auth-token-001",
		authorIdSeed: "seed-001",
		isPremium: false,
		isVerified: true,
		username: null,
		streakDays: 0,
		lastPostDate: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		supabaseAuthId: "supabase-auth-001",
		registrationType: "email",
		registeredAt: new Date("2026-03-01T00:00:00Z"),
		patToken: PAT_TOKEN,
		patLastUsedAt: new Date("2026-03-15T14:23:00Z"),
		// Phase 4: 草コマンド関連フィールド（デフォルト値）
		// See: features/reactions.feature §成長ビジュアル
		grassCount: 0,
		// Phase 5: BAN システム関連フィールド（デフォルト値）
		// See: features/admin.feature @ユーザーBAN
		isBanned: false,
		lastIpHash: null,
		...overrides,
	};
}

function createTemporaryUser(): User {
	return createRegisteredUser({
		supabaseAuthId: null,
		registrationType: null,
		registeredAt: null,
		patToken: null,
		patLastUsedAt: null,
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /api/auth/pat", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCookies.get.mockReturnValue({ value: EDGE_TOKEN });
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: USER_ID,
			authorIdSeed: "seed-001",
		});
		mockFindById.mockResolvedValue(createRegisteredUser());
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("正常: 本登録ユーザーが PAT を取得できる", async () => {
		// See: features/user_registration.feature @マイページでPATを確認できる
		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "GET",
		});
		const res = await GET(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.patToken).toBe(PAT_TOKEN);
	});

	it("正常: PAT 最終使用日時が返される", async () => {
		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "GET",
		});
		const res = await GET(req);

		const body = await res.json();
		expect(body.patLastUsedAt).toBe("2026-03-15T14:23:00.000Z");
	});

	it("正常: PAT 最終使用日時が NULL の場合は null が返される", async () => {
		mockFindById.mockResolvedValue(
			createRegisteredUser({ patLastUsedAt: null }),
		);

		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "GET",
		});
		const res = await GET(req);

		const body = await res.json();
		expect(body.patLastUsedAt).toBeNull();
	});

	// =========================================================================
	// 認証エラー
	// =========================================================================

	it("認証エラー: edge-token Cookie がない場合は 401 を返す", async () => {
		mockCookies.get.mockReturnValue(undefined);

		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "GET",
		});
		const res = await GET(req);

		expect(res.status).toBe(401);
	});

	it("認証エラー: edge-token が無効な場合は 401 を返す", async () => {
		mockVerifyEdgeToken.mockResolvedValue({
			valid: false,
			reason: "not_found",
		});

		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "GET",
		});
		const res = await GET(req);

		expect(res.status).toBe(401);
	});

	// =========================================================================
	// 仮ユーザー（PAT未発行）
	// =========================================================================

	it("仮ユーザー: PAT が null の場合は 403 を返す", async () => {
		// See: features/user_registration.feature @仮ユーザーにはPATが表示されない
		mockFindById.mockResolvedValue(createTemporaryUser());

		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "GET",
		});
		const res = await GET(req);

		expect(res.status).toBe(403);
	});
});

describe("POST /api/auth/pat", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCookies.get.mockReturnValue({ value: EDGE_TOKEN });
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: USER_ID,
			authorIdSeed: "seed-001",
		});
		mockFindById.mockResolvedValue(createRegisteredUser());
		mockRegeneratePat.mockResolvedValue({ patToken: NEW_PAT_TOKEN });
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("正常: PAT 再発行が成功すると新しい PAT が返される", async () => {
		// See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "POST",
		});
		const res = await POST(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.patToken).toBe(NEW_PAT_TOKEN);
	});

	it("正常: RegistrationService.regeneratePat が userId を引数に呼ばれる", async () => {
		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "POST",
		});
		await POST(req);

		expect(mockRegeneratePat).toHaveBeenCalledWith(USER_ID);
	});

	// =========================================================================
	// 認証エラー
	// =========================================================================

	it("認証エラー: edge-token Cookie がない場合は 401 を返す", async () => {
		mockCookies.get.mockReturnValue(undefined);

		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "POST",
		});
		const res = await POST(req);

		expect(res.status).toBe(401);
	});

	it("認証エラー: edge-token が無効な場合は 401 を返す", async () => {
		mockVerifyEdgeToken.mockResolvedValue({
			valid: false,
			reason: "not_found",
		});

		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "POST",
		});
		const res = await POST(req);

		expect(res.status).toBe(401);
	});

	// =========================================================================
	// 仮ユーザー（PAT再発行不可）
	// =========================================================================

	it("仮ユーザー: supabase_auth_id が null の場合は 403 を返す", async () => {
		// See: features/user_registration.feature @仮ユーザーにはPATが表示されない
		mockFindById.mockResolvedValue(createTemporaryUser());

		const req = new NextRequest("http://localhost/api/auth/pat", {
			method: "POST",
		});
		const res = await POST(req);

		expect(res.status).toBe(403);
		expect(mockRegeneratePat).not.toHaveBeenCalled();
	});
});
