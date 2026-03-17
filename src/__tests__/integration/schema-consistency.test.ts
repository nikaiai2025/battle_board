/**
 * スキーマ整合性テスト
 *
 * TypeScript Row 型（DBレコード型）のフィールドが実 DB スキーマに存在することを検証する。
 * 本番障害（inline_system_info カラムのマイグレーション未作成）の再発防止策として実装。
 *
 * 動作概要:
 *   1. src/lib/infrastructure/repositories/ 配下の全 *-repository.ts を自動スキャン
 *   2. 各ファイルから正規表現で以下を抽出:
 *      - テーブル名: .from("table_name") パターン
 *      - Row 型フィールド: interface *Row { ... } ブロックからフィールド名（snake_case）
 *   3. Supabase Local の PostgREST OpenAPI エンドポイント（GET /rest/v1/）から
 *      テーブルのカラム定義を取得する
 *   4. 各テーブルについて Row 型の全フィールドが DB カラムに存在することをアサートする
 *
 * カラム取得の仕組み:
 *   PostgREST の OpenAPI 定義（/rest/v1/）には各テーブルの definitions が含まれており、
 *   そのプロパティ名が実 DB のカラム名に対応する。この定義は DB スキーマの変更時に
 *   PostgREST が自動更新するため、常に実 DB と同期している。
 *
 * 自己メンテナンス性:
 *   - テスト内にテーブル名やカラム名をハードコードしない
 *   - リポジトリファイルを自動スキャンするため、新しい Row 型やフィールドが追加されても
 *     テスト側の修正なしに自動検知する
 *
 * 実行方法:
 *   Supabase Local 起動状態で:
 *     npm run test:schema
 *
 * スキップ条件:
 *   - SUPABASE_URL が未設定の場合
 *   - SUPABASE_SERVICE_ROLE_KEY が未設定の場合
 *   - Supabase Local が起動していない場合（接続エラー）
 *   上記いずれかの場合は全テストをスキップする（通常の npx vitest run を壊さない）。
 *
 * See: docs/operations/incidents/2026-03-17_post_500_missing_migrations.md
 * See: docs/architecture/bdd_test_strategy.md §7-8 テストピラミッド・統合テスト方針
 * See: features/support/integration-hooks.ts（Supabase 接続パターン）
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// 環境変数ロード
// ---------------------------------------------------------------------------

// .env.local から環境変数を読み込む（vitest は自動ロードしないため明示的に実行）
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** スキャン対象のリポジトリディレクトリ */
const REPOSITORIES_DIR = path.resolve(
	process.cwd(),
	"src/lib/infrastructure/repositories",
);

// ---------------------------------------------------------------------------
// ヘルパー型
// ---------------------------------------------------------------------------

/**
 * リポジトリファイルから抽出したスキーマ情報
 */
interface RepositorySchemaInfo {
	/** リポジトリファイル名（例: post-repository.ts） */
	fileName: string;
	/** テーブル名（例: posts） */
	tableName: string;
	/** Row 型名（例: PostRow） */
	rowTypeName: string;
	/** Row 型のフィールド名一覧（例: ['id', 'thread_id', 'body', ...]） */
	rowFields: string[];
}

// ---------------------------------------------------------------------------
// ファイルスキャン・抽出ロジック
// ---------------------------------------------------------------------------

/**
 * リポジトリファイルから .from("table_name") パターンでテーブル名を抽出する。
 * 複数のテーブル名が見つかった場合、最初のものを採用する（主テーブル）。
 *
 * @param content - ファイルの内容
 * @returns テーブル名、見つからない場合は null
 */
