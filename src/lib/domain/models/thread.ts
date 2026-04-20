/**
 * D-08 Domain Model: Thread（スレッド）
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > threads
 * See: docs/requirements/ubiquitous_language.yaml #スレッド
 */

/** スレッドエンティティ。スレッドタイトルと書き込みの集合体を表す。 */
export interface Thread {
	/** 内部識別子 (UUID) */
	id: string;
	/** 10桁UNIXタイムスタンプ（専ブラ用キー） */
	threadKey: string;
	/** 板ID（例: 'battleboard'） */
	boardId: string;
	/** スレッドタイトル（最大96文字） */
	title: string;
	/** レス数（キャッシュ。postsの実数と同期） */
	postCount: number;
	/** Shift_JIS変換後の累積バイト数（Range差分応答用） */
	datByteSize: number;
	/** スレッド作成者の user_id。BOT作成スレッドの場合は null */
	createdBy: string | null;
	/** 作成日時 */
	createdAt: Date;
	/** 最終書き込み日時（ソート用） */
	lastPostAt: Date;
	/** 管理者削除フラグ */
	isDeleted: boolean;
	/**
	 * 固定スレッドフラグ。true の場合は一般ユーザーの書き込みを禁止する。
	 * See: features/thread.feature @pinned_thread
	 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §2-e
	 */
	isPinned: boolean;
	/**
	 * 休眠フラグ。true の場合はスレッド一覧（subject.txt / Web UI）に表示されない。
	 * アクティブスレッド数が上限（50件）を超えた場合に書き込み時の同期処理で設定される。
	 * 休眠スレッドは dat/ や bbs.cgi からの閲覧・書き込みは引き続き可能（dat落ちではない）。
	 * See: features/thread.feature @スレッド一覧には最新50件のみ表示される
	 * See: docs/specs/thread_state_transitions.yaml #states.unlisted
	 * See: docs/architecture/architecture.md TDR-012
	 */
	isDormant: boolean;
}

/** スレッド一覧プレビュー用の簡略レス情報 */
export interface ThreadPreviewPost {
	/** レス番号 */
	postNumber: number;
	/** 表示名 */
	displayName: string;
	/** 本文 */
	body: string;
	/** 作成日時 */
	createdAt: Date;
	/** 削除済みフラグ */
	isDeleted: boolean;
	/** システムメッセージフラグ */
	isSystemMessage: boolean;
}

/** スレッド一覧プレビュー付きのスレッド */
export interface ThreadWithPreview extends Thread {
	previewPosts: ThreadPreviewPost[];
}

/** スレッド作成時の入力型 */
export interface ThreadInput {
	/** 板ID */
	boardId: string;
	/** スレッドタイトル（最大96文字） */
	title: string;
	/** 1レス目の本文 */
	firstPostBody: string;
}
