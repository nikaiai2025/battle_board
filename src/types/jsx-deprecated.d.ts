/**
 * 非推奨HTML要素の型宣言
 *
 * レトロUIの演出として意図的に使用する非推奨要素の型定義。
 * 開発連絡板 (dev/page.tsx) の <marquee> タグ等で必要。
 */

import "react";

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			marquee: React.DetailedHTMLProps<
				React.HTMLAttributes<HTMLElement> & {
					scrollamount?: string | number;
					direction?: string;
					behavior?: string;
				},
				HTMLElement
			>;
		}
	}
}
