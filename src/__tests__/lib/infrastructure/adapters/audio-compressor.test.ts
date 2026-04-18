/**
 * AudioCompressor 単体テスト
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.5
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockSpawn,
	mockMkdtemp,
	mockWriteFile,
	mockReadFile,
	mockRm,
	mockTmpdir,
} = vi.hoisted(() => ({
	mockSpawn: vi.fn(),
	mockMkdtemp: vi.fn(),
	mockWriteFile: vi.fn(),
	mockReadFile: vi.fn(),
	mockRm: vi.fn(),
	mockTmpdir: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	spawn: mockSpawn,
}));

vi.mock("node:fs/promises", () => ({
	mkdtemp: mockMkdtemp,
	writeFile: mockWriteFile,
	readFile: mockReadFile,
	rm: mockRm,
}));

vi.mock("node:os", () => ({
	tmpdir: mockTmpdir,
}));

import {
	AudioCompressor,
	type IAudioCompressor,
} from "../../../../lib/infrastructure/adapters/audio-compressor";

describe("AudioCompressor", () => {
	let compressor: IAudioCompressor;

	beforeEach(() => {
		compressor = new AudioCompressor();
		mockSpawn.mockReset();
		mockMkdtemp.mockReset();
		mockWriteFile.mockReset();
		mockReadFile.mockReset();
		mockRm.mockReset();
		mockTmpdir.mockReset();

		mockTmpdir.mockReturnValue("/tmp");
		mockMkdtemp.mockResolvedValue("/tmp/battle-board-yomiage-123");
		mockWriteFile.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(Buffer.from([0xaa, 0xbb, 0xcc]));
		mockRm.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("正常系: ffmpeg で圧縮した MP4(AAC) を返す", async () => {
		const processMock = createChildProcessMock();
		mockSpawn.mockReturnValue(processMock.child);

		const promise = compressor.compress({
			input: new Uint8Array([0x01, 0x02, 0x03]),
			filename: "pending-1",
		});
		await waitForSpawnInvocation();

		processMock.emitClose(0);

		await expect(promise).resolves.toEqual({
			output: new Uint8Array([0xaa, 0xbb, 0xcc]),
		});

		expect(mockSpawn).toHaveBeenCalledTimes(1);
		const spawnArgs = mockSpawn.mock.calls[0];
		expect(spawnArgs[0]).toBe("ffmpeg");
		expect(spawnArgs[1]).toEqual([
			"-y",
			"-i",
			expect.stringMatching(/pending-1\.input\.wav$/),
			"-vn",
			"-c:a",
			"aac",
			"-b:a",
			"96k",
			"-movflags",
			"+faststart",
			expect.stringMatching(/pending-1\.output\.mp4$/),
		]);
		expect(spawnArgs[2]).toEqual({ stdio: ["ignore", "ignore", "pipe"] });
		expect(mockRm).toHaveBeenCalledWith("/tmp/battle-board-yomiage-123", {
			force: true,
			recursive: true,
		});
	});

	it("ffmpeg の終了コードが非0ならエラーにする", async () => {
		const processMock = createChildProcessMock();
		mockSpawn.mockReturnValue(processMock.child);

		const promise = compressor.compress({
			input: new Uint8Array([0x01]),
			filename: "pending-2",
		});
		await waitForSpawnInvocation();

		processMock.emitStderr("invalid data");
		processMock.emitClose(1);

		await expect(promise).rejects.toThrow(
			"ffmpeg exited with code 1: invalid data",
		);
		expect(mockRm).toHaveBeenCalledTimes(1);
	});

	it("タイムアウト時は ffmpeg を kill してエラーにする", async () => {
		vi.useFakeTimers();
		const processMock = createChildProcessMock();
		mockSpawn.mockReturnValue(processMock.child);

		const promise = compressor.compress({
			input: new Uint8Array([0x01]),
			filename: "pending-3",
		});
		const expectation = expect(promise).rejects.toThrow(
			"ffmpeg timed out after 30000ms",
		);
		await waitForSpawnInvocation();

		await vi.advanceTimersByTimeAsync(30000);

		await expectation;
		expect(processMock.child.kill).toHaveBeenCalledWith("SIGKILL");
		expect(mockRm).toHaveBeenCalledTimes(1);
	});
});

function createChildProcessMock() {
	const processHandlers = new Map<
		string,
		Array<(value: number | Error | string | Buffer | null) => void>
	>();
	const stderrHandlers = new Map<
		string,
		Array<(value: number | Error | string | Buffer | null) => void>
	>();

	return {
		child: {
			stderr: {
				on: vi.fn((event: string, handler: (value: string | Buffer) => void) => {
					const handlers = stderrHandlers.get(event) ?? [];
					handlers.push(handler as (value: number | Error | string | Buffer | null) => void);
					stderrHandlers.set(event, handlers);
				}),
			},
			on: vi.fn(
				(
					event: string,
					handler: (value: number | Error | null) => void,
				) => {
					const handlers = processHandlers.get(event) ?? [];
					handlers.push(
						handler as (value: number | Error | string | Buffer | null) => void,
					);
					processHandlers.set(event, handlers);
				},
			),
			kill: vi.fn(),
		},
		emitClose(code: number | null) {
			for (const handler of processHandlers.get("close") ?? []) {
				handler(code);
			}
		},
		emitError(error: Error) {
			for (const handler of processHandlers.get("error") ?? []) {
				handler(error);
			}
		},
		emitStderr(chunk: string | Buffer) {
			for (const handler of stderrHandlers.get("data") ?? []) {
				handler(chunk);
			}
		},
	};
}

async function waitForSpawnInvocation(): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt++) {
		if (mockSpawn.mock.calls.length > 0) {
			return;
		}

		await Promise.resolve();
	}

	throw new Error("spawn was not invoked in time");
}
