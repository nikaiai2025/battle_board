---
task_id: TASK-054
sprint_id: Sprint-19
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-054
depends_on: []
created_at: 2026-03-15T03:30:00+09:00
updated_at: 2026-03-15T03:30:00+09:00
locked_files: []
---

## タスク概要

ChMateがbbs.cgiレスポンスのSet-Cookie（edge-token）を保持しない根本原因を調査し、Cookie永続化の正攻法を設計する。

**背景**:
- write_token永続化（案G）は「mail欄が実質使用不可能になる」「承認済み仕様のワンタイム・10分を変更する正当性がない」として人間に却下された
- 根本原因は「ChMateがbbs.cgiレスポンスのSet-Cookieヘッダからedge-token Cookieを保持しない」こと
- 回避策ではなく、Cookie永続化の正攻法で解決すべき

**調査すべき事項**:

1. **ChMateのCookie保持メカニズムの解明**
   - ChMateは「どの条件で」Set-CookieをCookie Jarに保存するのか
   - Cookie名のホワイトリスト方式なのか、HTMLレスポンスの特定パターン（`<title>書き込み確認</title>`等）がトリガーなのか
   - 5chの実際のbbs.cgiがどのようにCookieを発行しているか（2フェーズコミット方式の詳細）

2. **書き込み確認フロー（2フェーズコミット）の実現可能性**
   - `docs/research/research_merged.md` に記述がある「書き込み確認画面」方式
   - `<title>書き込み確認</title>` + Set-Cookie → 専ブラが自動再送（Cookie付き）
   - ChMateでこのフローが実際に機能するか（5chプロトコル標準機能として）
   - 2回目のPOST（自動再送）時にPOSTパラメータがそのまま維持されるか

3. **5ch本家のCookie発行フローの調査**
   - 5chのbbs.cgiは初回POSTに対してどのようなレスポンスを返すか
   - Cookie名は何か（PON, HAP, yuki 等の標準名）
   - ChMateが保持するCookie名の一覧

4. **代替アプローチの検討**
   - edge-tokenのCookie名を5ch標準名（例: `PON`, `HAP`）に変更する案の再評価
   - 書き込み確認フロー + 標準Cookie名の組み合わせ
   - edge-tokenをedge-token名のままで書き込み確認フローで定着させる案

## 必読ドキュメント（優先度順）
1. [必須] `docs/research/research_merged.md` — 5chプロトコル調査（書き込み確認フローの記述を含む）
2. [必須] `tmp/workers/bdd-architect_TASK-052/analysis.md` — 前回のアーキテクト分析（案A〜G）
3. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — 現在のbbs.cgiルート実装
4. [参考] `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — レスポンスHTML生成
5. [参考] `tmp/escalations/archive/escalation_ESC-AUTH-REVIEW-1.md` — 承認済み認証設計

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-054/analysis.md` — 調査結果と設計提案

## 完了条件
- [ ] ChMateのCookie保持メカニズムについて、既知の情報を整理した
- [ ] 書き込み確認フロー（2フェーズコミット）の実装仕様を策定した（実現可能な場合）
- [ ] 5ch本家のCookie発行フローを調査・整理した
- [ ] 推奨案が「従来のwrite_token仕様（ワンタイム・10分有効）を変更しない」ことを満たすか確認した
- [ ] BDDシナリオ変更が必要な場合、その内容を明示した

## スコープ外
- 実装作業（調査・設計のみ）
- write_token仕様の変更（ワンタイム・10分は維持する前提）

## 補足・制約

### 人間からの指摘（設計判断の基準）
- 「従来の方式が絶対に不可能であることを証明できない限り、write_token仕様変更は受け入れない」
- 「メールアドレス欄が実質使用不可能になるデメリットを考慮すべき」
- 「バグの本質に向き合わず回避的な解決をするのは技術負債」

### 重要な制約
- write_tokenの仕様（ワンタイム・10分有効）は人間承認済み（ESC-AUTH-REVIEW-1）であり変更不可
- 解決策はCookie永続化の正攻法であること（mail欄にトークンを常駐させない）
- 解決策がChMateの内部実装に過度に依存しないこと（5chプロトコル標準の範囲内で解決するのが望ましい）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全項目
- 次にすべきこと: 人間レビュー → BDDシナリオ変更承認 → 実機検証 → 実装タスク起票
- 未解決の問題: 実機検証が未実施（設計上の前提はリサーチドキュメントとeddist運用実績に基づく）

### 進捗ログ

#### 2026-03-15 調査・分析完了

**読んだドキュメント:**
- `docs/research/research_merged.md` — 書き込み確認フロー仕様
- `docs/old/research_by_3.1pro.md` — 2フェーズコミットの詳細仕様（titleパターンマッチ一覧表）
- `docs/research/eddist_edge_token_ip_report_2026-03-14.md` — eddistのedge-token発行方式
- `docs/research/eddist_auth_research_2026-03-04.md` — eddist認証アーキテクチャ
- `docs/research/chmate_debug_report_2026-03-14.md` — ChMate接続問題の経緯
- `tmp/workers/bdd-architect_TASK-052/analysis.md` — 前回分析（案A-G）
- `tmp/workers/bdd-architect_TASK-048/analysis.md` — 本番問題分析
- `tmp/escalations/archive/escalation_ESC-AUTH-REVIEW-1.md` — 承認済み認証設計
- `src/app/(senbra)/test/bbs.cgi/route.ts` — 現在のbbs.cgi実装
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — レスポンスHTML生成
- `src/lib/services/auth-service.ts` — 認証サービス
- `src/lib/infrastructure/adapters/bbs-cgi-parser.ts` — リクエストパーサー
- `features/constraints/specialist_browser_compat.feature` — 専ブラBDDシナリオ
- `features/phase1/authentication.feature` — 認証BDDシナリオ

**核心的発見:**
TASK-052の前提「ChMateはedge-tokenという非標準Cookie名を無視する」は誤り。eddistは同名Cookieで運用実績あり。根本原因はCookie名ではなく、レスポンスHTMLの`<title>`が5chプロトコル標準の「書き込み確認」パターンに合致していないため、ChMateがSet-Cookieを処理しないこと。

**出力:**
- `tmp/workers/bdd-architect_TASK-054/analysis.md` — 調査結果と設計提案

**完了条件チェック:**
- [x] ChMateのCookie保持メカニズムについて、既知の情報を整理した
- [x] 書き込み確認フロー（2フェーズコミット）の実装仕様を策定した
- [x] 5ch本家のCookie発行フローを調査・整理した
- [x] 推奨案がwrite_token仕様（ワンタイム・10分有効）を変更しないことを確認した
- [x] BDDシナリオ変更が必要な場合、その内容を明示した（8.1, 8.2節）
