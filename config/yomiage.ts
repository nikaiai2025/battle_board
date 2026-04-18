/**
 * !yomiage コマンドで使用する音声設定定数。
 *
 * モデル ID・音声名・音声タグ・保持期間を設定層で一元管理する。
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.2
 * See: docs/architecture/components/yomiage.md §5.7
 */

export const YOMIAGE_MODEL_ID = "gemini-3.1-flash-tts-preview" as const;

export const YOMIAGE_VOICE_NAMES = [
	"Zephyr",
	"Puck",
	"Charon",
	"Kore",
	"Fenrir",
	"Leda",
	"Orus",
	"Aoede",
	"Callirrhoe",
	"Autonoe",
	"Enceladus",
	"Iapetus",
	"Umbriel",
	"Algieba",
	"Despina",
	"Erinome",
	"Algenib",
	"Rasalgethi",
	"Laomedeia",
	"Achernar",
	"Alnilam",
	"Schedar",
	"Gacrux",
	"Pulcherrima",
	"Achird",
	"Zubenelgenubi",
	"Vindemiatrix",
	"Sadachbia",
	"Sadaltager",
	"Sulafat",
] as const;

export type YomiageVoiceName = (typeof YOMIAGE_VOICE_NAMES)[number];

export const YOMIAGE_VOICE_TAGS = [
	"[amazed]",
	"[crying]",
	"[curious]",
	"[excited]",
	"[excitedly]",
	"[sighs]",
	"[gasp]",
	"[giggles]",
	"[laughs]",
	"[mischievously]",
	"[panicked]",
	"[sarcastic]",
	"[serious]",
	"[shouting]",
	"[tired]",
	"[trembling]",
	"[whispers]",
] as const;

export type YomiageVoiceTag = (typeof YOMIAGE_VOICE_TAGS)[number];

/**
 * Litterbox が受け付ける固定保持期間。
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §5.7
 */
export const YOMIAGE_RETENTION_HOURS = 72 as const;
