"use client";

/**
 * マイページ — /mypage
 *
 * See: features/mypage.feature
 * See: features/currency.feature @マイページで通貨残高を確認する
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 * See: features/user_registration.feature @マイページでPATを確認できる
 * See: features/user_registration.feature @仮ユーザーには PAT が表示されない
 * See: features/user_registration.feature @仮ユーザーは課金できない
 * See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
 * See: docs/specs/screens/mypage.yaml @SCR-003（予定）
 * See: docs/architecture/components/web-ui.md §3 コンポーネント境界
 * See: docs/architecture/components/user-registration.md §8.2 マイページ表示
 *
 * 提供機能:
 *   - 通貨残高表示（currency-balance）
 *   - アカウント情報（アカウント種別・認証方法・有料/無料ステータス）
 *   - 本登録セクション（仮ユーザーのみ）: メール登録ボタン + Discord登録ボタン
 *   - PAT表示セクション（本登録ユーザーのみ）: PAT文字列 + コピーボタン + 使い方説明 + 再発行ボタン + 最終使用日時
 *   - ユーザーネーム設定フォーム（有料ユーザーのみ）
 *   - 課金ボタン（本登録済み無料ユーザーのみ有効）
 *   - 書き込み履歴
 *   - 通知欄（Phase 2 プレースホルダー）
 */

import { useCallback, useEffect, useState } from "react";
import {
	buildPatCopyValue,
	canUpgrade,
	formatPatLastUsedAt,
	getAccountTypeLabel,
	getRegistrationMethodLabel,
	isPermanentUser,
	isTemporaryUser,
} from "@/lib/domain/rules/mypage-display-rules";
import type { MypageInfo } from "@/lib/services/mypage-service";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface PostHistoryItem {
	id: string;
	threadId: string;
	postNumber: number;
	body: string;
	createdAt: string;
}

