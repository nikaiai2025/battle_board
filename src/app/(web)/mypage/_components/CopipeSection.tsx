"use client";

/**
 * コピペ管理セクション -- マイページからコピペ(AA)を登録・一覧表示・編集・削除する
 *
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 *
 * 責務:
 *   - コピペ登録フォームの状態管理(name, content)
 *   - GET /api/mypage/copipe の呼び出しと一覧表示
 *   - POST /api/mypage/copipe でのコピペ新規登録
 *   - PUT /api/mypage/copipe/[id] でのコピペ編集
 *   - DELETE /api/mypage/copipe/[id] でのコピペ削除
 *   - バリデーションエラーの表示
 *
 * API レスポンス形状:
 *   GET  -> { entries: CopipeEntry[] }  (LL-016: bare array ではない)
 *   POST -> CopipeEntry (201)
 *   PUT  -> CopipeEntry (200)
 *   DELETE -> 204 No Content
 *
 * See: docs/architecture/lessons_learned.md LL-016
 */

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** コピペエントリ（APIレスポンスの1件）
 * See: src/lib/infrastructure/repositories/user-copipe-repository.ts UserCopipeEntry
 */
interface CopipeEntry {
	id: number;
	userId: string;
	name: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

/** CopipeSection の props */
interface CopipeSectionProps {
	/** マイページ情報（ログイン状態の判定に使用） */
	mypageInfo: { userId: string } | null;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 前後の空行のみ除去する（行内の先頭空白は保持）。
 * AA の字下げを破壊しないための .trim() 代替。
 * seed-copipe.ts の trimBlankLines と同じ方針。
 */
function trimBlankLines(text: string): string {
	return text.replace(/^(\s*\n)+/, "").replace(/(\n\s*)+$/, "");
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 名前の最大文字数
 * See: features/user_copipe.feature @名前が50文字を超える場合は登録できない */
const NAME_MAX_LENGTH = 50;

/** 本文の最大文字数
 * See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない */
const CONTENT_MAX_LENGTH = 5000;

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * コピペ管理セクション
 *
 * See: features/user_copipe.feature
 */
export default function CopipeSection({ mypageInfo }: CopipeSectionProps) {
	// -----------------------------------------------------------------------
	// 状態管理
	// -----------------------------------------------------------------------

	// 登録フォームの状態
	const [nameInput, setNameInput] = useState("");
	const [contentInput, setContentInput] = useState("");
	const [formError, setFormError] = useState<string | null>(null);
	const [formSuccess, setFormSuccess] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// 一覧の状態
	const [copipeList, setCopipeList] = useState<CopipeEntry[]>([]);
	const [isLoadingList, setIsLoadingList] = useState(false);

	// 編集の状態
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editNameInput, setEditNameInput] = useState("");
	const [editContentInput, setEditContentInput] = useState("");
	const [editError, setEditError] = useState<string | null>(null);
	const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

	// 削除の状態
	const [isDeletingId, setIsDeletingId] = useState<number | null>(null);

	// -----------------------------------------------------------------------
	// データ取得
	// -----------------------------------------------------------------------

	/**
	 * コピペ一覧を取得する。
	 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
	 *
	 * レスポンス形状: { entries: CopipeEntry[] }
	 * See: docs/architecture/lessons_learned.md LL-016
	 */
	const fetchCopipeList = useCallback(async () => {
		setIsLoadingList(true);
		try {
			const res = await fetch("/api/mypage/copipe", { cache: "no-store" });
			if (res.ok) {
				// LL-016: bare array ではなく { entries } ラッパーで受け取る
				const json = (await res.json()) as { entries?: CopipeEntry[] };
				setCopipeList(json.entries ?? []);
			}
		} catch {
			// サイレントに処理する
		} finally {
			setIsLoadingList(false);
		}
	}, []);

	useEffect(() => {
		if (mypageInfo) {
			void fetchCopipeList();
		}
	}, [mypageInfo, fetchCopipeList]);

	// -----------------------------------------------------------------------
	// 登録ハンドラ
	// -----------------------------------------------------------------------

	/**
	 * コピペを新規登録する。
	 * See: features/user_copipe.feature @マイページからコピペを新規登録する
	 * See: features/user_copipe.feature @名前が空の場合は登録できない
	 * See: features/user_copipe.feature @本文が空の場合は登録できない
	 * See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
	 * See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
	 */
	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault();
		setFormError(null);
		setFormSuccess(false);
		setIsSubmitting(true);

		// --- クライアントサイドバリデーション ---
		const trimmedName = nameInput.trim();
		// AA の先頭行インデントを破壊しないよう、前後の空行のみ除去する
		// （行内の先頭空白は保持。seed-copipe.ts の trimBlankLines と同じ方針）
		const cleanedContent = trimBlankLines(contentInput);

		if (!trimmedName) {
			setFormError("名前は必須です");
			setIsSubmitting(false);
			return;
		}
		if (!cleanedContent) {
			setFormError("本文は必須です");
			setIsSubmitting(false);
			return;
		}
		if (trimmedName.length > NAME_MAX_LENGTH) {
			setFormError(`名前は${NAME_MAX_LENGTH}文字以内で入力してください`);
			setIsSubmitting(false);
			return;
		}
		if (cleanedContent.length > CONTENT_MAX_LENGTH) {
			setFormError(`本文は${CONTENT_MAX_LENGTH}文字以内で入力してください`);
			setIsSubmitting(false);
			return;
		}

		try {
			const res = await fetch("/api/mypage/copipe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: trimmedName, content: cleanedContent }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { message?: string };
				setFormError(data.message ?? "登録に失敗しました。");
				return;
			}

			// 成功: 入力クリア + 一覧再取得
			setNameInput("");
			setContentInput("");
			setFormSuccess(true);
			await fetchCopipeList();
			// 3秒後に成功メッセージをクリア
			setTimeout(() => setFormSuccess(false), 3000);
		} catch {
			setFormError("ネットワークエラーが発生しました。");
		} finally {
			setIsSubmitting(false);
		}
	};

