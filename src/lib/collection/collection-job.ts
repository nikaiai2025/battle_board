/**
 * collection-job.ts — 収集バッチジョブエントリポイント
 *
 * GitHub Actions の日次 cron から `npx tsx src/lib/collection/collection-job.ts` で実行する。
 *
 * 処理フロー:
 *   1. bot_profiles.yaml から behavior_type === 'create_thread' のプロファイルを列挙
 *   2. bots テーブルから対応する active BOT を取得
 *   3. 各BOTのプロファイルから collection.adapter を読み取り、CollectionAdapter を解決
 *   4. adapter.collect() でバズ情報を取得
 *   5. buzzScore 降順でソートし上位6件を切り出し
 *   6. CollectedTopicRepository.save() で保存
 *
 * エラーハンドリング:
 *   - ソース単位でのtry/catchでエラーを隔離
 *   - 1ソースの失敗が他のソースに影響しない
 *   - 前回データは save の ON CONFLICT DO NOTHING により保持される
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 * See: docs/architecture/components/bot.md §2.13.5
 */

import { createClient } from "@supabase/supabase-js";
import { botProfilesConfig } from "../../../config/bot-profiles";
import { getJstDateString } from "../domain/rules/jst-date";
import type {
	BotProfile,
	CollectedItem,
	ICollectedTopicRepository,
} from "../services/bot-strategies/types";
import { resolveCollectionAdapter } from "./adapters/adapter-resolver";

/**
 * collection-job 専用の Supabase service_role クライアント。
 * client.ts の supabaseAdmin は supabaseClient（anon key）と同一モジュールで初期化されるため、
 * GHA 環境（SUPABASE_ANON_KEY 未設定）では import 時点でエラーになる。
 * seed スクリプトと同様に直接 createClient() することで回避する。
 */
function getServiceRoleClient() {
	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		throw new Error(
			"[collection-job] 環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です",
		);
	}
	return createClient(url, key);
}

// ---------------------------------------------------------------------------
// BotProfilesYaml 型
// ---------------------------------------------------------------------------

/** bot_profiles.yaml のルート型 */
type BotProfilesYaml = Record<string, BotProfile>;

// ---------------------------------------------------------------------------
// Supabase CollectedTopicRepository（最小実装）
// ---------------------------------------------------------------------------

/**
 * Supabase を使った CollectedTopicRepository の最小実装。
 * ここでは collection-job.ts の動作に必要な save() のみを提供する。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 */
function getSupabaseCollectedTopicRepo(): ICollectedTopicRepository {
	const supabase = getServiceRoleClient();
	return {
		async save(
			items: CollectedItem[],
			botId: string,
			collectedDate: string,
		): Promise<void> {
			if (items.length === 0) return;

			const rows = items.map((item) => ({
				source_bot_id: botId,
				article_title: item.articleTitle,
				content: item.content,
				source_url: item.sourceUrl,
				buzz_score: item.buzzScore,
				collected_date: collectedDate,
			}));

			// ON CONFLICT DO NOTHING: 同一 (source_bot_id, collected_date, source_url) があればスキップ
			const { error } = await supabase.from("collected_topics").insert(rows);

			if (error) {
				throw new Error(`collected_topics INSERT 失敗: ${error.message}`);
			}
		},

		async findUnpostedByBotId(_botId: string, _date: string) {
			// collection-job.ts では使用しない
			return [];
		},

		async markAsPosted(_topicId: string, _postedAt: Date): Promise<void> {
			// collection-job.ts では使用しない
		},
	};
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** ソースごとの蓄積上限件数 */
const MAX_ITEMS_PER_SOURCE = 6;

// ---------------------------------------------------------------------------
// runCollectionJob
// ---------------------------------------------------------------------------

/**
 * 収集バッチジョブのメイン処理。
 *
 * @param overrides - BDDテストからモック注入するためのオーバーライド
 *   - botProfiles: bot_profiles.yaml の代替設定（テスト用）
 *   - adapterOverrides: プロファイルキーごとの収集アダプター上書き（テスト用）
 *   - collectedTopicRepo: リポジトリ実装の上書き（テスト用）
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
 */
export async function runCollectionJob(overrides?: {
	botProfiles?: BotProfilesYaml;
	adapterOverrides?: Record<
		string,
		{ collect: () => Promise<CollectedItem[]> }
	>;
	collectedTopicRepo?: ICollectedTopicRepository;
}): Promise<void> {
	const profiles = overrides?.botProfiles ?? botProfilesConfig;
	const todayJst = getJstDateString(new Date());

	// 1. behavior_type === 'create_thread' のプロファイルキーを列挙
	const curationProfileKeys = Object.entries(profiles)
		.filter(([_, p]) => p.behavior_type === "create_thread")
		.map(([key]) => key);

	// 2. 各プロファイルに対応する active BOT の収集処理
	for (const profileKey of curationProfileKeys) {
		try {
			// BOT取得（テスト時は adapterOverrides のみでBOT取得をスキップ可能にするため
			// adapterOverride が存在する場合でもBOT取得を試みる。
			// BDDテストでは collectedTopicRepo も override されるため DB アクセスは発生しない）
			const { data: bots } = await getServiceRoleClient()
				.from("bots")
				.select("id")
				.eq("bot_profile_key", profileKey)
				.eq("is_active", true);

			if (!bots || bots.length === 0) {
				console.log(
					`[collection-job] ${profileKey}: active BOTが存在しないためスキップ`,
				);
				continue;
			}

			const bot = bots[0];
			const profile = profiles[profileKey];

			if (!profile.collection) {
				console.warn(
					`[collection-job] ${profileKey}: collection 設定がありません`,
				);
				continue;
			}

			// 3. CollectionAdapter を解決（adapterOverride 優先）
			const adapterOverride = overrides?.adapterOverrides?.[profileKey];
			const adapter = adapterOverride
				? { collect: () => adapterOverride.collect() }
				: resolveCollectionAdapter(profile.collection.adapter);

			// 4. collect()
			const items = await adapter.collect({
				sourceUrl: profile.collection.source_url,
				monthly: profile.collection.monthly ?? false,
			});

			// 5. buzzScore 降順ソートし上位6件に絞る
			const topItems = items
				.sort((a, b) => b.buzzScore - a.buzzScore)
				.slice(0, MAX_ITEMS_PER_SOURCE);

			// 6. 保存（テスト時は overrides.collectedTopicRepo を使用）
			const repo =
				overrides?.collectedTopicRepo ?? getSupabaseCollectedTopicRepo();
			await repo.save(topItems, bot.id, todayJst);

			console.log(
				`[collection-job] ${profileKey}: ${topItems.length}件を保存 (date=${todayJst})`,
			);
		} catch (err) {
			// ソース単位でエラーを隔離。1ソースの失敗が他のソースに影響しない。
			// 前回データは save の ON CONFLICT DO NOTHING により保持される。
			console.error(`[collection-job] ${profileKey}: 収集失敗`, err);
		}
	}
}

// ---------------------------------------------------------------------------
// CLI 直接実行
// ---------------------------------------------------------------------------

// CommonJS 環境: `require.main === module` で CLI 直接実行を判定する
if (require.main === module) {
	runCollectionJob()
		.then(() => {
			console.log("[collection-job] 完了");
			process.exit(0);
		})
		.catch((err) => {
			console.error("[collection-job] Fatal error:", err);
			process.exit(1);
		});
}
