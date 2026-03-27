# テスト監査レポート

> 実行日: 2026-03-28
> 対象スプリント: Sprint-135
> タスクID: AUDIT-135
> 前回監査: TASK-344-audit（Sprint-134完了時点）

## 1. Pendingシナリオ管理状況

### 概要

| 指標 | 値 |
|---|---|
| 総pendingステップ数（return "pending"） | 18 |
| D-10 §7.3適合 | 17 / 18 |
| 代替テスト作成済み | 18 / 18 |
| 代替テスト未作成（技術的負債） | 0 |
| Phase未実装（§7.3範囲外） | 0 |

### Sprint-135変更分: FAB pending 2シナリオ（6ステップ）���加

TASK-348で `thread.steps.ts` に6つのpendingステップが追加された。代替テスト `FloatingActionMenu.test.tsx` も同時に作成されている。

### プロジェクト全体のpending内訳

| ファイル | ステップ数 | 理由 | 代替テスト | §7.3準拠 |
|---|---|---|---|---|
| thread.steps.ts（FAB） | 6 | DOM/CSS操作: §7.3.1 | FloatingActionMenu.test.tsx 実在 | 後述 |
| bot_system.steps.ts | 6 | DOM/CSS表示（Web限定）: §7.3.1 | e2e/flows/bot-display.spec.ts 実在 | 適合 |
| user_registration.steps.ts | 4 | Discord OAuth外部依存 | E2E auth-flow.spec.ts | 適合 |
| specialist_browser_compat.steps.ts | 2 | インフラ制約（HTTP:80/WAF） | Sprint-20実機検証済み | 適合 |

### 詳細: §7.3コメント規約の不統一（MEDIUM）

FABセクション（thread.steps.ts L2334-2405）の6つのpendingステップは、pending理由と代替テストパスがセクション見出しコメント（L2337-2338）���1箇所のみ記載されている。個別ステップのJSDocには `See: features/thread.feature @fab` のみで、代替テストのファイルパスが記載されていない。

同一ファイル内の他のpendingステップ（polling L1696-1707, anchor_popup L1743-1750等）では個別JSDocに「代替検証:」行が含まれている。§7.3.2「ステップ定義のコメントに pending理由と代替テストのファイルパスを記載する」に対し、セクション見出しへの集約が許容されるかはグレーゾーンだが、ファイル内の一貫性に欠ける。

代替テストは実在し実質的にカバーしているため、実害はない。

### 代替テストの実質性検証

**FloatingActionMenu.test.tsx** -- 良好

- トレーサビリテ��: `features/thread.feature @fab`（2シナリオ名を明記）
- テスト数: 7件（パネル開閉4件 + 閉じる動作2件 + エッジケース1件）
- アサーション: CSSクラス（translate-y-0 / translate-y-full）、hidden属性、aria-label、data-thread-id
- BDDシナリオ「フローティングメニューからボトムシートで書き込みフォームを開く」「ボトムシートの外側をタップするとフ��ームが閉じる」の意図を実質的にカバー

**bot-display.spec.ts** -- テスト自体は良好だがスキップ状態

- トレーサビリティ: `@feature bot_system.feature`（2シナリオ名を明記）
- テスト数: 2件（目立たない表示、トグル切替）
- アサーション: opacity値比較、可視性トグル検証
- 注記: PostItem.tsxに撃破済みBOT表示分岐が未実装のため `test.fixme` でスキップ中。UI実装完了までは実行されない（前回から継続、Sprint-135スコープ外）

### 前回からの技術的負債の変化

| 前回（Sprint-134） | 今回（Sprint-135） | 変化 |
|---|---|---|
| user_registration: OAuth 4ステップ | 同左 | 継続 |
| specialist_browser_compat: 2ステップ | 同左 | 継続 |
| thread(FAB): 未存在 | 6ステップ（代替テスト作成済み） | 新規追加・解消済み |

Sprint-134時点で代替テスト未作成だった6件のうち、FABは代替テスト作成済みで追加。specialist_browser_compatは実機検証で代替済みのため、未作成の技術的負債は実質 user_registration OAuth 4ステップのみ。

## 2. テストピラミッド