// ---------------------------------------------------------------------------
// マイページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * マイページ（Client Component）
 *
 * See: features/mypage.feature @マイページに基本情報が表示される
 * See: features/mypage.feature @通知欄が存在する
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 */
export default function MypagePage() {
	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	const [mypageInfo, setMypageInfo] = useState<MypageInfo | null>(null);
	const [posts, setPosts] = useState<PostHistoryItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// ユーザーネーム設定フォームの状態
	const [usernameInput, setUsernameInput] = useState("");
	const [usernameError, setUsernameError] = useState<string | null>(null);
	const [usernameSuccess, setUsernameSuccess] = useState(false);
	const [isSubmittingUsername, setIsSubmittingUsername] = useState(false);

	// 課金ボタンの状態
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [upgradeError, setUpgradeError] = useState<string | null>(null);

	// PAT セクションの状態
	const [isRegeneratingPat, setIsRegeneratingPat] = useState(false);
	const [patCopied, setPatCopied] = useState(false);

	// ---------------------------------------------------------------------------
	// データ取得
	// ---------------------------------------------------------------------------

	/**
	 * マイページ基本情報を取得する。
	 * See: features/mypage.feature @マイページに基本情報が表示される
	 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
	 */
	const fetchMypageInfo = useCallback(async () => {
		try {
			const res = await fetch("/api/mypage", { cache: "no-store" });

			if (res.status === 401) {
				setError("ログインが必要です。");
				return;
			}

			if (!res.ok) {
				setError("マイページ情報の取得に失敗しました。");
				return;
			}

			const data = (await res.json()) as MypageInfo;
			setMypageInfo(data);
			setUsernameInput(data.username ?? "");
		} catch {
			setError("ネットワークエラーが発生しました。");
		}
	}, []);

	/**
	 * 書き込み履歴を取得する。
	 * See: features/mypage.feature @自分の書き込み履歴を確認できる
	 */
	const fetchPostHistory = useCallback(async () => {
		try {
			const res = await fetch("/api/mypage/history", { cache: "no-store" });

			if (!res.ok) return;

			const data = (await res.json()) as { posts: PostHistoryItem[] };
			setPosts(data.posts);
		} catch {
			// 書き込み履歴取得失敗はサイレントに処理する
		}
	}, []);

	useEffect(() => {
		const init = async () => {
			setIsLoading(true);
			await Promise.all([fetchMypageInfo(), fetchPostHistory()]);
			setIsLoading(false);
		};
		void init();
	}, [fetchMypageInfo, fetchPostHistory]);

	// ---------------------------------------------------------------------------
	// イベントハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * ユーザーネームを設定する。
	 * See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
	 */
	const handleSetUsername = async (e: React.FormEvent) => {
		e.preventDefault();
		setUsernameError(null);
		setUsernameSuccess(false);
		setIsSubmittingUsername(true);

		try {
			const res = await fetch("/api/mypage/username", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username: usernameInput }),
			});

			const data = (await res.json()) as {
				username?: string;
				message?: string;
			};

			if (!res.ok) {
				setUsernameError(data.message ?? "設定に失敗しました。");
				return;
			}

			// 成功: ローカル状態を更新する
			setMypageInfo((prev) =>
				prev ? { ...prev, username: data.username ?? usernameInput } : prev,
			);
			setUsernameSuccess(true);
		} catch {
			setUsernameError("ネットワークエラーが発生しました。");
		} finally {
			setIsSubmittingUsername(false);
		}
	};

	/**
	 * 課金（有料ステータス切替モック）を実行する。
	 * 本登録済みユーザーのみ有効（仮ユーザーはボタンが無効化されているため呼ばれない）。
	 *
	 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
	 * See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
	 */
	const handleUpgrade = async () => {
		setUpgradeError(null);
		setIsUpgrading(true);

		try {
			const res = await fetch("/api/mypage/upgrade", { method: "POST" });
			const data = (await res.json()) as {
				isPremium?: boolean;
				message?: string;
			};

			if (!res.ok) {
				setUpgradeError(data.message ?? "課金処理に失敗しました。");
				return;
			}

			// 成功: 有料ユーザーステータスに切替
			setMypageInfo((prev) => (prev ? { ...prev, isPremium: true } : prev));
		} catch {
			setUpgradeError("ネットワークエラーが発生しました。");
		} finally {
			setIsUpgrading(false);
		}
	};

	/**
	 * PAT をクリップボードにコピーする。
	 * コピー対象は "#pat_<token>" 形式の文字列。
	 *
	 * See: features/user_registration.feature @マイページでPATを確認できる
	 * See: docs/architecture/components/user-registration.md §8.2 マイページ表示
	 */
	const handleCopyPat = async () => {
		if (!mypageInfo?.patToken) return;
		const copyValue = buildPatCopyValue(mypageInfo.patToken);
		if (!copyValue) return;
		try {
			await navigator.clipboard.writeText(copyValue);
			setPatCopied(true);
			// 2秒後にコピー完了フラグをリセット
			setTimeout(() => setPatCopied(false), 2000);
		} catch {
			// クリップボードアクセス失敗はサイレントに処理する
		}
	};

	/**
	 * PAT を再発行する。
	 * POST /api/auth/pat を呼び出し、新しい PAT をローカル状態に反映する。
	 *
	 * See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
	 * See: docs/architecture/components/user-registration.md §5.4 PAT管理 > regeneratePat
	 */
	const handleRegeneratePat = async () => {
		setIsRegeneratingPat(true);

		try {
			const res = await fetch("/api/auth/pat", { method: "POST" });
			const data = (await res.json()) as { patToken?: string; error?: string };

			if (!res.ok) {
				// エラー時はサイレントに処理（UIの状態は変化しない）
				return;
			}

			if (data.patToken) {
				// 成功: ローカル状態の PAT を更新する
				setMypageInfo((prev) =>
					prev
						? { ...prev, patToken: data.patToken ?? null, patLastUsedAt: null }
						: prev,
				);
			}
		} catch {
			// ネットワークエラーはサイレントに処理する
		} finally {
			setIsRegeneratingPat(false);
		}
	};

	// ---------------------------------------------------------------------------
	// ローディング・エラー表示
	// ---------------------------------------------------------------------------

	if (isLoading) {
		return (
			<main className="max-w-2xl mx-auto px-4 py-8">
				<p className="text-gray-500 text-sm">読み込み中...</p>
			</main>
		);
	}

	if (error) {
		return (
			<main className="max-w-2xl mx-auto px-4 py-8">
				<p id="mypage-error" className="text-red-600 text-sm">
					{error}
				</p>
			</main>
		);
	}

	if (!mypageInfo) {
		return (
			<main className="max-w-2xl mx-auto px-4 py-8">
				<p className="text-gray-500 text-sm">
					マイページ情報を取得できませんでした。
				</p>
			</main>
		);
	}

	// ---------------------------------------------------------------------------
	// 表示ロジック（純粋関数から算出）
	// ---------------------------------------------------------------------------

	const accountTypeLabel = getAccountTypeLabel(mypageInfo);
	const registrationMethodLabel = getRegistrationMethodLabel(mypageInfo);
	const patCopyValue = buildPatCopyValue(mypageInfo.patToken);
	const patLastUsedLabel = formatPatLastUsedAt(mypageInfo.patLastUsedAt);
	const upgradeEnabled = canUpgrade(mypageInfo);

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<main id="mypage" className="max-w-2xl mx-auto px-4 py-8 space-y-6">
			{/* ページタイトル */}
			<h1 className="text-xl font-bold text-gray-800">マイページ</h1>

			{/* =============================
          アカウント情報セクション
          See: features/mypage.feature @マイページに基本情報が表示される
          See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
          See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
          ============================= */}
			<section
				id="account-info"
				className="bg-white border border-gray-300 rounded p-4 space-y-2"
			>
				<h2 className="text-base font-bold text-gray-700">アカウント情報</h2>

				{/* アカウント種別（仮ユーザー / 本登録ユーザー）
            See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される */}
				<div className="text-sm text-gray-600">
					<span className="font-medium">アカウント種別: </span>
					{/* account-type-badge: 仮ユーザー/本登録ユーザー表示
              See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される */}
					<span
						data-testid="account-type-badge"
						className={
							isTemporaryUser(mypageInfo)
								? "inline-block px-2 py-0.5 bg-gray-200 text-gray-600 text-xs font-bold rounded"
								: "inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded"
						}
					>
						{accountTypeLabel}
					</span>
				</div>

				{/* 認証方法（本登録ユーザーのみ表示）
            See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される */}
				{registrationMethodLabel !== null && (
					<div className="text-sm text-gray-600">
						<span className="font-medium">認証方法: </span>
						<span data-testid="registration-method">
							{registrationMethodLabel}
						</span>
					</div>
				)}

				{/* 有料/無料ステータス表示
            See: features/mypage.feature @マイページに基本情報が表示される */}
				<div className="text-sm text-gray-600">
					<span className="font-medium">プラン: </span>
					<span
						id="premium-badge"
						className={
							mypageInfo.isPremium
								? "inline-block px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded"
								: "inline-block px-2 py-0.5 bg-gray-200 text-gray-600 text-xs font-bold rounded"
						}
					>
						{mypageInfo.isPremium ? "有料ユーザー" : "無料ユーザー"}
					</span>
				</div>

				{/* 連続書き込み日数 */}
				<div className="text-sm text-gray-600">
					<span className="font-medium">連続書き込み: </span>
					{mypageInfo.streakDays}日
				</div>
			</section>

			{/* =============================
          本登録セクション（仮ユーザーのみ表示）
          See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
          See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
          ============================= */}
			{isTemporaryUser(mypageInfo) && (
				<section
					data-testid="registration-section"
					className="bg-blue-50 border border-blue-200 rounded p-4 space-y-3"
				>
					<h2 className="text-base font-bold text-blue-800">本登録</h2>
					<p className="text-sm text-blue-700">
						メールアドレスまたは Discord アカウントで本登録すると、Cookie
						喪失・端末変更時でも同一ユーザーとして復帰できます。
					</p>
					<div className="flex flex-wrap gap-2">
						{/* メール認証ボタン
                See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する */}
						<a
							data-testid="register-email-button"
							href="/register/email"
							className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
						>
							メールアドレスで本登録
						</a>
						{/* Discord 登録ボタン
                See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する */}
						<a
							data-testid="register-discord-button"
							href="/register/discord"
							className="inline-block px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
						>
							Discord で本登録
						</a>
					</div>
				</section>
			)}

			{/* =============================
          PAT（専ブラ連携トークン）セクション（本登録ユーザーのみ表示）
          See: features/user_registration.feature @マイページでPATを確認できる
          See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
          See: docs/architecture/components/user-registration.md §8.2 マイページ表示
          ============================= */}
			{isPermanentUser(mypageInfo) && (
				<section
					data-testid="pat-section"
					className="bg-white border border-gray-300 rounded p-4 space-y-3"
				>
					<h2 className="text-base font-bold text-gray-700">
						専ブラ連携トークン（PAT）
					</h2>

					{/* PAT 表示
              See: features/user_registration.feature @マイページでPATを確認できる */}
					<div
						data-testid="pat-display"
						className="bg-gray-50 border border-gray-200 rounded px-3 py-2 font-mono text-sm break-all"
					>
						{mypageInfo.patToken}
					</div>

					{/* コピー用文字列（#pat_ プレフィックス付き）
              See: docs/architecture/components/user-registration.md §8.2 マイページ表示
              See: docs/architecture/components/user-registration.md §6 認証判定フロー */}
					<div className="text-xs text-gray-500">
						専ブラのメール欄に以下を設定：
					</div>
					<div
						data-testid="pat-copy-value"
						className="bg-gray-50 border border-gray-200 rounded px-3 py-2 font-mono text-sm break-all text-green-800"
					>
						{patCopyValue}
					</div>

					{/* コピーボタン */}
					<button
						data-testid="pat-copy-button"
						type="button"
						onClick={() => {
							void handleCopyPat();
						}}
						className="px-3 py-1.5 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
					>
						{patCopied ? "コピーしました" : "コピー"}
					</button>

					{/* PAT 最終使用日時
              See: features/user_registration.feature @マイページでPATを確認できる */}
					<div data-testid="pat-last-used" className="text-xs text-gray-500">
						最終使用: {patLastUsedLabel}
					</div>

					{/* PAT 再発行ボタン
              See: features/user_registration.feature @PATを再発行すると旧PATが無効になる */}
					<button
						data-testid="pat-regenerate-button"
						type="button"
						onClick={() => {
							void handleRegeneratePat();
						}}
						disabled={isRegeneratingPat}
						className="px-4 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
					>
						{isRegeneratingPat
							? "再発行中..."
							: "再発行（現在のトークンは無効になります）"}
					</button>
				</section>
			)}

			{/* =============================
          通貨残高セクション
          See: features/mypage.feature @通貨残高が表示される
          See: features/currency.feature @マイページで通貨残高を確認する
          ============================= */}
			<section
				id="currency-section"
				className="bg-white border border-gray-300 rounded p-4"
			>
				<h2 className="text-base font-bold text-gray-700 mb-2">通貨残高</h2>
				{/* currency-balance: 通貨残高の表示要素
            See: features/currency.feature @マイページで通貨残高を確認する */}
				<p id="currency-balance" className="text-2xl font-bold text-yellow-600">
					{mypageInfo.balance} BT
				</p>
			</section>

			{/* =============================
          ユーザーネーム設定セクション
          See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
          See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
          ============================= */}
			<section
				id="username-section"
				className="bg-white border border-gray-300 rounded p-4 space-y-3"
			>
				<h2 className="text-base font-bold text-gray-700">
					ユーザーネーム設定
				</h2>

				{mypageInfo.isPremium ? (
					/* 有料ユーザー: ユーザーネーム設定フォーム */
					<form
						onSubmit={(e) => {
							void handleSetUsername(e);
						}}
						className="space-y-2"
					>
						<input
							id="username-input"
							type="text"
							value={usernameInput}
							onChange={(e) => setUsernameInput(e.target.value)}
							placeholder="ユーザーネームを入力（最大20文字）"
							maxLength={20}
							className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
						/>
						{usernameError && (
							<p id="username-error" className="text-red-600 text-xs">
								{usernameError}
							</p>
						)}
						{usernameSuccess && (
							<p id="username-success" className="text-green-600 text-xs">
								ユーザーネームを更新しました
							</p>
						)}
						<button
							id="username-submit"
							type="submit"
							disabled={isSubmittingUsername}
							className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
						>
							{isSubmittingUsername ? "設定中..." : "設定する"}
						</button>
					</form>
				) : (
					/* 無料ユーザー: 利用不可メッセージ
             See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない */
					<p id="username-unavailable" className="text-gray-500 text-sm">
						ユーザーネームの設定は有料ユーザー限定の機能です
					</p>
				)}
			</section>

			{/* =============================
          課金セクション（モック）
          See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
          See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
          See: features/user_registration.feature @仮ユーザーは課金できない
          See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
          ============================= */}
			<section
				id="upgrade-section"
				className="bg-white border border-gray-300 rounded p-4 space-y-2"
			>
				<h2 className="text-base font-bold text-gray-700">有料プラン</h2>
				<p className="text-sm text-gray-600">
					有料プランに加入するとユーザーネームが設定できます。
				</p>

				{/* 仮ユーザーへの本登録必要メッセージ
            See: features/user_registration.feature @仮ユーザーは課金できない */}
				{isTemporaryUser(mypageInfo) && (
					<p
						data-testid="registration-required-message"
						className="text-amber-700 text-xs"
					>
						本登録が必要です。上の「本登録」セクションからメールアドレスまたは
						Discord で登録してください。
					</p>
				)}

				{upgradeError && (
					<p id="upgrade-error" className="text-red-600 text-xs">
						{upgradeError}
					</p>
				)}

				{/* upgrade-button: 課金ボタン
            本登録済み無料ユーザーのみ有効。
            有料ユーザーおよび仮ユーザーは disabled。
            See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
            See: features/user_registration.feature @仮ユーザーは課金できない */}
				<button
					data-testid="upgrade-button"
					id="upgrade-button"
					type="button"
					onClick={() => {
						void handleUpgrade();
					}}
					disabled={!upgradeEnabled || isUpgrading}
					className={
						upgradeEnabled
							? "px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
							: "px-4 py-1.5 bg-gray-300 text-gray-500 text-sm rounded cursor-not-allowed"
					}
				>
					{mypageInfo.isPremium
						? "加入済み"
						: isUpgrading
							? "処理中..."
							: upgradeEnabled
								? "有料プランに加入する（モック）"
								: "有料プランに加入する（本登録が必要）"}
				</button>
			</section>

			{/* =============================
          草カウントセクション
          See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
          See: features/mypage.feature @草カウントが0の場合はデフォルト表示になる
          See: src/lib/domain/rules/grass-icon.ts @getGrassIcon
          ============================= */}
			<section
				id="grass-section"
				className="bg-white border border-gray-300 rounded p-4"
			>
				<h2 className="text-base font-bold text-gray-700 mb-2">草カウント</h2>
				{/* grass-count-display: 草カウントの表示要素（"{grassIcon} {grassCount}本" フォーマット）
          See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる */}
				<p
					id="grass-count-display"
					className="text-2xl font-bold text-green-600"
				>
					{mypageInfo.grassIcon} {mypageInfo.grassCount}本
				</p>
			</section>

			{/* =============================
          書き込み履歴セクション
          See: features/mypage.feature @自分の書き込み履歴を確認できる
          See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
          ============================= */}
			<section
				id="post-history"
				className="bg-white border border-gray-300 rounded p-4 space-y-3"
			>
				<h2 className="text-base font-bold text-gray-700">書き込み履歴</h2>

				{posts.length === 0 ? (
					/* 0件の場合のメッセージ
             See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される */
					<p id="no-posts-message" className="text-gray-500 text-sm">
						まだ書き込みがありません
					</p>
				) : (
					<ul id="post-history-list" className="space-y-2">
						{posts.map((post) => (
							<li
								key={post.id}
								className="border-b border-gray-100 pb-2 last:border-b-0"
							>
								{/* スレッド名・本文・日時を表示
                    See: features/mypage.feature @各書き込みのスレッド名、本文、書き込み日時が含まれる */}
								<div className="text-xs text-gray-500 mb-0.5">
									<span className="font-medium">スレッド ID:</span>{" "}
									{post.threadId}
									<span className="ml-2">
										{new Date(post.createdAt).toLocaleString("ja-JP")}
									</span>
								</div>
								<p className="text-sm text-gray-800 line-clamp-2">
									{post.body}
								</p>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* =============================
          通知欄セクション（Phase 2 プレースホルダー）
          See: features/mypage.feature @通知欄が存在する
          ============================= */}
			<section
				id="notifications"
				className="bg-white border border-gray-300 rounded p-4"
			>
				<h2 className="text-base font-bold text-gray-700 mb-2">通知</h2>
				{/* Phase 2 以降: AI告発結果、AIボット状況、ゲームコマンド結果等がここに通知される */}
				<p className="text-gray-400 text-sm">
					通知はありません（Phase 2 で実装予定）
				</p>
			</section>
		</main>
	);
}
