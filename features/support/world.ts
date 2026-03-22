/**
 * Cucumber World クラス
 *
 * 各シナリオで共有される状態を保持する。
 * Beforeフックでリセットされ、シナリオ間の独立性を保証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §3 Cucumber World 設計
 */

import type { IWorldOptions } from "@cucumber/cucumber";
import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { Bot } from "../../src/lib/domain/models/bot";
import type { Post } from "../../src/lib/domain/models/post";
import type { Thread } from "../../src/lib/domain/models/thread";
import type { User } from "../../src/lib/domain/models/user";
import type {
	MypageInfo,
	PaginatedPostHistory,
} from "../../src/lib/services/mypage-service";

// ---------------------------------------------------------------------------
// モジュールロード時に実際の Date.now を保存する
// setCurrentTime によるスタブ化で _originalDateNow が汚染されることを防ぐ。
// See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
// ---------------------------------------------------------------------------

/**
 * モジュールロード時点での真の Date.now 関数。
 * setCurrentTime によるグローバルスタブ化の影響を受けない。
 * restoreDateNow() はこの値を使って Date.now を復元する。
 */
const _trueOriginalDateNow: () => number = Date.now.bind(Date);

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 名前付きユーザーのコンテキスト。
 * 複数ユーザーのシナリオ（"UserA", "UserB" 等）を管理するために使用する。
 *
 * See: docs/architecture/bdd_test_strategy.md §3 名前付きユーザーマップ
 */
export interface UserContext {
	userId: string;
	edgeToken: string;
	ipHash: string;
	isPremium: boolean;
	username: string | null;
}

/**
 * 最後の操作結果。
 * Then ステップでのアサーション対象。
 *
 * See: docs/architecture/bdd_test_strategy.md §3 最後の操作結果
 */
export type LastResult =
	| { type: "success"; data: unknown }
	| { type: "error"; message: string; code?: string }
	| { type: "authRequired"; code: string; edgeToken: string };

// ---------------------------------------------------------------------------
// BattleBoardWorld クラス
// ---------------------------------------------------------------------------

/**
 * BattleBoard BDD テスト用 World クラス。
 *
 * シナリオ全体で共有される状態を一元管理する。
 * 全プロパティは reset() により初期化される。
 *
 * See: features/*.feature
 * See: docs/architecture/bdd_test_strategy.md §3 Cucumber World 設計
 */
export class BattleBoardWorld extends World {
	// -------------------------------------------------------------------------
	// 現在のユーザー
	// See: docs/architecture/bdd_test_strategy.md §3 現在のユーザー
	// -------------------------------------------------------------------------

	/** 現在のユーザーID */
	currentUserId: string | null = null;

	/** 現在の edge-token */
	currentEdgeToken: string | null = null;

	/** 現在の IP ハッシュ（author_id_seed） */
	currentIpHash: string = "test-ip-hash-default";

	/** 現在のユーザーが有料ユーザーかどうか */
	currentIsPremium: boolean = false;

	/** 現在のユーザーのユーザーネーム */
	currentUsername: string | null = null;

	// -------------------------------------------------------------------------
	// 名前付きユーザーマップ
	// See: docs/architecture/bdd_test_strategy.md §3 名前付きユーザーマップ
	// -------------------------------------------------------------------------

	/**
	 * 名前でユーザーを識別するマップ（"UserA", "UserB" 等）。
	 * インセンティブシナリオで複数ユーザーの操作をシミュレートするために使用する。
	 */
	namedUsers: Map<string, UserContext> = new Map();

	// -------------------------------------------------------------------------
	// 現在のスレッド
	// See: docs/architecture/bdd_test_strategy.md §3 現在のスレッド
	// -------------------------------------------------------------------------

	/** 現在操作対象のスレッドID */
	currentThreadId: string | null = null;

	/** 現在操作対象のスレッドタイトル */
	currentThreadTitle: string | null = null;

	// -------------------------------------------------------------------------
	// 管理者コンテキスト
	// See: features/admin.feature
	// See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
	// -------------------------------------------------------------------------

	/** 現在の管理者ユーザーID（管理者ログイン済みの場合に設定） */
	currentAdminId: string | null = null;

	/** 現在のユーザーが管理者かどうか */
	isAdmin: boolean = false;

	/** 管理者セッショントークン（認証成功時に設定） */
	adminSessionToken: string | null = null;

	/** 最後に削除されたレス ID（Then ステップでの検証用） */
	lastDeletedPostId: string | null = null;

	/** 最後に削除されたレス番号（Then ステップでの検証用） */
	lastDeletedPostNumber: number | null = null;

	/** 最後に削除されたスレッド ID（Then ステップでの検証用） */
	lastDeletedThreadId: string | null = null;

