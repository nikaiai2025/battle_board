/**
 * 単体テスト: yomiage-voice-picker
 *
 * See: features/command_yomiage.feature - 対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない
 * See: docs/architecture/components/yomiage.md §5.2
 *
 * テスト方針:
 *   - 返り値が設定済みの音声名・音声タグから選ばれることを確認する。
 *   - randomFn を固定して決定論的な選択結果を検証する。
 */

import { describe, expect, it, vi } from "vitest";
import {
	YOMIAGE_VOICE_NAMES,
	YOMIAGE_VOICE_TAGS,
} from "../../../../../config/yomiage";
import { pickVoice } from "../../../../lib/domain/rules/yomiage-voice-picker";

describe("pickVoice", () => {
	it("返り値が設定済みの音声名と音声タグに含まれる", () => {
		const result = pickVoice(() => 0.5);

		expect(YOMIAGE_VOICE_NAMES).toContain(result.voiceName);
		expect(YOMIAGE_VOICE_TAGS).toContain(result.voiceTag);
	});

	it("randomFn の値に応じて先頭要素を選べる", () => {
		const result = pickVoice(() => 0);

		expect(result).toEqual({
			voiceName: YOMIAGE_VOICE_NAMES[0],
			voiceTag: YOMIAGE_VOICE_TAGS[0],
		});
	});

	it("randomFn の値に応じて末尾要素を選べる", () => {
		const result = pickVoice(() => 0.999999);

		expect(result).toEqual({
			voiceName: YOMIAGE_VOICE_NAMES[YOMIAGE_VOICE_NAMES.length - 1],
			voiceTag: YOMIAGE_VOICE_TAGS[YOMIAGE_VOICE_TAGS.length - 1],
		});
	});

	it("voice name と voice tag で別々に randomFn が評価される", () => {
		const randomFn = vi
			.fn<() => number>()
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(0.999999);

		const result = pickVoice(randomFn);

		expect(result).toEqual({
			voiceName: YOMIAGE_VOICE_NAMES[0],
			voiceTag: YOMIAGE_VOICE_TAGS[YOMIAGE_VOICE_TAGS.length - 1],
		});
		expect(randomFn).toHaveBeenCalledTimes(2);
	});
});
