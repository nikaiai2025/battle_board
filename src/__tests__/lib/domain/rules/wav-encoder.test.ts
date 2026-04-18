/**
 * 単体テスト: wav-encoder
 *
 * See: features/command_yomiage.feature - GitHub Actions上でWAV生成・軽量化・アップロードが順に行われる
 * See: docs/architecture/components/yomiage.md §5.4
 *
 * テスト方針:
 *   - RIFF/WAVE ヘッダの各フィールドを数値で検証する。
 *   - 空 PCM でも正しいヘッダが生成されることを確認する。
 *   - 既に WAV の場合は no-op であることを確認する。
 */

import { describe, expect, it } from "vitest";
import {
	type WavEncodingOptions,
	wrapPcmAsWav,
} from "../../../../lib/domain/rules/wav-encoder";

const DEFAULT_OPTIONS: WavEncodingOptions = {
	sampleRate: 24000,
	numChannels: 1,
	bitDepth: 16,
};

describe("wrapPcmAsWav", () => {
	it("raw PCM に RIFF/WAVE ヘッダを付与する", () => {
		const pcm = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

		const wav = wrapPcmAsWav(pcm, DEFAULT_OPTIONS);
		const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

		expect(wav.byteLength).toBe(44 + pcm.length);
		expect(readAscii(wav, 0, 4)).toBe("RIFF");
		expect(readAscii(wav, 8, 4)).toBe("WAVE");
		expect(readAscii(wav, 12, 4)).toBe("fmt ");
		expect(readAscii(wav, 36, 4)).toBe("data");
		expect(view.getUint32(4, true)).toBe(pcm.length + 36);
		expect(view.getUint32(16, true)).toBe(16);
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(24000);
		expect(view.getUint32(28, true)).toBe(48000);
		expect(view.getUint16(32, true)).toBe(2);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBe(pcm.length);
		expect(Array.from(wav.slice(44))).toEqual(Array.from(pcm));
	});

	it("空 PCM でも正常な WAV ヘッダを生成する", () => {
		const pcm = new Uint8Array([]);

		const wav = wrapPcmAsWav(pcm, DEFAULT_OPTIONS);
		const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

		expect(wav.byteLength).toBe(44);
		expect(readAscii(wav, 0, 4)).toBe("RIFF");
		expect(readAscii(wav, 8, 4)).toBe("WAVE");
		expect(readAscii(wav, 36, 4)).toBe("data");
		expect(view.getUint32(4, true)).toBe(36);
		expect(view.getUint32(40, true)).toBe(0);
	});

	it("既に WAV ヘッダがある場合は入力をそのまま返す", () => {
		const pcm = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
		const wav = wrapPcmAsWav(pcm, DEFAULT_OPTIONS);

		const result = wrapPcmAsWav(wav, DEFAULT_OPTIONS);

		expect(result).toBe(wav);
	});
});

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
	return String.fromCharCode(...bytes.slice(offset, offset + length));
}
