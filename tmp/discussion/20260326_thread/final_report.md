# 敵対的コードレビュー 最終レポート

- 実施日: 2026-03-26
- 対象: `thread.feature` (41シナリオ)
- レビュー単位数: 6
- 指摘総数: 18 / 採用: 11 / 却下: 7

---

## 採用された問題

### 1. 削除済みスレッドがURL直接アクセスで閲覧可能
- 問題ID: ATK-004-2
- 重大度: CRITICAL
- 対象シナリオ: URL構造（@url_structure）
- ファイル: `src/lib/infrastructure/repositories/thread-repository.ts` (findById:76, findByThreadKey:97)
- 詳細: `findById`と`findByThreadKey`に`is_deleted=false`フィルタがない。`findByBoardId`にはフィルタがある非対称実装。管理者`softDelete`済みスレッドがUUID/threadKeyを知るユーザーに閲覧可能。
- 防御側見解: 問題を認める。管理者削除APIは実装済みで即座に再現する。

### 2. 本番`findByThreadId`にis_deletedフィルタなし（InMemoryにはあり）
- 問題ID: ATK-003-1
- 重大度: HIGH
- 対象シナリオ: スレッド閲覧 + 固定スレッド
- ファイル: `src/lib/infrastructure/repositories/post-repository.ts` (findByThreadId:142-146)
- 詳細: 本番実装は`is_deleted`フィルタなし、InMemory実装は`!p.isDeleted`あり。削除済みレスがスレッド閲覧時に露出する。テスト基盤の非対称性で検出不能。
- 防御側見解: 認める。削除は管理者専用で発生頻度は低い。

### 3. 存在しないスレッドへの書き込みがFK制約エラーまで到達
- 問題ID: ATK-003-2
- 重大度: HIGH
- 対象シナリオ: 固定スレッド（@pinned_thread）
- ファイル: `src/lib/services/post-service.ts` (isPinned guard:330)
- 詳細: `targetThread`がnullの場合`null?.isPinned===undefined`でガードスルー。FK制約エラーが外部に漏洩。posting.feature ATK-002-3と同一の既知問題。
- 防御側見解: 認める。BDDテストは必ずスレッドを事前作成するため経路未検証。

### 4. createThread部分失敗で孤児スレッド残存
- 問題ID: ATK-001-2
- 重大度: HIGH
- 対象シナリオ: スレッド作成
- ファイル: `src/lib/services/post-service.ts` (createThread)
- 詳細: Step 4でスレッドINSERT成功後、Step 5のcreatePostが失敗してもロールバックなし。レスなしスレッドがDBに恒久的に残る。
- 防御側見解: 認める。発生ウィンドウは狭いが現実的。

### 5. createThread戻り値のdailyId:"unknown"ハードコード
- 問題ID: ATK-001-1
- 重大度: HIGH
- 対象シナリオ: スレッド作成
- ファイル: `src/lib/services/post-service.ts` (createThread:938)
- 詳細: `firstPost`のdailyIdに`"unknown"`がハードコード。BDDテストはInMemoryから直接取得するため見逃す。現時点で`firstPost.dailyId`を参照するコードパスはゼロ。
- 防御側見解: 限定的同意。ユーザー露出経路がないため潜在的技術負債。

### 6. 「一覧外スレッドへの直接アクセス」テストの前提条件が偽
- 問題ID: ATK-002-1
- 重大度: HIGH
- 対象シナリオ: スレッド一覧
- ファイル: `features/step_definitions/thread.steps.ts:575-601`
- 詳細: Givenステップが`demoteOldestActiveThread`を呼ばず、対象スレッドは`isDormant=false`のまま。「一覧外」が「一覧内」で検証されている。
- 防御側見解: 認める。前提条件の偽造は常時発生。

### 7. 「最古スレッド不在」の検証が件数チェックのみ
- 問題ID: ATK-002-3
- 重大度: HIGH
- 対象シナリオ: スレッド一覧
- ファイル: `features/step_definitions/thread.steps.ts:469-478`
- 詳細: `threadListResult.length === 50`のみ。保存済み`_oldestThreadId`を参照せず、sort方向逆転などの現実的バグをすり抜ける。
- 防御側見解: 認める。