function extractTableName(content: string): string | null {
	// .from("table_name") または .from('table_name') パターンにマッチ
	const match = content.match(/\.from\(['"]([a-z_]+)['"]\)/);
	return match ? match[1] : null;
}

/**
 * リポジトリファイルから interface *Row { ... } ブロックを抽出し、
 * フィールド名（snake_case）一覧を返す。
 *
 * Row interface のフィールド名は `フィールド名: 型;` の単純な形式。
 * コメント行（// または * で始まる行）はスキップする。
 * オプショナルフィールド（`フィールド名?: 型;`）も対象とする。
 *
 * @param content - ファイルの内容
 * @returns { rowTypeName, fields } または null（Row 型が見つからない場合）
 */
function extractRowFields(
	content: string,
): { rowTypeName: string; fields: string[] } | null {
	// interface *Row { ... } ブロックを抽出（複数行対応）
	// Row という名前で終わる interface を対象とする
	const interfaceMatch = content.match(
		/interface\s+(\w+Row)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s,
	);
	if (!interfaceMatch) return null;

	const rowTypeName = interfaceMatch[1];
	const body = interfaceMatch[2];

	// ボディからフィールド名を抽出する
	// フォーマット: `  フィールド名?: 型;` または `  フィールド名: 型;`
	// コメント行（行頭の空白 + // または * で始まる）はスキップ
	const fields: string[] = [];
	const lines = body.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();

		// コメント行をスキップ
		if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed === "") {
			continue;
		}

		// フィールド定義行にマッチ: `identifier?: type;` または `identifier: type;`
		// snake_case フィールド名（a-z, 0-9, _ で構成）のみ対象
		const fieldMatch = trimmed.match(/^([a-z][a-z0-9_]*)\??:\s*.+;/);
		if (fieldMatch) {
			fields.push(fieldMatch[1]);
		}
	}

	if (fields.length === 0) return null;

	return { rowTypeName, fields };
}

/**
 * リポジトリディレクトリ内の全 *-repository.ts ファイルをスキャンし、
 * 各ファイルからスキーマ情報を抽出して返す。
 *
 * テーブル名または Row 型フィールドが抽出できないファイルはスキップする。
 *
 * @returns スキーマ情報の配列
 */
function scanRepositories(): RepositorySchemaInfo[] {
	const results: RepositorySchemaInfo[] = [];

	// ディレクトリ内の *-repository.ts ファイルを列挙
	const files = fs
		.readdirSync(REPOSITORIES_DIR)
		.filter((f) => f.endsWith("-repository.ts"));

	for (const fileName of files) {
		const filePath = path.join(REPOSITORIES_DIR, fileName);
		const content = fs.readFileSync(filePath, "utf-8");

		// テーブル名を抽出
		const tableName = extractTableName(content);
		if (!tableName) {
			// テーブル名が見つからないファイルはスキップ（Row 型なしのファイル等）
			continue;
		}

		// Row 型フィールドを抽出
		const rowInfo = extractRowFields(content);
		if (!rowInfo) {
			// Row interface が見つからないファイルはスキップ
			continue;
		}

		results.push({
			fileName,
			tableName,
			rowTypeName: rowInfo.rowTypeName,
			rowFields: rowInfo.fields,
		});
	}

	return results;
}

// ---------------------------------------------------------------------------
// PostgREST OpenAPI スキーマ取得
// ---------------------------------------------------------------------------

/**
 * PostgREST OpenAPI スキーマから全テーブルのカラム定義を取得する。
 *
 * PostgREST の GET /rest/v1/ エンドポイントは OpenAPI 2.0 (Swagger) 形式で
 * スキーマを公開している。definitions オブジェクトにテーブルのプロパティ（カラム名）が
 * 含まれており、これは実 DB スキーマと同期している。
 *
 * information_schema.columns への直接クエリは PostgREST のデフォルト設定では
 * public スキーマのみ公開するため使用できない。OpenAPI 定義の方が信頼性が高い。
 *
 * @param supabaseUrl - Supabase プロジェクトの URL
 * @param serviceRoleKey - service_role キー（認証用）
 * @returns テーブル名 → カラム名配列 のマップ、接続失敗時は null
 */
async function fetchTableColumnsFromOpenApi(
	supabaseUrl: string,
	serviceRoleKey: string,
): Promise<Map<string, string[]> | null> {
	let response: Response;

	try {
		response = await fetch(`${supabaseUrl}/rest/v1/`, {
			headers: {
				Authorization: `Bearer ${serviceRoleKey}`,
				apikey: serviceRoleKey,
			},
			// 接続タイムアウト: 5秒
			signal: AbortSignal.timeout(5000),
		});
	} catch {
		// 接続失敗（Supabase Local が未起動等）
		return null;
	}

	if (!response.ok) {
		return null;
	}

	// OpenAPI 2.0 (Swagger) 形式のレスポンス
	const schema = (await response.json()) as {
		definitions?: Record<
			string,
			{
				properties?: Record<string, unknown>;
			}
		>;
	};

	const tableColumnsMap = new Map<string, string[]>();

	if (!schema.definitions) {
		return tableColumnsMap;
	}

	// definitions の各エントリがテーブル（またはビュー）に対応する
	// プロパティ名がカラム名に対応する
	for (const [tableName, definition] of Object.entries(schema.definitions)) {
		if (definition.properties) {
			tableColumnsMap.set(tableName, Object.keys(definition.properties));
		}
	}

	return tableColumnsMap;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

// Supabase Local への接続に必要な環境変数が設定されているか確認する
// 未設定の場合はスキップ（通常の npx vitest run を壊さない）
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnvVars = Boolean(supabaseUrl && serviceRoleKey);

/**
 * スキーマ整合性テストスイート
 *
 * 以下のいずれかの場合は全テストをスキップする:
 *   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定の場合
 *   - Supabase Local が起動していない場合（接続エラー）
 *
 * Supabase Local 起動状態で npm run test:schema を実行すること。
 *
 * See: docs/operations/incidents/2026-03-17_post_500_missing_migrations.md
 */
// 環境変数が未設定の場合は即座にスキップする（接続試行なし）
const describeOrSkip = hasEnvVars ? describe : describe.skip;

describeOrSkip("スキーマ整合性テスト（Row型 vs 実DBスキーマ）", () => {
	let schemaInfoList: RepositorySchemaInfo[];
	// テーブル名 → カラム名配列 のマップ（PostgREST OpenAPI から取得）
	// Supabase Local に接続できない場合は null
	let tableColumnsMap: Map<string, string[]> | null = null;

	beforeAll(async () => {
		// リポジトリファイルをスキャン
		schemaInfoList = scanRepositories();

		// PostgREST OpenAPI スキーマからカラム定義を取得する
		// 接続失敗時（Supabase Local 未起動）は null が返り、各テストが skip になる
		tableColumnsMap = await fetchTableColumnsFromOpenApi(
			supabaseUrl!,
			serviceRoleKey!,
		);

		if (tableColumnsMap === null) {
			console.warn(
				"[schema-consistency] Supabase Local に接続できません。テストをスキップします。\n" +
					"npx supabase start でローカルサーバーを起動してから npm run test:schema を実行してください。",
			);
		}
	});

	it("リポジトリファイルが1件以上スキャンできること", () => {
		// リポジトリスキャンは Supabase Local 接続と無関係なため常に実行する
		expect(schemaInfoList.length).toBeGreaterThan(0);
	});

	it("スキャン結果の各エントリにテーブル名とフィールドが含まれること", () => {
		// リポジトリスキャンは Supabase Local 接続と無関係なため常に実行する
		for (const info of schemaInfoList) {
			expect(info.tableName, `${info.fileName}: テーブル名が空`).toBeTruthy();
			expect(
				info.rowFields.length,
				`${info.fileName} (${info.rowTypeName}): フィールドが0件`,
			).toBeGreaterThan(0);
		}
	});

	it("全 Row 型フィールドが対応する DB テーブルのカラムとして存在すること", () => {
		// Supabase Local に接続できていない場合はスキップ
		// （通常の npx vitest run ではスキップされる）
		if (tableColumnsMap === null) {
			return;
		}

		const failures: string[] = [];

		for (const info of schemaInfoList) {
			// OpenAPI スキーマからカラム一覧を取得
			const dbColumns = tableColumnsMap.get(info.tableName);

			if (!dbColumns || dbColumns.length === 0) {
				failures.push(
					`[${info.fileName}] テーブル "${info.tableName}" が DB（OpenAPI スキーマ）に存在しないか、` +
						`カラムが0件です。マイグレーションが適用されているか確認してください。`,
				);
				continue;
			}

			// Row 型の各フィールドが DB カラムに存在することを検証
			for (const field of info.rowFields) {
				if (!dbColumns.includes(field)) {
					failures.push(
						`[${info.fileName}] ${info.rowTypeName}.${field} は ` +
							`テーブル "${info.tableName}" に存在しないカラムです。` +
							`マイグレーション SQL を確認してください。` +
							` (既存カラム: ${dbColumns.join(", ")})`,
					);
				}
			}
		}

		// 失敗があれば全件まとめて報告する
		if (failures.length > 0) {
			throw new Error(
				`スキーマ不整合が ${failures.length} 件検出されました:\n\n` +
					failures.map((f, i) => `  ${i + 1}. ${f}`).join("\n\n"),
			);
		}
	});
});
