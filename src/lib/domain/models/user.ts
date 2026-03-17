/**
 * D-08 Domain Model: User（ユーザー）
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users
 * See: docs/requirements/ubiquitous_language.yaml #無料ユーザー #有料ユーザー
 * See: docs/architecture/components/user-registration.md §2 用語定義
 */

/** ユーザーエンティティ。無料ユーザー・有料ユーザーを表す。 */
export interface User {
	/** 内部識別子 (UUID) */
	id: string;
	/** 現在有効な edge-token（段階的廃止中。edge_tokens テーブルへ移行済み） */
	authToken: string;
	/** IP由来の seed（日次リセットID生成に使用） */
	authorIdSeed: string;
	/** 有料ユーザーフラグ */
	isPremium: boolean;
	/**
	 * edge-token の認証完了状態。
	 * 認証コード検証（/auth/verify）が成功した後に true に更新される。
	 * See: features/authentication.feature @認証フロー是正
	 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
	 */
	isVerified: boolean;
	/**
	 * ユーザーネーム（有料ユーザーのみ設定可、最大20文字）
	 * See: docs/requirements/ubiquitous_language.yaml #ユーザーネーム
	 */
	username: string | null;
	/** 連続書き込み日数（ストリーク）。See: D-02 #ストリーク */
	streakDays: number;
	/** 最終書き込み日（ストリーク計算用） */
	lastPostDate: string | null;
	/** 登録日時 */
	createdAt: Date;

	// ---------------------------------------------------------------------------
	// Phase 3: 本登録・PAT 関連フィールド（新設）
	// See: features/未実装/user_registration.feature
	// See: docs/architecture/components/user-registration.md §3.1 users テーブル拡張
	// ---------------------------------------------------------------------------

	/**
	 * Supabase Auth ユーザーID。
	 * 本登録完了時に設定される。NULL の場合は仮ユーザー。
	 * See: docs/architecture/components/user-registration.md §2 用語定義
	 */
	supabaseAuthId: string | null;

	/**
	 * 本登録方法。'email' | 'discord' のいずれか。
	 * 本登録未完了（仮ユーザー）の場合は NULL。
	 * See: docs/architecture/components/user-registration.md §5.1 本登録
	 */
	registrationType: "email" | "discord" | null;

	/**
	 * 本登録完了日時。
	 * 本登録未完了（仮ユーザー）の場合は NULL。
	 */
	registeredAt: Date | null;

	/**
	 * PAT（パーソナルアクセストークン）。32文字の hex 文字列。
	 * 本登録完了時に自動発行される。仮ユーザーは NULL。
	 * 専ブラのメール欄で #pat_<token> 形式で使用する。
	 * See: docs/architecture/components/user-registration.md §8 PAT方式の詳細
	 */
	patToken: string | null;

	/**
	 * PAT 最終使用日時。
	 * PAT で認証するたびに更新される。未使用の場合は NULL。
	 */
	patLastUsedAt: Date | null;

	// ---------------------------------------------------------------------------
	// Phase 4: 草コマンド(!w) 関連フィールド（新設）
	// See: features/reactions.feature
	// See: supabase/migrations/00008_grass_system.sql
	// ---------------------------------------------------------------------------

	/**
	 * 草カウント(通算)。
	 * 他ユーザーから !w コマンドで草を付与されるたびに +1 される。
	 * アイコン決定(getGrassIcon)とマイページ表示(mypage.feature)で参照される。
	 * See: features/reactions.feature §成長ビジュアル
	 */
	grassCount: number;

	// ---------------------------------------------------------------------------
	// Phase 5: BAN システム関連フィールド（新設）
	// See: features/admin.feature @ユーザーBAN / IP BAN
	// See: supabase/migrations/00010_ban_system.sql
	// ---------------------------------------------------------------------------

	/**
	 * ユーザーBAN フラグ。
	 * true の場合、そのアカウントからの書き込みを拒否する。
	 * See: features/admin.feature @管理者がユーザーをBANする
	 * See: tmp/feature_plan_admin_expansion.md §2-a BAN の二層構造
	 */
	isBanned: boolean;

	/**
	 * 最終アクセスIPハッシュ。
	 * 書き込みリクエストのたびに hashIp(reduceIp(現在のIP)) で更新される。
	 * 管理者が「このIPをBAN」する際の最新IP特定に使用する。
	 * author_id_seed は登録時固定のため別途このフィールドが必要。
	 * See: features/admin.feature @管理者がユーザーのIPをBANする
	 * See: tmp/feature_plan_admin_expansion.md §2-d IP BAN 対象の特定方法
	 */
	lastIpHash: string | null;
}
