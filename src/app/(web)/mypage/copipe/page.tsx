"use client";

/**
 * コピペ管理ページ — /mypage/copipe
 *
 * マイページから分離した独立ページ。コピペ(AA)の登録・一覧・編集・削除を行う。
 * 認証は /api/mypage から userId を取得して判定する。
 *
 * See: features/user_copipe.feature
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import CopipeSection from "../_components/CopipeSection";

export default function CopipeManagementPage() {
	const [mypageInfo, setMypageInfo] = useState<{ userId: string } | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchAuth = useCallback(async () => {
		try {
			const res = await fetch("/api/mypage", { cache: "no-store" });
			if (res.status === 401) {
				setError("ログインが必要です。");
				return;
			}
			if (!res.ok) {
				setError("認証情報の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as { userId: string };
			setMypageInfo({ userId: data.userId });
		} catch {
			setError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchAuth();
	}, [fetchAuth]);

	if (isLoading) {
		return (
			<main className="container mx-auto max-w-2xl py-8 px-4">
				<p className="text-muted-foreground text-sm">読み込み中...</p>
			</main>
		);
	}

	if (error) {
		return (
			<main className="container mx-auto max-w-2xl py-8 px-4">
				<p className="text-red-600 text-sm">{error}</p>
				<Link
					href="/mypage"
					className="text-sm text-blue-600 hover:underline mt-2 inline-block"
				>
					マイページに戻る
				</Link>
			</main>
		);
	}

	return (
		<main className="container mx-auto max-w-2xl py-8 px-4 space-y-4">
			<div className="flex items-center gap-2">
				<Link href="/mypage" className="text-sm text-blue-600 hover:underline">
					&larr; マイページ
				</Link>
			</div>

			<CopipeSection mypageInfo={mypageInfo} />
		</main>
	);
}
