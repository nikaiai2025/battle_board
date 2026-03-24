/**
 * GitHub Workflow Trigger アダプタ
 *
 * GitHub REST API の workflow_dispatch イベントを発火する。
 * pending INSERT 直後に非同期コマンド処理を即時起動するために使用する。
 *
 * 環境変数:
 *   GITHUB_PAT          — GitHub Fine-Grained PAT（Actions: Read and Write 権限）
 *   GITHUB_REPOSITORY   — "owner/repo" 形式のリポジトリ識別子（未設定時はフォールバック値を使用）
 *
 * See: docs/architecture/architecture.md TDR-017
 * See: features/command_newspaper.feature
 */

// ---------------------------------------------------------------------------
// デフォルト定数
// ---------------------------------------------------------------------------

/** GITHUB_REPOSITORY 未設定時のフォールバックリポジトリ */
const DEFAULT_REPOSITORY = "nikaiai2025/battle_board";

/** GitHub REST API バージョンヘッダ値 */
const GITHUB_API_VERSION = "2022-11-28";

/** GitHub API ベース URL */
const GITHUB_API_BASE = "https://api.github.com";

// ---------------------------------------------------------------------------
// triggerWorkflow
// ---------------------------------------------------------------------------

/**
 * GitHub Actions の workflow_dispatch イベントを発火する。
 *
 * GITHUB_PAT が未設定の場合は warn ログを出力してスキップ（例外を投げない）。
 * これにより、開発・テスト環境でも GITHUB_PAT なしにアプリが正常動作する。
 *
 * リポジトリは GITHUB_REPOSITORY 環境変数から取得し、未設定時は
 * DEFAULT_REPOSITORY にフォールバックする。
 *
 * @param workflowFile - ディスパッチするワークフローファイル名（例: "newspaper-scheduler.yml"）
 * @throws GitHub API がエラーレスポンスを返した場合
 *
 * See: docs/architecture/architecture.md TDR-017
 */
export async function triggerWorkflow(workflowFile: string): Promise<void> {
	// GITHUB_PAT 未設定時はスキップ
	const pat = process.env.GITHUB_PAT;
	if (!pat) {
		console.warn(
			"[github-workflow-trigger] GITHUB_PAT is not set — skipping workflow_dispatch",
		);
		return;
	}

	// リポジトリ識別子を解決（環境変数 → フォールバック）
	const repository = process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
	const url = `${GITHUB_API_BASE}/repos/${repository}/actions/workflows/${workflowFile}/dispatches`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${pat}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": GITHUB_API_VERSION,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ ref: "main" }),
	});

	// 204 No Content が成功レスポンス。それ以外はエラー
	if (!response.ok) {
		const body = await response.text().catch(() => "(no body)");
		throw new Error(
			`[github-workflow-trigger] workflow_dispatch failed: HTTP ${response.status} — ${body}`,
		);
	}
}

// ---------------------------------------------------------------------------
// withWorkflowTrigger
// ---------------------------------------------------------------------------

/**
 * pending リポジトリの create メソッドにワークフロートリガーを付与するデコレータ。
 *
 * 元の repo.create() を呼んだ後、commandType が triggerableTypes に含まれていれば
 * triggerFn() を fire-and-forget（エラーはログ出力のみ）で呼ぶ。
 * create 以外のプロパティはそのまま委譲する（プロキシパターン）。
 *
 * fire-and-forget の設計根拠:
 *   - pending INSERT の成功とワークフロートリガーの成否は独立。
 *   - トリガー失敗時は pending が滞留するため、ログ監視で検知・対応する。
 *   - ユーザー体験への影響なし（INSERT が成功すればコマンドは受理済み）。
 *
 * @param repo             — ラップ対象の pending リポジトリ
 * @param triggerableTypes — トリガー対象の commandType 集合
 * @param triggerFn        — 発火する関数（本番: triggerWorkflow、テスト: モック）
 * @returns repo と同じ型のデコレートされたオブジェクト
 *
 * See: docs/architecture/architecture.md TDR-017
 */
export function withWorkflowTrigger<
	T extends {
		create(params: {
			commandType: string;
			[key: string]: unknown;
		}): Promise<void>;
	},
>(repo: T, triggerableTypes: Set<string>, triggerFn: () => Promise<void>): T {
	return new Proxy(repo, {
		get(target, prop, receiver) {
			// create メソッドのみインターセプト
			if (prop === "create") {
				return async (params: {
					commandType: string;
					[key: string]: unknown;
				}) => {
					// 元の create を実行（エラーはそのままバブルアップ）
					await target.create(params);

					// 対象 commandType の場合のみ fire-and-forget でトリガー
					if (triggerableTypes.has(params.commandType)) {
						triggerFn().catch((err: unknown) => {
							console.error(
								"[github-workflow-trigger] Failed to trigger workflow (fire-and-forget):",
								err,
							);
						});
					}
				};
			}

			// create 以外のプロパティはそのまま委譲
			return Reflect.get(target, prop, receiver);
		},
	});
}
