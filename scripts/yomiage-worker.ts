/**
 * yomiage-worker.ts -- !yomiage GH Actions ワーカースクリプト
 *
 * GitHub Actions yomiage-scheduler から tsx で実行されるエントリポイント。
 * Vercel の internal API から pending を取得し、対象レス本文の読み上げ音声を生成して
 * 音声 URL を完了通知 API に送信する。
 *
 * 責務:
 *   1. GET /api/internal/yomiage/pending -> pending リスト取得
 *   2. GET /api/internal/yomiage/target -> 対象レス本文取得
 *   3. GeminiTtsAdapter で音声データ取得
 *   4. WAV 正規化 -> AudioCompressor で軽量化
 *   5. LitterboxAdapter でアップロード
 *   6. POST /api/internal/yomiage/complete -> 成功 / 失敗通知
 *
 * セキュリティ:
 *   読み上げ対象のユーザー入力は text パラメータ末尾にのみ連結し、
 *   音声制御は voiceTag / voiceName / modelId でシステム側から与える。
 *   ユーザー入力で音声設定を上書きしない。
 *
 * 環境変数:
 *   DEPLOY_URL      -- Vercel デプロイ URL
 *   BOT_API_KEY     -- Internal API 認証キー
 *   GEMINI_API_KEYS -- Gemini API キー（カンマ区切り）
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 * See: features/command_yomiage.feature @軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される
 * See: docs/architecture/components/yomiage.md §5.1
 */

import { readFile } from "node:fs/promises";
import { load } from "js-yaml";

import { YOMIAGE_MODEL_ID } from "../config/yomiage";
import { wrapPcmAsWav } from "../src/lib/domain/rules/wav-encoder";
import { pickVoice } from "../src/lib/domain/rules/yomiage-voice-picker";
import { AudioCompressor } from "../src/lib/infrastructure/adapters/audio-compressor";
import { LitterboxAdapter } from "../src/lib/infrastructure/adapters/audio-storage-adapter";
import { GeminiTtsAdapter } from "../src/lib/infrastructure/adapters/gemini-tts-adapter";

const DEPLOY_URL = process.env.DEPLOY_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;
const GEMINI_API_KEYS_RAW = process.env.GEMINI_API_KEYS;

if (!DEPLOY_URL) {
	console.error("[yomiage-worker] DEPLOY_URL is not set");
	process.exit(1);
}
if (!BOT_API_KEY) {
	console.error("[yomiage-worker] BOT_API_KEY is not set");
	process.exit(1);
}
if (!GEMINI_API_KEYS_RAW) {
	console.error("[yomiage-worker] GEMINI_API_KEYS is not set");
	process.exit(1);
}

const GEMINI_API_KEYS = GEMINI_API_KEYS_RAW.split(",")
	.map((value) => value.trim())
	.filter((value) => value.length > 0);

if (GEMINI_API_KEYS.length === 0) {
	console.error("[yomiage-worker] GEMINI_API_KEYS contains no valid keys");
	process.exit(1);
}

const MAX_PROCESS_PER_EXECUTION = 10;
const COMMANDS_YAML_PATH = new URL("../config/commands.yaml", import.meta.url);
const WAV_ENCODING_OPTIONS = {
	sampleRate: 24000,
	numChannels: 1,
	bitDepth: 16,
} as const;

interface PendingYomiageCommand {
	id: string;
	threadId: string;
	targetPostNumber: number;
	invokerUserId: string;
	payload: {
		model_id?: string;
		targetPostNumber?: number;
	} | null;
}

interface PendingResponse {
	pendingList: PendingYomiageCommand[];
}

interface TargetResponse {
	post: {
		body: string;
		isDeleted: boolean;
		isSystemMessage: boolean;
	} | null;
}

interface CommandsYaml {
	commands?: {
		yomiage?: {
			cost?: number;
		};
	};
}

type FailureStage = "tts" | "compress" | "upload";

