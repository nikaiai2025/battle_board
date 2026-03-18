"use client";

/**
 * PostFormContext — PostFormへのテキスト挿入を共有するContext
 *
 * PostItem（レス番号ボタン）が PostForm の insertText を呼び出すための
 * Contextブリッジ。PostForm が Provider の値を設定し（useEffect内で登録）、
 * PostItem が Consumer として利用する。
 *
 * 使用パターン:
 *   1. page.tsx 等の親コンポーネントで <PostFormContextProvider> で PostForm と
 *      PostList をまとめてラップする
 *   2. PostForm が mount 時に useContext(PostFormRegisterContext) 経由で
 *      自分の insertText を登録する
 *   3. PostItem が usePostFormContext() で insertText を取得してクリック時に呼ぶ
 *
 * See: features/thread.feature @post_number_display
 * See: tmp/workers/bdd-architect_TASK-162/design.md §4.3
 */

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** PostItem が消費する Context 値（テキスト挿入のみ） */
export interface PostFormContextType {
	/** フォームにテキストを挿入する。空の場合は置換、非空の場合は改行付き追記 */
	insertText: (text: string) => void;
}

/** PostForm が登録に使う Context 値 */
interface PostFormRegisterContextType {
	/** PostForm が自分の insertText 実装を登録するためのセッター */
	register: (fn: (text: string) => void) => void;
}

// ---------------------------------------------------------------------------
// Context の定義
// ---------------------------------------------------------------------------

/**
 * PostFormContext — PostItem が消費する（insertText のみ）
 * デフォルト値は no-op（Provider外での誤使用を許容する）
 */
export const PostFormContext = createContext<PostFormContextType>({
	insertText: () => {},
});

/**
 * PostFormRegisterContext — PostForm が insertText を登録するための内部Context
 */
const PostFormRegisterContext = createContext<PostFormRegisterContextType>({
	register: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PostFormContextProviderProps {
	children: React.ReactNode;
}

/**
 * PostFormContextProvider — PostForm の insertText を子孫コンポーネントに提供する
 *
 * PostForm と PostList（PostItem）の共通の親として配置し、
 * PostForm が mount 時に register() を呼んで insertText を登録する。
 * 登録後は PostItem から insertText を呼び出せるようになる。
 *
 * See: features/thread.feature @post_number_display
 * See: tmp/workers/bdd-architect_TASK-162/design.md §4.3
 */
export function PostFormContextProvider({
	children,
}: PostFormContextProviderProps) {
	// PostForm が登録した insertText を保持する
	const [insertText, setInsertText] = useState<(text: string) => void>(
		// 初期値はno-op
		() => () => {},
	);

	// PostForm が自分の insertText を登録するための関数
	const register = useCallback((fn: (text: string) => void) => {
		// setState に関数を渡す際は二重ラップが必要（fn が関数であるため）
		setInsertText(() => fn);
	}, []);

	// PostItem が使用する Context 値
	const contextValue = useMemo<PostFormContextType>(
		() => ({ insertText }),
		[insertText],
	);

	// PostForm が登録に使う Context 値
	const registerValue = useMemo<PostFormRegisterContextType>(
		() => ({ register }),
		[register],
	);

	return (
		<PostFormRegisterContext.Provider value={registerValue}>
			<PostFormContext.Provider value={contextValue}>
				{children}
			</PostFormContext.Provider>
		</PostFormRegisterContext.Provider>
	);
}

// ---------------------------------------------------------------------------
// カスタムフック
// ---------------------------------------------------------------------------

/**
 * usePostFormContext — PostFormContext を取得するカスタムフック（PostItem 用）
 *
 * See: features/thread.feature @post_number_display
 */
export function usePostFormContext(): PostFormContextType {
	return useContext(PostFormContext);
}

/**
 * usePostFormRegister — PostForm が自分の insertText を登録するためのフック
 *
 * PostForm の useEffect 内で呼び出す:
 * ```typescript
 * const { register } = usePostFormRegister();
 * useEffect(() => { register(insertText); }, [register, insertText]);
 * ```
 *
 * See: features/thread.feature @post_number_display
 * See: tmp/workers/bdd-architect_TASK-162/design.md §4.3
 */
export function usePostFormRegister(): PostFormRegisterContextType {
	return useContext(PostFormRegisterContext);
}
