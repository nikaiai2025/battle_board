/**
 * Audio Storage Adapter
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.6
 */

import { YOMIAGE_RETENTION_HOURS } from "../../../../config/yomiage";

const LITTERBOX_ENDPOINT =
	"https://litterbox.catbox.moe/resources/internals/api.php";
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * 音声アップロードの DI インターフェース。
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.6
 */
export interface IAudioStorageAdapter {
	upload(params: {
		data: Uint8Array;
		filename: string;
		mimeType: string;
		expiresAt?: Date;
	}): Promise<{
		url: string;
	}>;
}

class LitterboxHttpError extends Error {
	constructor(readonly status: number) {
		super(`Litterbox upload failed: HTTP ${status}`);
	}
}

/**
 * Litterbox へ匿名アップロードする暫定実装。
 *
 * See: features/command_yomiage.feature
 * See: tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §1.4
 */
export class LitterboxAdapter implements IAudioStorageAdapter {
	/**
	 * WAV を Litterbox にアップロードし、一時公開 URL を返す。
	 *
	 * expiresAt は Litterbox の固定 TTL に写像できないため現在は無視し、
	 * `config/yomiage.ts` の保持期間設定を使用する。
	 *
	 * See: features/command_yomiage.feature
	 * See: docs/architecture/components/yomiage.md §5.6
	 */
	async upload(params: {
		data: Uint8Array;
		filename: string;
		mimeType: string;
		expiresAt?: Date;
	}): Promise<{ url: string }> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				return await this._uploadOnce(params);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (!this._isRetryable(error) || attempt === MAX_RETRIES - 1) {
					throw lastError;
				}

				await this._sleep(INITIAL_DELAY_MS * 2 ** attempt);
			}
		}

		throw lastError ?? new Error("Litterbox upload failed");
	}

	/** 1 回分のアップロード処理。 */
	private async _uploadOnce(params: {
		data: Uint8Array;
		filename: string;
		mimeType: string;
		expiresAt?: Date;
	}): Promise<{ url: string }> {
		const formData = new FormData();
		formData.append("reqtype", "fileupload");
		formData.append("time", `${YOMIAGE_RETENTION_HOURS}h`);
		formData.append(
			"fileToUpload",
			new Blob([Buffer.from(params.data)], { type: params.mimeType }),
			params.filename,
		);

		const response = await fetch(LITTERBOX_ENDPOINT, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			throw new LitterboxHttpError(response.status);
		}

		const responseText = (await response.text()).trim();
		if (!responseText.startsWith("https://")) {
			throw new Error(`Litterbox upload rejected: ${responseText}`);
		}

		return { url: responseText };
	}

	/** 一時的な障害のみリトライ対象にする。 */
	private _isRetryable(error: unknown): boolean {
		if (error instanceof LitterboxHttpError) {
			return error.status >= 500;
		}

		if (!(error instanceof Error)) {
			return false;
		}

		const message = error.message.toLowerCase();
		return (
			message.includes("network") ||
			message.includes("timeout") ||
			message.includes("econnreset") ||
			message.includes("fetch failed")
		);
	}

	/** 指数バックオフ用の待機。 */
	private _sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
