"use client";

/**
 * AnchorPopupContext — アンカーポップアップのスタック管理Context
 *
 * アンカー（>>N）クリック時にポップアップでレス内容を表示するための
 * Context。ポップアップのスタック管理（ネストポップアップ対応）、
 * レスデータのローカルキャッシュ（allPosts Map）を提供する。
 *
 * 設計方針:
 *   - popupStack: PopupEntry[] でポップアップの重なりを管理
 *   - allPosts: Map<number, Post> で表示中レスをキャッシュ
 *   - 表示中のレスにない場合はポップアップを表示しない（暫定決定）
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.3
 */

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { Post } from "./PostItem";
import {
	closeTopAnchorPopup,
	openAnchorPopup,
	type PopupEntry,
} from "./thread-ui-logic";
export type { PopupEntry } from "./thread-ui-logic";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** AnchorPopupContext の型 */
export interface AnchorPopupContextType {
	/** 現在表示中のポップアップスタック（末尾が最前面） */
	popupStack: PopupEntry[];
	/** ポップアップを開く。対象レスが allPosts に存在しない場合は何もしない */
	openPopup: (postNumber: number, position: { x: number; y: number }) => void;
	/** 最前面（スタック末尾）のポップアップを閉じる */
	closeTopPopup: () => void;
	/** 全ポップアップを閉じる */
	closeAllPopups: () => void;
	/** 表示中レスのキャッシュ（postNumber → Post） */
	allPosts: Map<number, Post>;
	/** レスをキャッシュに追加・更新する */
	registerPosts: (posts: Post[]) => void;
}

// ---------------------------------------------------------------------------
// Context の定義
// ---------------------------------------------------------------------------

/**
 * AnchorPopupContext
 * デフォルト値はno-op（Provider外での誤使用を許容する）
 *
 * See: features/thread.feature @anchor_popup
 */
export const AnchorPopupContext = createContext<AnchorPopupContextType>({
	popupStack: [],
	openPopup: () => {},
	closeTopPopup: () => {},
	closeAllPopups: () => {},
	allPosts: new Map(),
	registerPosts: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AnchorPopupProviderProps {
	children: React.ReactNode;
	/** 初期表示レス一覧（SSRで取得済み）。allPosts の初期値として使用する */
	initialPosts?: Post[];
}

/**
 * AnchorPopupProvider — アンカーポップアップContextのProvider
 *
 * スレッドページでラップして使用する。
 * PostList, PostListLiveWrapper の親として配置することで
 * PostItem内の AnchorLink がContextを消費できる。
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.2
 */
export function AnchorPopupProvider({
	children,
	initialPosts = [],
}: AnchorPopupProviderProps) {
	// ポップアップスタック（末尾が最前面）
	const [popupStack, setPopupStack] = useState<PopupEntry[]>([]);

	// 表示中レスのキャッシュ（初期レスで初期化）
	const [allPosts, setAllPosts] = useState<Map<number, Post>>(() => {
		const map = new Map<number, Post>();
		for (const post of initialPosts) {
			map.set(post.postNumber, post);
		}
		return map;
	});

	/**
	 * ポップアップを開く。
	 * allPosts にレスが存在する場合のみスタックに追加する。
	 *
	 * See: features/thread.feature @anchor_popup
	 * シナリオ: 存在しないレスへのアンカーではポップアップが表示されない
	 */
	const openPopup = useCallback(
		(postNumber: number, position: { x: number; y: number }) => {
			setPopupStack((prev) =>
				openAnchorPopup(allPosts, prev, postNumber, position),
			);
		},
		[allPosts],
	);

	/**
	 * 最前面（スタック末尾）のポップアップを閉じる。
	 *
	 * See: features/thread.feature @anchor_popup
	 * シナリオ: ポップアップの外側をクリックすると最前面のポップアップが閉じる
	 */
	const closeTopPopup = useCallback(() => {
		setPopupStack((prev) => closeTopAnchorPopup(prev));
	}, []);

	/**
	 * 全ポップアップを閉じる。
	 *
	 * See: features/thread.feature @anchor_popup
	 */
	const closeAllPopups = useCallback(() => {
		setPopupStack([]);
	}, []);

	/**
	 * レスをキャッシュに追加・更新する。
	 * PostListLiveWrapper の新着レスをキャッシュに追加するために使用する。
	 *
	 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.4
	 */
	const registerPosts = useCallback((posts: Post[]) => {
		if (posts.length === 0) return;
		setAllPosts((prev) => {
			const next = new Map(prev);
			for (const post of posts) {
				next.set(post.postNumber, post);
			}
			return next;
		});
	}, []);

	const contextValue = useMemo<AnchorPopupContextType>(
		() => ({
			popupStack,
			openPopup,
			closeTopPopup,
			closeAllPopups,
			allPosts,
			registerPosts,
		}),
		[
			popupStack,
			openPopup,
			closeTopPopup,
			closeAllPopups,
			allPosts,
			registerPosts,
		],
	);

	return (
		<AnchorPopupContext.Provider value={contextValue}>
			{children}
		</AnchorPopupContext.Provider>
	);
}

// ---------------------------------------------------------------------------
// カスタムフック
// ---------------------------------------------------------------------------

/**
 * useAnchorPopupContext — AnchorPopupContext を取得するカスタムフック
 *
 * AnchorLink と AnchorPopup で使用する。
 *
 * See: features/thread.feature @anchor_popup
 */
export function useAnchorPopupContext(): AnchorPopupContextType {
	return useContext(AnchorPopupContext);
}
