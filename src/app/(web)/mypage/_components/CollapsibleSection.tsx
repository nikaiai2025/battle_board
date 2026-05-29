"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * マイページ用の折り畳みセクション。
 *
 * 見出しをタップするまで中身を折り畳んでおき、雑然とした印象を抑える。
 * BDDテストはAPIレスポンス（mypageResult）を検証するため、
 * 中身がデフォルト非表示でも受け入れ基準には影響しない。
 *
 * See: features/mypage.feature
 */
export default function CollapsibleSection({
	title,
	children,
	defaultOpen = false,
	sectionId,
	testId,
	headingAddon,
}: {
	title: string;
	children: ReactNode;
	defaultOpen?: boolean;
	/** 既存のBDD/テスト参照を維持するための section の id 属性 */
	sectionId?: string;
	/** 既存のBDD/テスト参照を維持するための data-testid 属性 */
	testId?: string;
	/** 見出し右側に表示する補助情報（残高や件数など） */
	headingAddon?: ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<section
			id={sectionId}
			data-testid={testId}
			className="bg-card border border-border rounded"
		>
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				<CollapsibleTrigger
					className={cn(
						"flex w-full items-center gap-2 px-4 py-3 text-left",
						"cursor-pointer hover:bg-accent/40 transition-colors rounded",
					)}
				>
					<ChevronRight
						className={cn(
							"size-4 shrink-0 text-muted-foreground transition-transform duration-200",
							isOpen && "rotate-90",
						)}
					/>
					<span className="text-base font-bold text-foreground">{title}</span>
					{headingAddon && (
						<span className="ml-auto text-sm text-muted-foreground">
							{headingAddon}
						</span>
					)}
				</CollapsibleTrigger>

				<CollapsibleContent>
					<div className="px-4 pb-4 pt-1 space-y-3">{children}</div>
				</CollapsibleContent>
			</Collapsible>
		</section>
	);
}
