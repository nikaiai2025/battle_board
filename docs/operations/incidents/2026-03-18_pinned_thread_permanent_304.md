# 固定スレッド lastPostAt=2099 による永久304バグ

- **日付:** 2026-03-18
- **重大度:** High（専ブラで新規スレッドが表示不能）
- **影響範囲:** subject.txt の全リクエスト（専ブラ経由）
- **修正:** TASK-146 (Sprint-51)

---

## 事象

専ブラ（ChMate等）で板を開いた際、新規に作成されたスレッドが subject.txt に反映されない。一度 subject.txt を取得すると、以降は新スレッドが増えても常に 304 Not Modified が返される。

Web版では正常にスレッド一覧が表示される（Web版は subject.txt を使わないため影響なし）。

---

## Phase 1: 原因理解

### Q1. なぜ起きたか

**直接原因:** subject.txt route の304判定・Last-Modifiedヘッダに `threads[0].lastPostAt` を使用していた。`ThreadRepository.findByBoardId` は `last_post_at DESC` でソートするため、固定スレッド（`lastPostAt = 2099-01-01`）が常に先頭に位置し、`Last-Modified: Thu, 01 Jan 2099 00:00:00 GMT` が返される。

専ブラは次回リクエストで `If-Modified-Since: Thu, 01 Jan 2099 00:00:00 GMT` を送信する。通常スレッドの lastPostAt は現在時刻（2026年）であり、2099年より常に小さいため、永遠に304が返される。

**根本原因:** 固定スレッドが bump順ソートの先頭に来るために `lastPostAt = 2099-01-01` というマジックバリューを使用しているが（`scripts/upsert-pinned-thread.ts` L59）、この値が304判定ロジックに漏洩するケースが考慮されていなかった。

### Q2. なぜ今まで気付かなかったか

- Route handler テストに「固定スレッド（未来日時）と通常スレッドが混在するケース」が存在しなかった
- BDDテストはサービス層で実行されるため、HTTP層の304判定ロジックは検証対象外（D-10 §7 の設計上の限界）
- 固定スレッド機能と subject.txt 304判定は別タスクで実装されており、機能横断的なデータ組み合わせテストが欠落していた

### Q3. なぜ今になって気付いたか

- 手動テスト（専ブラでの操作確認）で発見。仕組みによる検出ではなく偶然の発見。
- 発見トリガー: 開発中の手動動作確認で「新しいスレッドが専ブラに表示されない」ことに気付いた

### Q4. 真因検証

根本原因の裏付け:

1. `scripts/upsert-pinned-thread.ts` L59: `const PINNED_LAST_POST_AT = new Date("2099-01-01T00:00:00Z")`
2. `ThreadRepository.findByBoardId` は `last_post_at DESC` ソート → 固定スレッドが `threads[0]`
3. 修正前の route.ts: `threads[0].lastPostAt` を直接304判定に使用
4. 修正後: `resolveLatestPostAt()` で未来日時を除外 → テスト5件追加で修正前FAIL・修正後PASSを確認

同じ症状を引き起こす別の原因はない。304判定に使う日時が唯一の変数であり、それが2099年であることが唯一の原因。

---

## Phase 2: 対策

### Q5. 対策

`resolveLatestPostAt()` 関数を追加し、現在時刻より未来の lastPostAt を除外して304判定・Last-Modifiedヘッダ用の日時を決定する。

```typescript
function resolveLatestPostAt(threads: { lastPostAt: Date }[]): Date {
    if (threads.length === 0) return new Date(0);
    const now = new Date();
    return (
        threads.find((t) => t.lastPostAt <= now)?.lastPostAt ??
        threads[threads.length - 1].lastPostAt
    );
}
```

設計判断: `isPinned` フラグではなく「未来日時の除外」で判定。理由は以下:
- isPinned の仕様変更（将来的にソート方式が変わる等）に依存しない
- 未来の lastPostAt を304判定に使うことは、固定スレッドに限らず常に不正

### Q6. 対策による悪影響

- 固定スレッドのみの板（通常スレッド0件）: フォールバックにより最後の要素の lastPostAt を使用 → 2099年が返される。この場合は固定スレッドしかないため、永久304は正しい動作（更新がないため）
- 既存テスト17件 + 新規テスト5件 = 全22件PASS
- DAT route は個別スレッドの lastPostAt を使うため影響なし

---

## Phase 3: 再発防止

### Q7. どうすれば防げていたか

Route handler テストに「固定スレッド混在ケース」があれば防げた。これは**テスト層の不足**ではなく**テストケースの不足**である。

### Q8. 今後の再発防止策

| 種別 | 施策 | 対象 |
|------|------|------|
| 検出 | Route handler テストに固定スレッド混在ケースを追加（実施済み、5件） | `route.test.ts` |
| 防止 | 機能横断データ組み合わせの観点をテスト設計時に意識する | 開発プロセス |

**重要な知見:** 過去の専ブラ関連バグを分析した結果、いずれも既存のテスト層にケースを追加すれば検出可能だった。新しいテスト層やテストアーキテクチャの導入は不要。

| 過去の事象 | 検出可能だった既存テスト層 |
|------------|--------------------------|
| 本件（永久304） | Route handler テスト（機能横断データ） |
| 絵文字文字化け（senbra_compat_guide §3） | ShiftJisEncoder 単体テスト |
| 異体字セレクタ文字化け（同 §3補足） | ShiftJisEncoder 単体テスト |
| 専ブラ絵文字書き込み文字化け（同 §4） | bbs.cgi route テスト |

### Q9. 同じ構造の問題

DAT route は個別スレッドの lastPostAt を使用するため、本件と同じ問題は発生しない。subject.txt route が唯一の影響箇所。

「マジックバリューが想定外の箇所に漏洩する」というパターンとしては、`isPinned` のソート用マジック値（2099年）がDB設計に起因する。将来的に isPinned の実現方法を専用のソートカラム等に変更すれば、この種の漏洩リスク自体がなくなる。ただし現時点ではスコープ外。
