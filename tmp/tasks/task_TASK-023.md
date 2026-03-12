---
task_id: TASK-023
sprint_id: Sprint-9
status: completed
assigned_to: bdd-coding
depends_on: [TASK-022]
created_at: 2026-03-13T11:00:00+09:00
updated_at: 2026-03-13T11:00:00+09:00
locked_files:
  - "[NEW] src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts"
  - "[NEW] src/app/(senbra)/[boardId]/subject.txt/route.ts"
  - "[NEW] src/app/(senbra)/[boardId]/SETTING.TXT/route.ts"
  - "[NEW] src/app/(senbra)/test/bbs.cgi/route.ts"
  - "[NEW] src/app/(senbra)/bbsmenu.html/route.ts"
  - "[NEW] src/app/(senbra)/layout.tsx"
---

## タスク概要

5ch専用ブラウザ互換のRoute Handlerを実装する。TASK-022で実装されたAdapter層コンポーネント（DatFormatter, SubjectFormatter, BbsCgiParser, BbsCgiResponseBuilder, ShiftJisEncoder）を組み合わせて、専ブラが期待する各エンドポイントを提供する。Range差分応答・If-Modified-Since 304応答も実装する。

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature` — 全20シナリオ（BDDステップ定義は後続TASK-024で実装）

## 必読ドキュメント（優先度順）

1. [必須] `features/constraints/specialist_browser_compat.feature` — 専ブラ互換シナリオ
2. [必須] `docs/architecture/components/senbra-adapter.md` — 専ブラAdapter設計書（§4 Range差分応答、§5 依存関係）
3. [必須] `docs/specs/openapi.yaml` — 専ブラ互換API仕様部分
4. [参考] `docs/architecture/architecture.md` — §6 専ブラ互換APIアーキテクチャ
5. [参考] TASK-022で実装されたAdapterコンポーネント群

## 入力（前工程の成果物）

- `src/lib/infrastructure/adapters/dat-formatter.ts` — DatFormatter（TASK-022）
- `src/lib/infrastructure/adapters/subject-formatter.ts` — SubjectFormatter（TASK-022）
- `src/lib/infrastructure/adapters/bbs-cgi-parser.ts` — BbsCgiParser（TASK-022）
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — BbsCgiResponseBuilder（TASK-022）
- `src/lib/infrastructure/encoding/shift-jis.ts` — ShiftJisEncoder（TASK-022）
- `src/lib/services/post-service.ts` — 書き込みサービス（既存）
- `src/lib/infrastructure/repositories/thread-repository.ts` — スレッドリポジトリ（既存）
- `src/lib/infrastructure/repositories/post-repository.ts` — レスリポジトリ（既存）

## 出力（生成すべきファイル）

- `src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts` — DATファイル取得（Range差分対応）
- `src/app/(senbra)/[boardId]/subject.txt/route.ts` — スレッド一覧
- `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` — 板設定
- `src/app/(senbra)/test/bbs.cgi/route.ts` — 書き込みAPI
- `src/app/(senbra)/bbsmenu.html/route.ts` — 板一覧メニュー
- `src/app/(senbra)/layout.tsx` — 専ブラルートグループレイアウト（必要に応じて）

## 完了条件

- [ ] 5つのRoute Handlerが実装されている
- [ ] レスポンスはShift_JIS（CP932）エンコードである
- [ ] Content-Typeヘッダにcharset=Shift_JISが含まれる
- [ ] DATファイルのRange差分応答（206 Partial Content）が実装されている
- [ ] If-Modified-Since による 304 Not Modified が実装されている
- [ ] bbs.cgiのPOSTでShift_JISデコード → UTF-8変換が行われる
- [ ] 単体テスト全件PASS: `npx vitest run`
- [ ] 既存BDDテスト56シナリオが壊れていないこと: `npx cucumber-js`

## スコープ外

- BDDステップ定義（TASK-024で実施）
- cucumber.js の更新（TASK-024で実施）
- 専ブラの認証フロー詳細（認証コードの専ブラ向けUXはPhase 2以降）
- HTTPSリダイレクト・WAFの設定（インフラレベル、Vercel設定で対応）

## 補足・制約

- Route HandlerからはServiceとRepository層の既存公開関数のみを呼び出すこと（Adapterは変換のみ、ビジネスロジックなし）
- Shift_JIS変換はRoute Handler層で行う（Application Layerに漏出させない）
- bbs.cgiのRoute Handlerパスについて: Next.js App Routerでは `bbs.cgi` のように拡張子付きのパスは直接表現できないため、`test/bbs.cgi/route.ts` やcatchallなど適切な方式を選択すること
- locked_files外のファイルを変更する必要が生じた場合はエスカレーションすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 6ファイル実装、単体テスト40件追加、全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [2026-03-13] タスク開始。必読ドキュメント・既存実装コードを確認
- [2026-03-13] layout.tsx 実装完了
- [2026-03-13] bbsmenu.html/route.ts 実装完了
- [2026-03-13] [boardId]/SETTING.TXT/route.ts 実装完了
- [2026-03-13] [boardId]/subject.txt/route.ts 実装完了（If-Modified-Since 304対応）
- [2026-03-13] [boardId]/dat/[threadKey].dat/route.ts 実装完了（Range 206対応、If-Modified-Since 304対応）
- [2026-03-13] test/bbs.cgi/route.ts 実装完了（Shift_JIS inbound デコード、スレッド作成/書き込み分岐）
- [2026-03-13] 単体テスト src/app/(senbra)/__tests__/route-handlers.test.ts 40件実装
- [2026-03-13] npx vitest run: 436/436 PASS
- [2026-03-13] npx cucumber-js: 62/62 PASS

### テスト結果サマリー
- 単体テスト: 436件 PASS（既存396件 + 新規40件）
- BDDテスト: 62シナリオ PASS（専ブラ互換ステップ定義はTASK-024で実装予定）
- 既存テスト破壊: なし