type CompleteRequestBody =
	| {
			pendingId: string;
			threadId: string;
			invokerUserId: string;
			targetPostNumber: number;
			success: true;
			audioUrl: string;
			amount: number;
	  }
	| {
			pendingId: string;
			threadId: string;
			invokerUserId: string;
			targetPostNumber: number;
			success: false;
			error: string;
			stage?: FailureStage;
			amount: number;
	  };

interface WorkerAdapters {
	ttsAdapter: GeminiTtsAdapter;
	compressor: AudioCompressor;
	storageAdapter: LitterboxAdapter;
}

/**
 * workflow 側のコマンド設定と返金額を一致させるため、commands.yaml から cost を読む。
 *
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 */
async function loadYomiageCommandCost(): Promise<number> {
	const raw = await readFile(COMMANDS_YAML_PATH, "utf8");
	const parsed = load(raw) as CommandsYaml;
	const cost = parsed.commands?.yomiage?.cost;

	if (typeof cost !== "number" || !Number.isInteger(cost) || cost <= 0) {
		throw new Error("config/commands.yaml の yomiage.cost が不正です");
	}

	return cost;
}

/**
 * Internal API 用ヘッダを返す。
 *
 * See: docs/architecture/components/yomiage.md §2.3
 */
function createInternalApiHeaders(): HeadersInit {
	return {
		Authorization: `Bearer ${BOT_API_KEY}`,
	};
}

/**
 * 末尾スラッシュ有無の差を吸収して Internal API URL を組み立てる。
 *
 * See: docs/architecture/components/yomiage.md §7
 */
function buildInternalApiUrl(pathname: string): string {
	return new URL(pathname, `${DEPLOY_URL}/`).toString();
}

/**
 * pending 一覧を取得する。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 */
async function fetchPendingList(): Promise<PendingYomiageCommand[]> {
	const response = await fetch(buildInternalApiUrl("/api/internal/yomiage/pending"), {
		headers: createInternalApiHeaders(),
	});

	if (!response.ok) {
		throw new Error(
			`GET /api/internal/yomiage/pending failed: ${response.status} ${response.statusText}`,
		);
	}

	const body = (await response.json()) as PendingResponse;
	return body.pendingList;
}

/**
 * 対象レス本文を取得し、読み上げ不可能な状態ならエラー化する。
 *
 * See: features/command_yomiage.feature @対象レス本文は読み上げ対象として扱われ、音声指示を上書きしない
 */
async function fetchTargetPostBody(
	threadId: string,
	postNumber: number,
): Promise<string> {
	const url = new URL(buildInternalApiUrl("/api/internal/yomiage/target"));
	url.searchParams.set("threadId", threadId);
	url.searchParams.set("postNumber", String(postNumber));

	const response = await fetch(url, {
		headers: createInternalApiHeaders(),
	});

	if (!response.ok) {
		throw new Error(
			`GET /api/internal/yomiage/target failed: ${response.status} ${response.statusText}`,
		);
	}

	const body = (await response.json()) as TargetResponse;
	if (!body.post) {
		throw new Error("対象レスが見つかりません");
	}
	if (body.post.isDeleted) {
		throw new Error("削除されたレスは読み上げできません");
	}
	if (body.post.isSystemMessage) {
		throw new Error("システムメッセージは読み上げできません");
	}

	return body.post.body;
}

/**
 * 失敗理由を complete API に通知する。
 *
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 * See: features/command_yomiage.feature @軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される
 */
