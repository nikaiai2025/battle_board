/**
 * LitterboxAdapter 単体テスト
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.6
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	LitterboxAdapter,
	type IAudioStorageAdapter,
} from "../../../../lib/infrastructure/adapters/audio-storage-adapter";

describe("LitterboxAdapter", () => {
	let adapter: IAudioStorageAdapter;
	const fetchMock = vi.fn<typeof fetch>();

	function stubSleep(): void {
		(
			adapter as unknown as { _sleep: (ms: number) => Promise<void> }
		)._sleep = vi.fn(async () => undefined);
	}

	beforeEach(() => {
		adapter = new LitterboxAdapter();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("正常系: URL を返す", async () => {
		fetchMock.mockResolvedValue(
			createFetchResponse({
				status: 200,
				body: "https://litter.catbox.moe/example.mp4",
			}),
		);

		const result = await adapter.upload({
			data: new Uint8Array([0x01, 0x02, 0x03]),
			filename: "yomiage-1.mp4",
			mimeType: "audio/mp4",
		});

		expect(result).toEqual({
			url: "https://litter.catbox.moe/example.mp4",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const [, init] = fetchMock.mock.calls[0];
		const body = init?.body;
		expect(body).toBeInstanceOf(FormData);

		const formData = body as FormData;
		expect(formData.get("reqtype")).toBe("fileupload");
		expect(formData.get("time")).toBe("72h");

		const file = formData.get("fileToUpload");
		expect(file).toBeInstanceOf(File);
		expect((file as File).name).toBe("yomiage-1.mp4");
		expect((file as File).type).toBe("audio/mp4");
	});

	it("HTTP 200 でも本文が https:// で始まらない場合はエラーにする", async () => {
		fetchMock.mockResolvedValue(
			createFetchResponse({ status: 200, body: "upload failed" }),
		);

		await expect(
			adapter.upload({
				data: new Uint8Array([0x01]),
				filename: "yomiage-2.mp4",
				mimeType: "audio/mp4",
			}),
		).rejects.toThrow("Litterbox upload rejected: upload failed");

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("HTTP 500 はリトライ後に最終失敗で例外を throw する", async () => {
		fetchMock.mockResolvedValue(
			createFetchResponse({ status: 500, body: "server error" }),
		);
		stubSleep();

		await expect(
			adapter.upload({
				data: new Uint8Array([0x01]),
				filename: "yomiage-3.mp4",
				mimeType: "audio/mp4",
			}),
		).rejects.toThrow("Litterbox upload failed: HTTP 500");

		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("HTTP 400 はリトライせず即エラーにする", async () => {
		fetchMock.mockResolvedValue(
			createFetchResponse({ status: 400, body: "bad request" }),
		);
		stubSleep();

		await expect(
			adapter.upload({
				data: new Uint8Array([0x01]),
				filename: "yomiage-4.mp4",
				mimeType: "audio/mp4",
			}),
		).rejects.toThrow("Litterbox upload failed: HTTP 400");

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

function createFetchResponse(params: { status: number; body: string }) {
	return {
		ok: params.status >= 200 && params.status < 300,
		status: params.status,
		text: vi.fn().mockResolvedValue(params.body),
	} as unknown as Response;
}