	/** 最後に削除されたスレッドタイトル（Then ステップでの検証用） */
	lastDeletedThreadTitle: string | null = null;

	// -------------------------------------------------------------------------
	// 最後の操作結果
	// See: docs/architecture/bdd_test_strategy.md §3 最後の操作結果
	// -------------------------------------------------------------------------

	/** 最後の操作結果（Then ステップでアサーションに使用） */
	lastResult: LastResult | null = null;

	/** 最後に作成されたレス */
	lastCreatedPost: Post | null = null;

	/** 最後に作成されたスレッド */
	lastCreatedThread: Thread | null = null;

	// -------------------------------------------------------------------------
	// マイページコンテキスト
	// See: features/mypage.feature
	// See: features/currency.feature @マイページで通貨残高を確認する
	// -------------------------------------------------------------------------

	/**
	 * マイページ取得結果。
	 * getMypage の戻り値を保持し、Then ステップでのアサーションに使用する。
	 */
	mypageResult: MypageInfo | null = null;

	/**
	 * 書き込み履歴取得結果。
	 * getPostHistory の戻り値（PaginatedPostHistory）を保持し、Then ステップでのアサーションに使用する。
	 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
	 */
	postHistoryResult: PaginatedPostHistory | null = null;

	// -------------------------------------------------------------------------
	// ボットシステムコンテキスト
	// See: features/bot_system.feature
	// -------------------------------------------------------------------------

	/**
	 * 現在操作対象のボット。
	 * ボットシナリオで「ボット "荒らし役"」などのステップで設定される。
	 */
	currentBot: Bot | null = null;

	/**
	 * ボット名 -> Bot のマップ（複数ボットシナリオで使用）。
	 * See: features/bot_system.feature @荒らし役ボットは10体が並行して活動する
	 */
	botMap: Map<string, Bot> = new Map();

	/**
	 * postNumber -> postId のマッピング（ボット攻撃対象解決用）。
	 * See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
	 */
	botPostNumberToId: Map<number, string> = new Map();

	/**
	 * !attack コマンドの実行結果（最後の操作）のバッキングフィールド。
	 * 直接参照せず lastAttackResult getter を使用すること。
	 * See: features/bot_system.feature
	 */
	private _lastAttackResult: {
		success: boolean;
		systemMessage: string;
	} | null = null;

	/**
	 * !attack コマンドの実行結果（最後の操作）。
	 * Then ステップでのアサーション対象。
	 *
	 * 草コマンドとの統合: lastAttackResult が null の場合、lastGrassResult を返す。
	 * これにより、草コマンドが {string} を実行する (command_system.steps.ts) 経由で
	 * 実行された場合でも bot_system.steps.ts の Then ステップが正常に動作する。
	 *
	 * See: features/bot_system.feature
	 * See: features/reactions.feature
	 */
	get lastAttackResult(): { success: boolean; systemMessage: string } | null {
		return this._lastAttackResult ?? this.lastGrassResult;
	}

	set lastAttackResult(value: {
		success: boolean;
		systemMessage: string;
	} | null,) {
		this._lastAttackResult = value;
	}

	/**
	 * 攻撃者（複数ユーザーシナリオ用）。
	 * See: features/bot_system.feature @複数ユーザーがそれぞれ同一ボットを攻撃できる
	 */
	attackerUserIds: Map<string, string> = new Map();

	// -------------------------------------------------------------------------
	// 草（!w）コマンドコンテキスト
	// See: features/reactions.feature
	// -------------------------------------------------------------------------

	/**
	 * 草コマンド（!w）の最後の実行結果。
	 * Then ステップでのアサーション対象。
	 * See: features/reactions.feature §基本機能
	 */
	lastGrassResult: { success: boolean; systemMessage: string } | null = null;

	/**
	 * 名前付きユーザーの草カウント初期値マップ（"UserA" → 初期草カウント）。
	 * シナリオ内で草カウントの増加を検証する際の基準値として使用する。
	 * See: features/reactions.feature §重複制限
	 */
	grassCountBaseline: Map<string, number> = new Map();

	// -------------------------------------------------------------------------
	// !livingbot コマンドコンテキスト
	// See: features/command_livingbot.feature
	// -------------------------------------------------------------------------

	/**
	 * 複数スレッドからの !livingbot 実行結果を保持する（比較検証用）。
	 * See: features/command_livingbot.feature @どのスレッドから実行しても同じ結果が返る
	 */
	livingBotResults: string[] = [];

	/**
	 * ラストボットボーナスの lastBotBonusNotice を保持する。
	 * See: features/command_livingbot.feature @ラストボットボーナス
	 */
	lastBotBonusNotice: string | null = null;

	// -------------------------------------------------------------------------
	// 時刻制御
	// See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
	// -------------------------------------------------------------------------

