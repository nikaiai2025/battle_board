import {
	YOMIAGE_VOICE_NAMES,
	YOMIAGE_VOICE_TAGS,
	type YomiageVoiceName,
	type YomiageVoiceTag,
} from "../../../../config/yomiage";

/**
 * !yomiage で使用する音声選択結果。
 *
 * See: features/command_yomiage.feature - 対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない
 * See: docs/architecture/components/yomiage.md §5.2
 */
export interface VoicePick {
	voiceName: YomiageVoiceName;
	voiceTag: YomiageVoiceTag;
}

/**
 * voice name と voice tag を一様ランダムに選択する。
 *
 * See: features/command_yomiage.feature - 対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない
 * See: docs/architecture/components/yomiage.md §5.2
 *
 * @param randomFn - テスト時に差し替え可能な乱数関数
 * @returns 選択された voice name / voice tag
 */
export function pickVoice(randomFn: () => number = Math.random): VoicePick {
	return {
		voiceName: pickFromList(YOMIAGE_VOICE_NAMES, randomFn),
		voiceTag: pickFromList(YOMIAGE_VOICE_TAGS, randomFn),
	};
}

function pickFromList<T>(list: readonly T[], randomFn: () => number): T {
	const index = Math.floor(randomFn() * list.length);
	return list[index] as T;
}
