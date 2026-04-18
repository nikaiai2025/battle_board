/**
 * ドメインルール: raw PCM に RIFF/WAVE ヘッダを付与する。
 *
 * See: features/command_yomiage.feature - GitHub Actions上でWAV生成・軽量化・アップロードが順に行われる
 * See: docs/architecture/components/yomiage.md §5.4
 */

export interface WavEncodingOptions {
	sampleRate: number;
	numChannels: number;
	bitDepth: number;
}

const WAV_HEADER_SIZE = 44;
const RIFF_CHUNK_OVERHEAD = 36;
const PCM_AUDIO_FORMAT = 1;

/**
 * raw PCM バイト列に RIFF/WAVE ヘッダを付与して WAV を生成する純粋関数。
 *
 * Gemini 側がすでに完全な WAV を返している場合は、そのまま返す。
 *
 * See: features/command_yomiage.feature - GitHub Actions上でWAV生成・軽量化・アップロードが順に行われる
 * See: docs/architecture/components/yomiage.md §5.4
 *
 * @param pcm - 24kHz mono 16bit PCM、または既存の WAV バイト列
 * @param options - WAV ヘッダに書き込む音声フォーマット
 * @returns 完全な WAV バイト列
 */
export function wrapPcmAsWav(
	pcm: Uint8Array,
	options: WavEncodingOptions,
): Uint8Array {
	if (isWav(pcm)) {
		return pcm;
	}

	const { sampleRate, numChannels, bitDepth } = options;
	const bytesPerSample = bitDepth / 8;
	const byteRate = sampleRate * numChannels * bytesPerSample;
	const blockAlign = numChannels * bytesPerSample;
	const totalSize = WAV_HEADER_SIZE + pcm.length;

	const wav = new Uint8Array(totalSize);
	const view = new DataView(wav.buffer);

	writeAscii(view, 0, "RIFF");
	view.setUint32(4, pcm.length + RIFF_CHUNK_OVERHEAD, true);
	writeAscii(view, 8, "WAVE");

	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, PCM_AUDIO_FORMAT, true);
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);

	writeAscii(view, 36, "data");
	view.setUint32(40, pcm.length, true);
	wav.set(pcm, WAV_HEADER_SIZE);

	return wav;
}

function isWav(bytes: Uint8Array): boolean {
	return (
		bytes.length >= WAV_HEADER_SIZE &&
		readAscii(bytes, 0, 4) === "RIFF" &&
		readAscii(bytes, 8, 4) === "WAVE"
	);
}

function writeAscii(view: DataView, offset: number, value: string): void {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
	return String.fromCharCode(...bytes.slice(offset, offset + length));
}