	/**
	 * 現在の仮想時刻。
	 * null の場合は実際の Date.now() を使用する。
	 */
	currentTime: Date | null = null;

	/** 元の Date.now 関数（Afterフックで復元するために保存） */
	private _originalDateNow: () => number = Date.now;

	// -------------------------------------------------------------------------
	// コンストラクタ
	// -------------------------------------------------------------------------

	constructor(options: IWorldOptions) {
		super(options);
	}

	// -------------------------------------------------------------------------
	// 状態リセット
	// -------------------------------------------------------------------------

	/**
	 * 全状態を初期値にリセットする。
	 * Beforeフックから各シナリオ開始時に呼び出す。
	 */
	reset(): void {
		this.currentUserId = null;
		this.currentEdgeToken = null;
		this.currentIpHash = "test-ip-hash-default";
		this.currentIsPremium = false;
		this.currentUsername = null;
		this.namedUsers = new Map();
		this.currentThreadId = null;
		this.currentThreadTitle = null;
		this.lastResult = null;
		this.lastCreatedPost = null;
		this.lastCreatedThread = null;
		this.mypageResult = null;
		this.postHistoryResult = null;
		this.currentTime = null;
		// ボットシステムコンテキストのリセット
		// See: features/bot_system.feature
		this.currentBot = null;
		this.botMap = new Map();
		this.botPostNumberToId = new Map();
		this._lastAttackResult = null;
		this.attackerUserIds = new Map();
		// 草（!w）コマンドコンテキストのリセット
		// See: features/reactions.feature
		this.lastGrassResult = null;
		this.grassCountBaseline = new Map();
		// !livingbot コマンドコンテキストのリセット
		// See: features/command_livingbot.feature
		this.livingBotResults = [];
		this.lastBotBonusNotice = null;
		// 管理者コンテキストのリセット
		// See: features/admin.feature
		this.currentAdminId = null;
		this.isAdmin = false;
		this.adminSessionToken = null;
		this.lastDeletedPostId = null;
		this.lastDeletedPostNumber = null;
		this.lastDeletedThreadId = null;
		this.lastDeletedThreadTitle = null;
	}

	// -------------------------------------------------------------------------
	// 時刻制御メソッド
	// -------------------------------------------------------------------------

	/**
	 * Date.now をスタブ化して仮想時刻を設定する。
	 * 元の Date.now は Afterフックで復元される。
	 *
	 * See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
	 *
	 * @param time - スタブ化する時刻
	 */
	setCurrentTime(time: Date): void {
		this.currentTime = time;
		this._originalDateNow = Date.now;
		Date.now = () => time.getTime();
	}

	/**
	 * Date.now を元の実装に復元する。
	 * AfterフックおよびresetCurrentTime から呼び出す。
	 * _trueOriginalDateNow（モジュールロード時の真の Date.now）を使って復元するため、
	 * 前のシナリオのスタブ化の影響を受けない。
	 */
	restoreDateNow(): void {
		Date.now = _trueOriginalDateNow;
		this.currentTime = null;
	}

	/**
	 * 現在の仮想時刻を指定した分数進める。
	 *
	 * @param minutes - 進める分数
	 */
	advanceTimeByMinutes(minutes: number): void {
		const base = this.currentTime ?? new Date(Date.now());
		this.setCurrentTime(new Date(base.getTime() + minutes * 60 * 1000));
	}

	/**
	 * 現在の仮想時刻を指定した時間数進める。
	 *
	 * @param hours - 進める時間数
	 */
	advanceTimeByHours(hours: number): void {
		this.advanceTimeByMinutes(hours * 60);
	}

	/**
	 * 現在の仮想時刻を指定した日数進める。
	 *
	 * @param days - 進める日数
	 */
	advanceTimeByDays(days: number): void {
		this.advanceTimeByHours(days * 24);
	}

	// -------------------------------------------------------------------------
	// ユーザーコンテキストヘルパー
	// -------------------------------------------------------------------------

	/**
	 * 名前付きユーザーを登録する。
	 * 「ユーザー "UserA"」のようなステップで使用する。
	 *
	 * @param name - ユーザー名（"UserA" 等）
	 * @param context - ユーザーコンテキスト
	 */
	setNamedUser(name: string, context: UserContext): void {
		this.namedUsers.set(name, context);
	}

	/**
	 * 名前付きユーザーを取得する。
	 * 存在しない場合は null を返す。
	 *
	 * @param name - ユーザー名（"UserA" 等）
	 */
	getNamedUser(name: string): UserContext | null {
		return this.namedUsers.get(name) ?? null;
	}
}

// ---------------------------------------------------------------------------
// World の登録
// ---------------------------------------------------------------------------

setWorldConstructor(BattleBoardWorld);
