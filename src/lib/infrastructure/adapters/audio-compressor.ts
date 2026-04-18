/**
 * Audio Compressor
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.5
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const FFMPEG_TIMEOUT_MS = 30000;

/**
 * 音声軽量化の DI インターフェース。
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.5
 */
export interface IAudioCompressor {
	compress(params: {
		input: Uint8Array;
		filename: string;
	}): Promise<{
		output: Uint8Array;
	}>;
}

/**
 * ffmpeg によって WAV を 16kHz / mono / PCM 16bit へ再エンコードする。
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.5
 */
export class AudioCompressor implements IAudioCompressor {
	/**
	 * 一時ファイルに書き出して ffmpeg で再圧縮し、処理後は一時ディレクトリごと削除する。
	 *
	 * See: features/command_yomiage.feature
	 * See: docs/architecture/components/yomiage.md §5.5
	 */
	async compress(params: {
		input: Uint8Array;
		filename: string;
	}): Promise<{ output: Uint8Array }> {
		const tempDir = await mkdtemp(join(tmpdir(), "battle-board-yomiage-"));
		const safeFileBase = this._sanitizeFilename(params.filename);
		const inputPath = join(tempDir, `${safeFileBase}.input.wav`);
		const outputPath = join(tempDir, `${safeFileBase}.output.wav`);

		try {
			await writeFile(inputPath, params.input);
			await this._runFfmpeg(inputPath, outputPath);

			const output = await readFile(outputPath);
			return { output: new Uint8Array(output) };
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	}

	/** ffmpeg を起動し、終了コードとタイムアウトを監視する。 */
	private _runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const ffmpeg = spawn(
				"ffmpeg",
				[
					"-y",
					"-i",
					inputPath,
					"-ar",
					"16000",
					"-ac",
					"1",
					"-acodec",
					"pcm_s16le",
					outputPath,
				],
				{
					stdio: ["ignore", "ignore", "pipe"],
				},
			);
			let settled = false;
			let stderrOutput = "";

			const finalize = (error?: Error) => {
				if (settled) {
					return;
				}

				settled = true;
				clearTimeout(timeoutId);

				if (error) {
					reject(error);
					return;
				}

				resolve();
			};

			ffmpeg.stderr?.on("data", (chunk) => {
				stderrOutput += chunk.toString();
			});

			ffmpeg.on("error", (error) => {
				finalize(new Error(`ffmpeg failed to start: ${error.message}`));
			});

			ffmpeg.on("close", (code) => {
				if (code === 0) {
					finalize();
					return;
				}

				const suffix = stderrOutput.trim() ? `: ${stderrOutput.trim()}` : "";
				finalize(new Error(`ffmpeg exited with code ${String(code)}${suffix}`));
			});

			const timeoutId = setTimeout(() => {
				ffmpeg.kill("SIGKILL");
				finalize(new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms`));
			}, FFMPEG_TIMEOUT_MS);
		});
	}

	/** 一時ファイル名に安全なベース名のみを使う。 */
	private _sanitizeFilename(filename: string): string {
		const baseName = basename(filename).replace(/\.[^.]+$/, "");
		return baseName.length > 0 ? baseName : "audio";
	}
}
