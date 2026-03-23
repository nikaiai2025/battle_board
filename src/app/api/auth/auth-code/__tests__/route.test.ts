/**
 * 単体テスト: POST /api/auth/auth-code (廃止済み)
 *
 * Sprint-110 で /api/auth/verify に移行済み。
 * このエンドポイントは 410 Gone を返すことのみ検証する。
 * See: src/app/api/auth/verify/__tests__/route.test.ts（移行先テスト）
 */

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "../route";

describe("POST /api/auth/auth-code (廃止済み)", () => {
	it("410 Gone を返す", async () => {
		const req = new NextRequest("http://localhost/api/auth/auth-code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ turnstileToken: "test" }),
		});
		const res = await POST(req);

		expect(res.status).toBe(410);
		const body = (await res.json()) as { success: boolean; error: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain("/api/auth/verify");
	});
});
