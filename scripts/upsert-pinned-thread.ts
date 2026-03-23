/**
 * 固定スレッド（案内板）生成スクリプト
 *
 * 処理フロー:
 *   1. config/commands.yaml を読み込む
 *   2. enabled=true のコマンドを抽出
 *   3. テンプレートに従い案内テキストを生成
 *   4. threads テーブルに固定スレッドを upsert（既存なら本文を更新）
 *   5. posts テーブルに1レス目を upsert
 *
 * 実行方法:
 *   npx tsx scripts/upsert-pinned-thread.ts
 *
 * 推奨: Next.js instrumentation.ts からデプロイ時に自動実行する
 *
 * See: features/thread.feature @pinned_thread
 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §2-b
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { DEFAULT_BOARD_ID } from "../src/lib/domain/constants";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CommandConfig {
	description: string;
	cost: number;
	targetFormat?: string;
	enabled: boolean;
	stealth?: boolean;
	/** true の場合、案内板のコマンド一覧から除外される */
	hidden?: boolean;
}

interface CommandsYaml {
	commands: Record<string, CommandConfig>;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 固定スレッドのタイトル */
const PINNED_THREAD_TITLE = "■ ボットちゃんねる 案内板";

/** 固定スレッドの board_id */
const PINNED_THREAD_BOARD_ID = DEFAULT_BOARD_ID;

/**
 * システムユーザーの well-known UUID（固定値）。
 * threads.created_by は UUID NOT NULL REFERENCES users(id) であるため、
 * 文字列 "system" は使用できない。冪等なupsertで事前作成する。
 * See: features/thread.feature @pinned_thread
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/** 先頭表示用の未来日時（2099-01-01T00:00:00Z） */
const PINNED_LAST_POST_AT = new Date("2099-01-01T00:00:00Z");

/** 固定スレッドの threadKey（2099-01-01 00:00:00 UTC の UNIX タイムスタンプ） */
const PINNED_THREAD_KEY = "4070908800";

// ---------------------------------------------------------------------------
// 案内テキスト生成
// ---------------------------------------------------------------------------

/**
 * config/commands.yaml を読み込み、有効なコマンド一覧を返す。
 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §2-a
 */
function loadCommandConfigs(
	configPath: string,
): Array<{ name: string; description: string; cost: number }> {
	const content = fs.readFileSync(configPath, "utf-8");
	const parsed = yaml.load(content) as CommandsYaml;
	return Object.entries(parsed.commands)
		.filter(([, config]) => config.enabled && !config.hidden)
		.map(([name, config]) => ({
			name,
			description: config.description,
			cost: config.cost,
		}));
}

/**
 * コマンド一覧から案内テキストを生成する。
 * テンプレートは静的テキスト + コマンド一覧（動的）の組み合わせ。
 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §2-b 生成される案内テキストのイメージ
 */
function generateAnnouncementBody(
	commands: Array<{ name: string; description: string; cost: number }>,
): string {
	const commandLines = commands.map((cmd) => {
		const costText = cmd.cost === 0 ? "無料" : `${cmd.cost}コイン`;
		return `  !${cmd.name.padEnd(8)}（${costText.padEnd(8)}）— ${cmd.description}`;
	});

	return [
		"■ ボットちゃんねる 案内板",
		"",
		"【使い方】",
		"書き込み欄にテキストを入力して送信するだけ。",
		"コマンドを使うと掲示板がもっと面白くなる。",
		"",
		"【コマンド一覧】",
		...commandLines,
		"",
		"【リンク】",
		`  メイン（専ブラ可）: https://battle-board.shika.workers.dev/${DEFAULT_BOARD_ID}`,
		`  サブ: https://battle-board-uma.vercel.app/${DEFAULT_BOARD_ID}`,
		"  マイページ: https://battle-board.shika.workers.dev/mypage",
		"  開発連絡板: https://battle-board.shika.workers.dev/dev/",
	].join("\n");
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

/**
 * 固定スレッドを upsert する。
 * スクリプトのメインエントリーポイント。
 */
async function main(): Promise<void> {
	// Supabase クライアントを動的インポート（スクリプト実行時のみ必要）
	// NOTE: このスクリプトは Node.js 環境で直接実行されるため dynamic import を使用する
	const { createClient } = await import("@supabase/supabase-js");

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		throw new Error(
			"NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません",
		);
	}

	const supabase = createClient(supabaseUrl, supabaseServiceKey);

	// システムユーザーを upsert する（冪等）
	// threads.created_by は UUID NOT NULL REFERENCES users(id) であるため、
	// "system" 文字列ではなく well-known UUID を使用する。
	// See: features/thread.feature @pinned_thread
	console.log(
		`[upsert-pinned-thread] システムユーザーを upsert 中... (id=${SYSTEM_USER_ID})`,
	);
	const { error: userUpsertError } = await supabase.from("users").upsert(
		{
			id: SYSTEM_USER_ID,
			auth_token: "system",
			author_id_seed: "system",
		},
		{ onConflict: "id" },
	);
	if (userUpsertError) {
		throw new Error(
			`システムユーザー upsert エラー: ${userUpsertError.message}`,
		);
	}
	console.log(
		"[upsert-pinned-thread] システムユーザーの upsert が完了しました",
	);

	// コマンド設定を読み込む
	const configPath = path.resolve(process.cwd(), "config", "commands.yaml");
	console.log(`[upsert-pinned-thread] コマンド設定を読み込み中: ${configPath}`);
	const commands = loadCommandConfigs(configPath);
	console.log(
		`[upsert-pinned-thread] 有効なコマンド: ${commands.map((c) => c.name).join(", ")}`,
	);

	// 案内テキストを生成する
	const body = generateAnnouncementBody(commands);

	// 固定スレッドを upsert する（thread_key で一意に識別）
	console.log("[upsert-pinned-thread] 固定スレッドを upsert 中...");
	const { data: existingThread, error: findError } = await supabase
		.from("threads")
		.select("id")
		.eq("thread_key", PINNED_THREAD_KEY)
		.single();

	let threadId: string;

	if (findError && findError.code !== "PGRST116") {
		throw new Error(`固定スレッド検索エラー: ${findError.message}`);
	}

	if (existingThread) {
		// 既存の固定スレッドが存在する場合は last_post_at のみ更新（内容は posts で管理）
		threadId = (existingThread as { id: string }).id;
		const { error: updateError } = await supabase
			.from("threads")
			.update({
				last_post_at: PINNED_LAST_POST_AT.toISOString(),
				title: PINNED_THREAD_TITLE,
				is_pinned: true,
			})
			.eq("id", threadId);

		if (updateError) {
			throw new Error(`固定スレッド更新エラー: ${updateError.message}`);
		}
		console.log(
			`[upsert-pinned-thread] 既存固定スレッドを更新しました (id=${threadId})`,
		);
	} else {
		// 固定スレッドが存在しない場合は新規作成
		const { data: newThread, error: insertError } = await supabase
			.from("threads")
			.insert({
				thread_key: PINNED_THREAD_KEY,
				board_id: PINNED_THREAD_BOARD_ID,
				title: PINNED_THREAD_TITLE,
				created_by: SYSTEM_USER_ID,
				last_post_at: PINNED_LAST_POST_AT.toISOString(),
				is_pinned: true,
			})
			.select("id")
			.single();

		if (insertError || !newThread) {
			throw new Error(`固定スレッド作成エラー: ${insertError?.message}`);
		}
		threadId = (newThread as { id: string }).id;
		console.log(
			`[upsert-pinned-thread] 固定スレッドを新規作成しました (id=${threadId})`,
		);
	}

	// 1レス目（案内テキスト）を upsert する（post_number=1 で一意）
	// ON CONFLICT を使用して冪等性を保証する
	const { error: postError } = await supabase.from("posts").upsert(
		{
			thread_id: threadId,
			post_number: 1,
			author_id: null,
			display_name: "案内板",
			daily_id: "system",
			body,
			inline_system_info: null,
			is_system_message: true,
			is_deleted: false,
		},
		{ onConflict: "thread_id,post_number" },
	);

	if (postError) {
		throw new Error(`固定スレッドのレス upsert エラー: ${postError.message}`);
	}

	// post_count と dat_byte_size を更新する
	const { error: countError } = await supabase
		.from("threads")
		.update({ post_count: 1 })
		.eq("id", threadId)
		.eq("post_count", 0); // まだ0の場合のみ更新（既存レスがある場合は保持）

	if (countError) {
		console.warn(
			`[upsert-pinned-thread] post_count 更新警告: ${countError.message}`,
		);
	}

	console.log("[upsert-pinned-thread] 固定スレッドの upsert が完了しました");
	console.log(`  スレッドID: ${threadId}`);
	console.log(`  タイトル: ${PINNED_THREAD_TITLE}`);
	console.log(`  last_post_at: ${PINNED_LAST_POST_AT.toISOString()}`);
}

// スクリプトとして直接実行された場合のみ main() を呼ぶ
// import() でモジュールとして読み込まれた場合（テスト等）は実行しない
if (process.argv[1] && process.argv[1].includes("upsert-pinned-thread")) {
	main().catch((err) => {
		console.error("[upsert-pinned-thread] エラー:", err);
		process.exit(1);
	});
}

// テスト用エクスポート
export {
	generateAnnouncementBody,
	loadCommandConfigs,
	PINNED_THREAD_KEY,
	PINNED_THREAD_TITLE,
};
