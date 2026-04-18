/**
 * Gemini TTS Adapter
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.3
 */

import { GoogleGenAI } from "@google/genai";

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * Gemini TTS 呼び出しの DI インターフェース。
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.3
 */
export interface IGeminiTtsAdapter {
	synthesize(params: {
		text: string;
		voiceName: string;
		modelId: string;
	}): Promise<{
		pcmBuffer: Uint8Array;
		voiceName: string;
	}>;
}

/**
 * Gemini TTS を呼び出して音声バイト列を取得する本番実装。
 *
 * レスポンスが raw PCM か WAV かは実 API の挙動に依存するため、
 * 受信時に MIME と RIFF ヘッダ有無をログ出力して確認可能にする。
 *
 * See: features/command_yomiage.feature
 * See: tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §2.1
 */
export class GeminiTtsAdapter implements IGeminiTtsAdapter {
	private readonly apiKeys: string[];

	constructor(apiKeys: string | string[] = process.env.GEMINI_API_KEYS ?? "") {
		const normalizedApiKeys = (Array.isArray(apiKeys) ? apiKeys : apiKeys.split(","))
			.map((value) => value.trim())
			.filter((value) => value.length > 0);

		if (normalizedApiKeys.length === 0) {
			throw new Error("GEMINI_API_KEYS is not configured");
		}

		this.apiKeys = normalizedApiKeys;
	}

	/**
	 * 音声合成を行い、Gemini の音声レスポンスをそのまま返す。
	 *
	 * See: features/command_yomiage.feature
	 * See: docs/architecture/components/yomiage.md §5.3
	 */
	async synthesize(params: {
		text: string;
		voiceName: string;
		modelId: string;
	}): Promise<{
		pcmBuffer: Uint8Array;
		voiceName: string;
	}> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				return await this._callGeminiTts(params);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (!this._isRetryable(error) || attempt === MAX_RETRIES - 1) {
					throw lastError;
				}

				await this._sleep(INITIAL_DELAY_MS * 2 ** attempt);
			}
		}

		throw lastError ?? new Error("Gemini TTS failed");
	}

	/**
	 * Gemini API を 1 回呼び出し、音声データを抽出する。
	 *
	 * See: features/command_yomiage.feature
	 * See: tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §2.1
	 */
	private async _callGeminiTts(params: {
		text: string;
		voiceName: string;
		modelId: string;
	}): Promise<{
		pcmBuffer: Uint8Array;
		voiceName: string;
	}> {
		const ai = new GoogleGenAI({ apiKey: this._pickApiKey() });
		const response = await ai.models.generateContent({
			model: params.modelId,
			contents: params.text,
			config: {
				responseModalities: ["AUDIO"],
				speechConfig: {
					voiceConfig: {
						prebuiltVoiceConfig: {
							voiceName: params.voiceName,
						},
					},
				},
			},
		});

		const inlineData = response.candidates?.[0]?.content?.parts?.find(
			(part) => part.inlineData?.data,
		)?.inlineData;

		if (!inlineData?.data) {
			throw new Error("Gemini TTS response does not contain audio data");
		}

		const audioBytes = this._decodeBase64(inlineData.data);
		this._logAudioPayload(inlineData.mimeType, audioBytes);

		return {
			pcmBuffer: audioBytes,
			voiceName: params.voiceName,
		};
	}

	/** API キーをランダムに 1 つ選択する。 */
	private _pickApiKey(): string {
		return this.apiKeys[Math.floor(Math.random() * this.apiKeys.length)];
	}

	/** Gemini の base64 音声データを Uint8Array に変換する。 */
	private _decodeBase64(data: string): Uint8Array {
		return new Uint8Array(Buffer.from(data, "base64"));
	}

	/**
	 * 実 API の返却形式確認用に、MIME と先頭バイト列をログに残す。
	 *
	 * See: tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §2.1
	 */
	private _logAudioPayload(
		mimeType: string | undefined,
		audioBytes: Uint8Array,
	): void {
		const headerPreview = Buffer.from(audioBytes.subarray(0, 16)).toString("hex");

		console.info("[GeminiTtsAdapter] audio payload", {
			mimeType: mimeType ?? "unknown",
			byteLength: audioBytes.byteLength,
			hasRiffHeader: this._hasRiffHeader(audioBytes),
			headerPreview,
		});
	}

	/** RIFF/WAVE ヘッダの有無を確認する。 */
	private _hasRiffHeader(audioBytes: Uint8Array): boolean {
		if (audioBytes.byteLength < 12) {
			return false;
		}

		const riff = String.fromCharCode(...audioBytes.slice(0, 4));
		const wave = String.fromCharCode(...audioBytes.slice(8, 12));

		return riff === "RIFF" && wave === "WAVE";
	}

	/** 一時的な障害のみリトライ対象にする。 */
	private _isRetryable(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}

		const message = error.message.toLowerCase();
		return (
			message.includes("429") ||
			message.includes("500") ||
			message.includes("503") ||
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