	// -----------------------------------------------------------------------
	// 編集ハンドラ
	// -----------------------------------------------------------------------

	/**
	 * 編集モードを開始する。
	 * See: features/user_copipe.feature @自分の登録コピペを編集する
	 */
	const startEditing = (entry: CopipeEntry) => {
		setEditingId(entry.id);
		setEditNameInput(entry.name);
		setEditContentInput(entry.content);
		setEditError(null);
	};

	/** 編集モードをキャンセルする。 */
	const cancelEditing = () => {
		setEditingId(null);
		setEditNameInput("");
		setEditContentInput("");
		setEditError(null);
	};

	/**
	 * 編集を保存する。
	 * See: features/user_copipe.feature @自分の登録コピペを編集する
	 */
	const handleSaveEdit = async (id: number) => {
		setEditError(null);
		setIsSubmittingEdit(true);

		// --- クライアントサイドバリデーション ---
		const trimmedName = editNameInput.trim();
		const cleanedContent = trimBlankLines(editContentInput);

		if (!trimmedName) {
			setEditError("名前は必須です");
			setIsSubmittingEdit(false);
			return;
		}
		if (!cleanedContent) {
			setEditError("本文は必須です");
			setIsSubmittingEdit(false);
			return;
		}
		if (trimmedName.length > NAME_MAX_LENGTH) {
			setEditError(`名前は${NAME_MAX_LENGTH}文字以内で入力してください`);
			setIsSubmittingEdit(false);
			return;
		}
		if (cleanedContent.length > CONTENT_MAX_LENGTH) {
			setEditError(`本文は${CONTENT_MAX_LENGTH}文字以内で入力してください`);
			setIsSubmittingEdit(false);
			return;
		}

		try {
			const res = await fetch(`/api/mypage/copipe/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: trimmedName, content: cleanedContent }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { message?: string };
				setEditError(data.message ?? "編集に失敗しました。");
				return;
			}

			// 成功: 編集モード終了 + 一覧再取得
			cancelEditing();
			await fetchCopipeList();
		} catch {
			setEditError("ネットワークエラーが発生しました。");
		} finally {
			setIsSubmittingEdit(false);
		}
	};

	// -----------------------------------------------------------------------
	// 削除ハンドラ
	// -----------------------------------------------------------------------

	/**
	 * コピペを削除する（確認付き）。
	 * See: features/user_copipe.feature @自分の登録コピペを削除する
	 */
	const handleDelete = async (id: number, name: string) => {
		if (!window.confirm(`「${name}」を削除しますか？`)) return;

		setIsDeletingId(id);
		try {
			const res = await fetch(`/api/mypage/copipe/${id}`, {
				method: "DELETE",
			});

			if (!res.ok && res.status !== 204) {
				// 削除失敗はサイレントに処理する
				return;
			}

			// 成功: 一覧再取得
			await fetchCopipeList();
		} catch {
			// ネットワークエラーはサイレントに処理する
		} finally {
			setIsDeletingId(null);
		}
	};

	// -----------------------------------------------------------------------
	// レンダリング
	// -----------------------------------------------------------------------

	return (
		<section
			data-testid="copipe-section"
			className="bg-card border border-border rounded p-4 space-y-3"
		>
			<h2 className="text-base font-bold text-foreground">コピペ管理（AA）</h2>
			<p className="text-sm text-muted-foreground">
				コピペ（AA）を登録すると、!copipe
				コマンドで全ユーザーが検索・利用できます。
			</p>
			<p className="text-xs text-muted-foreground">
				※ AA表示フォント（MS PGothic系）では半角の
				<code className="font-mono">\</code> が <code>¥</code>{" "}
				に見えます。AAでバックスラッシュを使う場合は全角の <code>＼</code>{" "}
				をお使いください。
			</p>

			{/* 登録フォーム
				See: features/user_copipe.feature @マイページからコピペを新規登録する */}
			<form
				onSubmit={(e) => {
					void handleRegister(e);
				}}
				className="space-y-2"
			>
				{/* 名前入力 */}
				<input
					data-testid="copipe-name-input"
					type="text"
					value={nameInput}
					onChange={(e) => setNameInput(e.target.value)}
					placeholder="名前（最大50文字）"
					maxLength={NAME_MAX_LENGTH}
					className="w-full border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
				/>

				{/* 本文入力 */}
				<textarea
					data-testid="copipe-content-input"
					value={contentInput}
					onChange={(e) => setContentInput(e.target.value)}
					placeholder="本文（最大5000文字）"
					maxLength={CONTENT_MAX_LENGTH}
					rows={4}
					className="w-full border border-border rounded px-3 py-1.5 focus:outline-none focus:border-blue-400 resize-y"
					style={{
						fontFamily: "var(--font-aa)",
						fontSize: "16px",
						lineHeight: "18px",
					}}
				/>

				{/* 登録ボタン */}
				<button
					data-testid="copipe-submit"
					type="submit"
					disabled={isSubmitting}
					className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
				>
					{isSubmitting ? "登録中..." : "登録する"}
				</button>

				{/* エラー表示
					See: features/user_copipe.feature @名前が空の場合は登録できない */}
				{formError && (
					<p data-testid="copipe-error" className="text-red-600 text-xs">
						{formError}
					</p>
				)}

				{/* 成功メッセージ */}
				{formSuccess && (
					<p data-testid="copipe-success" className="text-green-600 text-xs">
						コピペを登録しました
					</p>
				)}
			</form>

			{/* 一覧表示
				See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される */}
			<div>
				<h3 className="text-sm font-medium text-muted-foreground mb-2">
					登録済みコピペ
				</h3>
				{isLoadingList ? (
					<p className="text-muted-foreground text-xs">読み込み中...</p>
				) : copipeList.length === 0 ? (
					<p
						data-testid="copipe-empty"
						className="text-muted-foreground text-xs"
					>
						登録済みのコピペはありません
					</p>
				) : (
					<ul data-testid="copipe-list" className="space-y-2">
						{copipeList.map((entry) => (
							<li
								key={entry.id}
								data-testid={`copipe-item-${entry.id}`}
								className="border border-border rounded p-3 space-y-2"
							>
								{editingId === entry.id ? (
									/* 編集モード
									   See: features/user_copipe.feature @自分の登録コピペを編集する */
									<div className="space-y-2">
										<input
											data-testid="copipe-edit-name-input"
											type="text"
											value={editNameInput}
											onChange={(e) => setEditNameInput(e.target.value)}
											placeholder="名前（最大50文字）"
											maxLength={NAME_MAX_LENGTH}
											className="w-full border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
										/>
										<textarea
											data-testid="copipe-edit-content-input"
											value={editContentInput}
											onChange={(e) => setEditContentInput(e.target.value)}
											placeholder="本文（最大5000文字）"
											maxLength={CONTENT_MAX_LENGTH}
											rows={4}
											className="w-full border border-border rounded px-3 py-1.5 focus:outline-none focus:border-blue-400 resize-y"
											style={{
												fontFamily: "var(--font-aa)",
												fontSize: "16px",
												lineHeight: "18px",
											}}
										/>
										{editError && (
											<p
												data-testid="copipe-edit-error"
												className="text-red-600 text-xs"
											>
												{editError}
											</p>
										)}
										<div className="flex gap-2">
											<button
												data-testid="copipe-edit-save"
												type="button"
												disabled={isSubmittingEdit}
												onClick={() => {
													void handleSaveEdit(entry.id);
												}}
												className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
											>
												{isSubmittingEdit ? "保存中..." : "保存"}
											</button>
											<button
												data-testid="copipe-edit-cancel"
												type="button"
												onClick={cancelEditing}
												className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded hover:bg-accent"
											>
												キャンセル
											</button>
										</div>
									</div>
								) : (
									/* 表示モード */
									<div>
										<div className="flex justify-between items-start">
											<span
												data-testid="copipe-item-name"
												className="text-sm font-medium text-foreground"
											>
												{entry.name}
											</span>
											<div className="flex gap-1">
												{/* 編集ボタン */}
												<button
													data-testid={`copipe-edit-btn-${entry.id}`}
													type="button"
													onClick={() => startEditing(entry)}
													className="px-2 py-0.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded hover:bg-blue-50"
												>
													編集
												</button>
												{/* 削除ボタン
													See: features/user_copipe.feature @自分の登録コピペを削除する */}
												<button
													data-testid={`copipe-delete-btn-${entry.id}`}
													type="button"
													disabled={isDeletingId === entry.id}
													onClick={() => {
														void handleDelete(entry.id, entry.name);
													}}
													className="px-2 py-0.5 text-xs text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
												>
													{isDeletingId === entry.id ? "削除中..." : "削除"}
												</button>
											</div>
										</div>
										{/* 本文プレビュー（AA表示フォント, 折りたたみ表示） */}
										<pre
											data-testid="copipe-item-content"
											className="mt-1 text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-muted rounded p-2"
											style={{
												fontFamily: "var(--font-aa)",
												fontSize: "16px",
												lineHeight: "18px",
											}}
										>
											{entry.content}
										</pre>
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
