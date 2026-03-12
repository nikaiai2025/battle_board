/**
 * SubjectFormatter — subject.txt の構築
 *
 * 5ch専用ブラウザが要求するsubject.txt形式（1スレッド1行）のテキストを生成する。
 * UTF-8文字列を返す。Shift_JISへの変換は呼び出し元（Route Handler）が担う。
 *
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario subject.txtが所定のフォーマットで返される
 *   @scenario 複数スレッドがbump順（最終書き込み順）で並ぶ
 * See: docs/architecture/components/senbra-adapter.md §2 SubjectFormatter, §3 公開インターフェース
 */

import type { Thread } from "../../domain/models/thread";

/**
 * subject.txtテキストの構築クラス。
 *
 * 責務: Thread[] → subject.txt文字列変換（UTF-8）
 *
 * NOTE: スレッドの並び順（bump順）は呼び出し元（Route Handler or Repository）が
 * lastPostAtでソート済みのリストを渡す責任を持つ。本クラスは並び替えを行わない。
 */
export class SubjectFormatter {
  /**
   * スレッド配列からsubject.txt形式テキストを構築する。
   *
   * フォーマット（1スレッド1行）:
   *   {threadKey}.dat<>{title} ({postCount})\n
   *
   * isDeleted=trueのスレッドは出力から除外する。
   * スレッドタイトルはHTMLエスケープしない（subject.txtはプレーンテキスト仕様）。
   *
   * @param threads - スレッドのリスト（呼び出し元でbump順ソート済みであること）
   * @returns subject.txt形式のUTF-8文字列
   */
  buildSubjectTxt(threads: Thread[]): string {
    const activeThreads = threads.filter((t) => !t.isDeleted);
    if (activeThreads.length === 0) return "";

    return (
      activeThreads
        .map((thread) => `${thread.threadKey}.dat<>${thread.title} (${thread.postCount})`)
        .join("\n") + "\n"
    );
  }
}
