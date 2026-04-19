import type { Post } from "./PostItem";

export interface PopupEntry {
	postNumber: number;
	post: Post | null;
	position: { x: number; y: number };
}

export function openAnchorPopup(
	allPosts: Map<number, Post>,
	popupStack: PopupEntry[],
	postNumber: number,
	position: { x: number; y: number },
): PopupEntry[] {
	const post = allPosts.get(postNumber) ?? null;
	if (post === null) {
		return popupStack;
	}

	return [...popupStack, { postNumber, post, position }];
}

export function closeTopAnchorPopup(popupStack: PopupEntry[]): PopupEntry[] {
	if (popupStack.length === 0) {
		return popupStack;
	}
	return popupStack.slice(0, -1);
}

export function insertPostReference(currentBody: string, referenceText: string) {
	if (currentBody.trim() === "") {
		return referenceText;
	}
	return `${currentBody}\n${referenceText}`;
}

export function getFreshItemsAfterPostNumber<T extends { postNumber: number }>(
	items: T[],
	lastPostNumber: number,
) {
	return items.filter((item) => item.postNumber > lastPostNumber);
}