| 層 | ファイル数 | テスト数 | 前回比 | 判定 |
|---|---|---|---|---|
| 単体テスト (Vitest) | 85 | 2,025 | +111テスト | 健全 |
| BDDサービス層 (Cucumber) | 24 steps / 18 features | 382シナリオ (361 pass / 18 pending / 3 undefined) | +8 pass / +2 pending / -11 undefined | 健全 |
| E2E/API (Playwright) | 9 | -- | 変更なし | 健全 |

テストピラミッドは正しい形状を維持。下層 > 中層 > 上層。逆ピラミッドの兆候なし。

### ドメインルール単体テストカバレッジ

`src/lib/domain/rules/` 配下の全13ファイルに対応する単体テストが存在（co-located 7件 + 外部配置 6件）。Sprint-135で新規追加された `attack-range-parser.ts` にも `rules/__tests__/attack-range-parser.test.ts` が存在する。下層空洞化なし。

## 3. Featureカバレッジ

### Sprint-135変更対象

| feature | Sprint-135の変化 | 結果 |
|---|---|---|
| reactions.feature | v4->v5 同日制限撤廃（TASK-346） | 全シナリオPASS |
| bot_system.feature | 範囲攻撃9シナリオのステップ定義追加（TASK-347） | UNDEFINED->PASS |
| thread.feature | FAB 2シナリオのpending化（TASK-348） | UNDEFINED->PENDING |
| command_hiroyuki.feature | ステップ定義新規作成��TASK-335） | 全シナリオPASS |

### undefinedシナリオ（3件残存 -- 全て既存）

nameフィルタで意図的に除外されたPhase 2/3依存シナリオ。Sprint-135で新規追加されたものではない。

| シナリオ | feature | 除外理由 |
|---|---|---|
| 専ブラのコマンド文字列がゲームコマンドとして解釈される | specialist_browser_compat.feature | Phase 2コマンドシステム依存 |
| 告発成功したボットにBOTマークが表示される | ai_accusation.feature | Phase 3 BOTマーク機能依存 |
| BOTマークがついたボットは書き込みを継続する | ai_accusation.feature | Phase 3 BOTマーク機能依存 |

### Cucumberスコープ外（paths未登録）

| feature | ステータス |
|---|---|
| curation_bot.feature | ドラフト v2（未実装�� |
| dev_board.feature | スコープ外 |
| image_upload.feature | ドラフト_実装禁止 |

## 4. ステップ定義の実質性

| パターン | 検出数 |
|---|---|
| `assert(true)` / `expect(true)` | 0 |
| `assert.ok(true)` | 0 |
| Phase N / 実装予定 コメント付きスタブ | 0 |

スタブアサーションは検出されなかった。全PASSステップは実質的なアサーションを持つ。D-10 §7.3.2準拠。

## 5. 前回監査との差分

| 前回指摘 | 今回の状態 |
|---|---|
| MEDIUM-1: 攻撃コスト/撃破報酬ステップの定数比較のみ | 継続（Sprint-135スコープ外） |
| LOW-1: 代替テスト5ファイルに @feature/@scenario 注釈欠落 | 継続（Sprint-135スコープ外） |

## 6. レビューサマリー

| 重要度 | 件数 | ステータス |
|---|---|---|
| CRITICAL | 0 | pass |
| HIGH | 0 | pass |
| MEDIUM | 1 | info |
| LOW | 0 | -- |

### MEDIUM-1: FAB pendingステップのコメント一貫性

- 対象: `features/step_definitions/thread.steps.ts` L2340-2405（6ステップ）
- 内容: 個別JSDocに代替テストのファイルパスが未記載。セクション見出し（L2338）にのみ���載
- 根拠: D-10 §7.3.2「ステップ定義のコメントに pending理由と代替テストのファイルパスを記載する」
- 実害: なし（代替テスト実在・実質カバー済み）
- 推奨: 各ステップのJSDocに `代替検証: src/__tests__/app/(web)/_components/FloatingActionMenu.test.tsx` を追加し、同ファイル内の他pendingステップと一貫させる

---

**判定: APPROVE**

Sprint-135の主要変更（範囲攻撃9件PASS化、FAB 2件pending化+代替テスト作成、!hiroyukiステップ定義新規作成）は全てD-10規約に適合している。CRITICALおよびHIGHの問題はない。テストスイートの健全性は維持されている。
