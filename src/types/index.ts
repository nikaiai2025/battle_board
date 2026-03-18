/**
 * 共有型定義（経路横断型）
 * See: docs/architecture/components/posting.md §2 公開インターフェース
 * See: docs/architecture/architecture.md §3.4 2経路の統一処理フロー
 */

// ---------------------------------------------------------------------------
// API 共通レスポンス型
// ---------------------------------------------------------------------------

/**
 * APIレスポンスの共通ラッパー型。
 * 全ての Web API レスポンスはこの型に統一する。
 */
export interface ApiResponse<T> {
	/** 処理成功フラグ */
	success: boolean;
	/** レスポンスデータ（成功時のみ） */
	data?: T;
	/** エラー情報（失敗時のみ） */
	error?: ApiError;
}

/**
 * APIエラー情報型。
 * See: docs/specs/openapi.yaml（エラーレスポンス定義）
 */
export interface ApiError {
	/** エラーコード（機械可読な識別子） */
	code: string;
	/** エラーメッセージ（人間可読な説明） */
	message: string;
	/** 追加の詳細情報（省略可） */
	details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 書き込み（PostService 入出力型）
// ---------------------------------------------------------------------------

/**
 * 書き込み入力型。
 * Web API・専ブラ互換Adapter 両経路が共通して渡す正規化済み構造体。
 * See: docs/architecture/components/posting.md §2.1
 */
export interface PostInput {
	/** 書き込み先スレッドID (UUID) */
	threadId: string;
	/** 本文（UTF-8済み） */
	body: string;
	/** edge-token（未認証時は null → 認証フロー起動） */
	edgeToken: string | null;
	/** 発行時IPのSHA-512ハッシュ */
	ipHash: string;
	/** 表示名（省略時は「名無しさん」） */
	displayName?: string;
	/** メールアドレス（省略時は空文字） */
	email?: string;
	/** BotServiceからの呼び出し時 true（認証スキップ用） */
	isBotWrite: boolean;
}

/**
 * 書き込み結果型。
 * See: docs/architecture/components/posting.md §2.2
 */
export interface PostResult {
	/** 書き込まれたレスID (UUID) */
	postId: string;
	/** スレッド内レス番号 */
	postNumber: number;
	/** 同一トランザクションで挿入されたシステムメッセージ一覧 */
	systemMessages: { postId: string; body: string }[];
	/**
	 * 認証が必要な場合のみ設定（edgeToken が null だった場合）。
	 * 呼び出し元はこの情報を元にユーザーへ認証フローを案内する。
	 */
	authRequired?: {
		/** 発行された6桁認証コード */
		code: string;
		/** 発行された edge-token */
		token: string;
	};
}

// ---------------------------------------------------------------------------
// スレッド作成入力型
// ---------------------------------------------------------------------------
// ThreadInput はデッドコードのため削除。
// 正本は src/lib/domain/models/thread.ts の ThreadInput を参照。
// See: tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md §3.3