### 8. ポーリングAPIが全件取得
- 問題ID: ATK-005-1
- 重大度: HIGH
- 対象シナリオ: ページネーション + ポーリング
- ファイル: `src/app/api/threads/[threadId]/route.ts:49`
- 詳細: スレッド詳細APIが`findByThreadId`を上限なしで呼び出し。1000件超スレッドで30秒ごとに全件DBスキャン+転送。
- 防御側見解: 限定的同意。MVPでは限定的だがスケール時のパフォーマンス劣化リスク。

### 9. ページネーション閾値の検証ズレ
- 問題ID: ATK-005-3
- 重大度: HIGH
- 対象シナリオ: ページネーション
- ファイル: `features/step_definitions/thread.steps.ts`
- 詳細: ステップの`total <= 100`と実装の`postCount > 50`が乖離。51〜100件スレッドでの閾値変更バグを検出できない。
- 防御側見解: 認める。

### 10. アンカーポップアップのstopPropagation欠落
- 問題ID: ATK-006-1
- 重大度: HIGH
- 対象シナリオ: アンカーポップアップ（@anchor_popup）
- ファイル: `src/app/(web)/_components/AnchorLink.tsx:51`
- 詳細: `handleClick`に`stopPropagation()`なし。ポップアップ表示中に外部アンカークリックで新ポップアップが即閉鎖される。
- 防御側見解: 限定的同意。UI機能不全でありデータ損失ではない。

### 11. @fabシナリオのステップ定義未実装
- 問題ID: ATK-006-2
- 重大度: HIGH
- 対象シナリオ: FAB（@fab 非@wip 2件）
- ファイル: ステップ定義なし（全ステップundefined）
- 詳細: `cucumber.js`にstrict設定なくundefinedシナリオがスキップでCIグリーン。受け入れ基準が形骸化。
- 防御側見解: 限定的同意。`return "pending"`のステップ定義追加で即時対処可能。

---

## アーキテクト評価

| 問題ID | 概要 | アーキテクト判定 | 修正方針 |
|--------|------|----------------|---------|
| ATK-004-2 | 削除済みスレッドがURL直接アクセスで閲覧可能 | **対応必須** | Repository層で`findById`/`findByThreadKey`に`is_deleted=false`フィルタ追加。AdminServiceの`findById`呼び出しには`includeDeleted`オプション追加 |
| ATK-003-1 | 本番`findByThreadId`にis_deletedフィルタなし | **対応必須** | `findByThreadId`に`.eq("is_deleted", false)`追加。InMemoryとの非対称性も解消 |
| ATK-003-2 | 存在しないスレッドへの書き込みFK制約エラー | 従属（posting.feature ATK-002-3と同一） | posting.featureレビューで検出済みの既知問題 |
| ATK-001-2 | createThread部分失敗で孤児スレッド残存 | 対応推奨 | Supabase RPCまたは補償トランザクション |
| ATK-001-1 | dailyId:"unknown"ハードコード | 対応推奨 | createPost戻り値のdailyIdを使用 |
| ATK-002-1 | テストの前提条件偽造 | テスト修正 | ステップに`demoteOldestActiveThread`追加 |
| ATK-002-3 | 件数チェックのみのテスト | テスト修正 | `_oldestThreadId`の不在検証追加 |
| ATK-005-1 | ポーリングAPI全件取得 | 技術負債 | `fromPostNumber`差分取得への改修 |
| ATK-005-3 | 閾値の検証ズレ | テスト修正 | ステップ閾値を実装と一致させる |
| ATK-006-1 | アンカーポップアップstopPropagation欠落 | UIバグ修正 | `AnchorLink.tsx`に`e.stopPropagation()`追加 |
| ATK-006-2 | @fabステップ定義未実装 | テスト修正 | `return "pending"`のステップ定義追加 |
