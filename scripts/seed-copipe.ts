/**
 * copipe_entries テーブルへの seed データ投入スクリプト
 *
 * 処理フロー:
 *   1. config/copipe-seed.txt を読み込む
 *   2. ====COPIPE:タイトル==== 区切りでパースし name + content のペアを抽出
 *   3. copipe_entries テーブルに INSERT ... ON CONFLICT (name) DO NOTHING で UPSERT
 *      （冪等: 既存 name はスキップ、新規のみ INSERT）
 *
 * 実行方法:
 *   npx tsx scripts/seed-copipe.ts
 *
 * 環境変数:
 *   SUPABASE_URL              — Supabase プロジェクトURL
 *   SUPABASE_SERVICE_ROLE_KEY — サービスロールキー（RLS バイパス用）
 *
 * See: features/command_copipe.feature
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CopipeEntry {
	name: string;
	content: string;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 区切り行のパターン: ====COPIPE:タイトル==== */
const DELIMITER = /^====COPIPE:(.+?)====$/;

/** 終端マーカー */
const END_MARKER = "====END====";

// ---------------------------------------------------------------------------
// パース処理
// ---------------------------------------------------------------------------

/**
 * copipe-seed.txt を読み込み、エントリ一覧を返す。
 * - ファイル先頭の ## コメント行はスキップ
 * - ====COPIPE:タイトル==== 区切りで本文を抽出
 * - 本文の前後空行はトリム、本文中の空行は保持
 * - ====END==== 以降は無視
 *
 * See: features/command_copipe.feature
 */
function parseCopipeSeed(filePath: string): CopipeEntry[] {
	const raw = fs.readFileSync(filePath, "utf-8");
	const lines = raw.split("\n");

	const entries: CopipeEntry[] = [];
	let currentName: string | null = null;
	let currentContentStart = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// ヘッダコメント（ファイル先頭の ## 行）をスキップ
		if (currentName === null && line.startsWith("##")) continue;

		// END マーカー: それ以降は処理しない
		if (line.trim() === END_MARKER) {
			if (currentName !== null) {
				const contentLines = lines.slice(currentContentStart, i);
				const content = contentLines.join("\n").trim();
				entries.push({ name: currentName, content });
				currentName = null;
			}
			break;
		}

		// 区切り行: 新しいエントリの開始
		const match = line.match(DELIMITER);
		if (match) {
			// 前のエントリを閉じる
			if (currentName !== null) {
				const contentLines = lines.slice(currentContentStart, i);
				const content = contentLines.join("\n").trim();
				entries.push({ name: currentName, content });
			}

			currentName = match[1].trim();
			currentContentStart = i + 1;
		}
	}

	return entries;
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

/**
 * copipe_entries テーブルに seed データを投入する。
 * INSERT ... ON CONFLICT (name) DO NOTHING で冪等性を保証。
 * スクリプトのメインエントリーポイント。
 */
async function main(): Promise<void> {
	// Supabase クライアントを動的インポート（スクリプト実行時のみ必要）
	// NOTE: このスクリプトは Node.js 環境で直接実行されるため dynamic import を使用する
	const { createClient } = await import("@supabase/supabase-js");

	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		throw new Error(
			"SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません",
		);
	}

	const supabase = createClient(supabaseUrl, supabaseServiceKey);

	// seed ファイルをパース
	const seedPath = path.resolve(process.cwd(), "config", "copipe-seed.txt");
	console.log(`[seed-copipe] seed ファイルを読み込み中: ${seedPath}`);
	const entries = parseCopipeSeed(seedPath);
	console.log(`[seed-copipe] パース完了: ${entries.length} 件のエントリ`);

	if (entries.length === 0) {
		console.log("[seed-copipe] 投入するエントリがありません。終了します");
		return;
	}

	// copipe_entries テーブルに INSERT ... ON CONFLICT (name) DO NOTHING で投入
	// ON CONFLICT DO NOTHING: 既存 name はスキップ、新規のみ INSERT（冪等）
	console.log("[seed-copipe] copipe_entries に投入中...");
	const { data, error } = await supabase
		.from("copipe_entries")
		.upsert(
			entries.map((e) => ({ name: e.name, content: e.content })),
			{ onConflict: "name", ignoreDuplicates: true },
		)
		.select("name");

	if (error) {
		throw new Error(`copipe_entries 投入エラー: ${error.message}`);
	}

	const insertedCount = data?.length ?? 0;
	const skippedCount = entries.length - insertedCount;

	console.log("[seed-copipe] 投入完了");
	console.log(`  新規 INSERT: ${insertedCount} 件`);
	console.log(`  スキップ（既存）: ${skippedCount} 件`);

	// 投入したエントリ名を表示
	for (const entry of entries) {
		const status = data?.some((d: { name: string }) => d.name === entry.name)
			? "INSERT"
			: "SKIP";
		console.log(`  [${status}] ${entry.name}`);
	}
}

// スクリプトとして直接実行された場合のみ main() を呼ぶ
if (process.argv[1] && process.argv[1].includes("seed-copipe")) {
	main().catch((err) => {
		console.error("[seed-copipe] エラー:", err);
		process.exit(1);
	});
}

// テスト用エクスポート
export { parseCopipeSeed };