async function postComplete(body: CompleteRequestBody): Promise<void> {
	const response = await fetch(buildInternalApiUrl("/api/internal/yomiage/complete"), {
		method: "POST",
		headers: {
			...createInternalApiHeaders(),
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(
			`POST /api/internal/yomiage/complete failed: ${response.status} ${response.statusText}`,
		);
	}
}

/**
 * Gemini 音声データを WAV として扱える形に正規化する。
 *
 * Gemini 側が WAV を返した場合は wrapPcmAsWav が no-op になるため、
 * 実 API の返却形式に依存せず worker 側は単一の処理で進められる。
 *
 * See: tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §2.1
 */
function normalizeGeminiAudioToWav(audioBytes: Uint8Array): Uint8Array {
	return wrapPcmAsWav(audioBytes, WAV_ENCODING_OPTIONS);
}

/**
 * pending 1件を処理する。
 *
 * See: docs/architecture/components/yomiage.md §5.1
 */
async function processPendingCommand(
	pending: PendingYomiageCommand,
	commandCost: number,
	adapters: WorkerAdapters,
): Promise<void> {
	const targetPostNumber =
		pending.payload?.targetPostNumber ?? pending.targetPostNumber;

	const baseBody = {
		pendingId: pending.id,
		threadId: pending.threadId,
		invokerUserId: pending.invokerUserId,
		targetPostNumber,
		amount: commandCost,
	} as const;

	try {
		const targetPostBody = await fetchTargetPostBody(
			pending.threadId,
			targetPostNumber,
		);
		const { voiceName, voiceTag } = pickVoice();
		const text = `${voiceTag} ${targetPostBody}`;
		const modelId = pending.payload?.model_id ?? YOMIAGE_MODEL_ID;

		console.log(
			`[yomiage-worker] pending=${pending.id} target=${targetPostNumber} voice=${voiceName}`,
		);

		let wavBuffer: Uint8Array;
		try {
			const synthesized = await adapters.ttsAdapter.synthesize({
				text,
				voiceName,
				modelId,
			});
			wavBuffer = normalizeGeminiAudioToWav(synthesized.pcmBuffer);
		} catch (error) {
			await postComplete({
				...baseBody,
				success: false,
				error: error instanceof Error ? error.message : String(error),
				stage: "tts",
			});
			return;
		}

		let compressed: Uint8Array;
		try {
			const result = await adapters.compressor.compress({
				input: wavBuffer,
				filename: `yomiage-${pending.id}.wav`,
			});
			compressed = result.output;
		} catch (error) {
			await postComplete({
				...baseBody,
				success: false,
				error: error instanceof Error ? error.message : String(error),
				stage: "compress",
			});
			return;
		}

		let audioUrl: string;
		try {
			const uploadResult = await adapters.storageAdapter.upload({
				data: compressed,
				filename: `yomiage-${pending.id}.wav`,
				mimeType: "audio/wav",
			});
			audioUrl = uploadResult.url;
		} catch (error) {
			await postComplete({
				...baseBody,
				success: false,
				error: error instanceof Error ? error.message : String(error),
				stage: "upload",
			});
			return;
		}

		await postComplete({
			...baseBody,
			success: true,
			audioUrl,
		});
	} catch (error) {
		await postComplete({
			...baseBody,
			success: false,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * エントリポイント。
 *
 * See: docs/architecture/components/yomiage.md §5.1
 */
async function main(): Promise<void> {
	console.log(`=== Yomiage Worker started at ${new Date().toISOString()} ===`);

	const pendingList = await fetchPendingList();
	if (pendingList.length === 0) {
		console.log("[yomiage-worker] No pending yomiage commands.");
		return;
	}

	const commandCost = await loadYomiageCommandCost();
	const toProcess = pendingList.slice(0, MAX_PROCESS_PER_EXECUTION);
	const adapters: WorkerAdapters = {
		ttsAdapter: new GeminiTtsAdapter(GEMINI_API_KEYS),
		compressor: new AudioCompressor(),
		storageAdapter: new LitterboxAdapter(),
	};

	console.log(
		`[yomiage-worker] Found ${pendingList.length} pending command(s). Processing up to ${MAX_PROCESS_PER_EXECUTION}.`,
	);

	for (const pending of toProcess) {
		await processPendingCommand(pending, commandCost, adapters);
	}

	console.log(`=== Yomiage Worker finished at ${new Date().toISOString()} ===`);
}

main().catch((error) => {
	console.error("[yomiage-worker] Fatal error:", error);
	process.exit(1);
});
