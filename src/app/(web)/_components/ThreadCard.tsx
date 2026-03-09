/**
 * ThreadCard — スレッド一覧の1件分のカードコンポーネント（Server Component）
 *
 * 表示内容:
 * - スレッドタイトル（スレッドへのリンク）
 * - レス数
 * - 最終書き込み日時（相対時間: 「3分前」「1時間前」等）
 *
 * See: features/phase1/thread.feature @スレッド一覧にスレッドの基本情報が表示される
 * See: docs/specs/screens/thread-list.yaml > elements > thread-list > itemTemplate
 */

import Link from "next/link";

interface ThreadCardProps {
  id: string;
  title: string;
  postCount: number;
  lastPostAt: string; // ISO 8601形式
}

/**
 * 現在時刻との差分を相対表現に変換する純粋関数。
 * ライブラリ不要で実装。
 *
 * @param isoDateString - ISO 8601形式の日付文字列
 * @returns 相対時間文字列（例: "3分前"、"1時間前"、"2日前"）
 *
 * See: docs/specs/screens/thread-list.yaml > format: relative
 */
function formatRelativeTime(isoDateString: string): string {
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

/**
 * スレッドカードコンポーネント（Server Component）
 *
 * See: docs/specs/screens/thread-list.yaml @SCR-001 > thread-list > itemTemplate
 */
export default function ThreadCard({
  id,
  title,
  postCount,
  lastPostAt,
}: ThreadCardProps) {
  const relativeTime = formatRelativeTime(lastPostAt);

  return (
    <li className="border-b border-gray-300 py-2 px-2 hover:bg-gray-50">
      <div className="flex items-baseline gap-2 flex-wrap">
        {/* thread-title: スレッドタイトルリンク */}
        <Link
          href={`/threads/${id}`}
          className="text-blue-700 hover:underline hover:text-blue-900 text-sm"
          id="thread-title"
        >
          {title}
        </Link>

        {/* thread-post-count: レス数 */}
        <span
          className="text-gray-600 text-xs whitespace-nowrap"
          id="thread-post-count"
        >
          ({postCount})
        </span>

        {/* thread-last-post-at: 最終書き込み日時（相対表示） */}
        <span
          className="text-gray-400 text-xs whitespace-nowrap"
          id="thread-last-post-at"
          title={lastPostAt}
        >
          {relativeTime}
        </span>
      </div>
    </li>
  );
}
