import { formatDateTime } from "@/lib/utils/date";
import type { ThreadPreviewPostSummary } from "./thread-types";

export function formatRelativeTime(isoDateString: string): string {
	const now = Date.now();
	const past = new Date(isoDateString).getTime();
	const diffMs = now - past;

	if (diffMs < 0) {
		return "たった今";
	}

	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) {
		return `${diffSec}秒前`;
	}

	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) {
		return `${diffMin}分前`;
	}

	const diffHour = Math.floor(diffMin / 60);
	if (diffHour < 24) {
		return `${diffHour}時間前`;
	}

	const diffDay = Math.floor(diffHour / 24);
	if (diffDay < 30) {
		return `${diffDay}日前`;
	}

	const diffMonth = Math.floor(diffDay / 30);
	if (diffMonth < 12) {
		return `${diffMonth}ヶ月前`;
	}

	const diffYear = Math.floor(diffMonth / 12);
	return `${diffYear}年前`;
}

export function calculateMomentum(postCount: number, createdAt: string): number {
	const elapsedMs = Date.now() - new Date(createdAt).getTime();
	const elapsedDays = Math.max(elapsedMs / (1000 * 60 * 60 * 24), 1 / 24);
	return Math.max(1, Math.round(postCount / elapsedDays));
}

export function calculateSurvivalHours(createdAt: string): number {
	const elapsedMs = Date.now() - new Date(createdAt).getTime();
	const elapsedHours = Math.ceil(elapsedMs / (1000 * 60 * 60));
	return Math.max(1, elapsedHours);
}

export function formatThreadMetaTitle(createdAt: string): string {
	return formatDateTime(createdAt);
}

export function formatPreviewBody(
	previewPost: ThreadPreviewPostSummary,
): string {
	if (previewPost.isDeleted) {
		return "このレスは削除されました";
	}

	return previewPost.body.trim();
}
