"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * サイトビジョンセクション — 折りたたみ可能な3本柱のビジョン表示
 *
 * スレッド一覧ページのタイトル直下に配置する。
 * デフォルトは閉じた状態で、クリックで展開する。
 */
export default function VisionSection() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger
				className={cn(
					"flex items-center gap-1 text-xs text-muted-foreground",
					"hover:text-foreground transition-colors cursor-pointer",
					"mb-2",
				)}
			>
				<ChevronRight
					className={cn(
						"size-3.5 transition-transform duration-200",
						isOpen && "rotate-90",
					)}
				/>
				<span>このサイトについて（ビジョン）</span>
			</CollapsibleTrigger>

			<CollapsibleContent>
				<div className="mb-3 rounded-md border border-border bg-card p-4 text-sm text-card-foreground space-y-4">
					{/* 柱1: 掲示板文化の保全 */}
					<section>
						<h3 className="font-bold text-foreground mb-1">掲示板文化の保全</h3>
						<p className="text-muted-foreground leading-relaxed">
							匿名掲示板はネットの主役を譲り、かつての掲示板文化——コピペ、定型句——が失われつつあります。
							それを掘り起こし、コマンドとして再現し、なるべく（費用・技術的に）持続可能な形で保全します。
						</p>
					</section>

					{/* 柱2: 掲示板文化の拡張 */}
					<section>
						<h3 className="font-bold text-foreground mb-1">
							掲示板文化の拡張（ゲーミフィケーションによる活性化）
						</h3>
						<p className="text-muted-foreground leading-relaxed">
							多種多様なコマンドを「道具」として用意し、ユーザー同士の創発的な遊びが生まれる場を目指しています。
						</p>
						<p className="text-muted-foreground leading-relaxed">
							人間とAIの区別が難しくなり、AIと共存する時代になりつつあります。しかしAI(BOT)が人間のフリをすることには反発もある。
							このAIの「不気味の谷」を人狼のようなゲームに利用できないか。あえて様々なAI(BOT)が徘徊するカオスな場を実験しています。
						</p>
						<p className="text-muted-foreground leading-relaxed">
							<span className="text-xs opacity-70">将来構想: </span>
							役に立つボット（話題供給ボット等）、役に立たないボット（荒らすだけ）、戦闘用ボット（HP・攻撃力の高いレイドボス等）、ユーザー生成ボット（性格等を定義して放し飼いできる等）。
						</p>
					</section>

					{/* 柱3: AI開発体制の実験 */}
					<section>
						<h3 className="font-bold text-foreground mb-1">
							AI時代の開発体制の実証実験
						</h3>
						<p className="text-muted-foreground leading-relaxed">
							本サイトの開発は全てAIが行っています。人間はコードを1行も書かず自然言語で指示するのみ（コードを書く知識はない）。
							このサイト自体が今後のAIとの共存の在り方を模索する実証実験です。
							ソースコードと開発記録・AIエージェント定義等はは全てGithubにて公開しています。（開発環境：ClaudeCode +α）
						</p>
						<p className="mt-1">
							<a
								href="https://github.com/nikaiai2025/battle_board"
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
							>
								GitHub リポジトリ
							</a>
						</p>
					</section>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
