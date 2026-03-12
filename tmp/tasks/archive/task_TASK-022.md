---
task_id: TASK-022
sprint_id: Sprint-9
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-13T10:00:00+09:00
updated_at: 2026-03-13T10:00:00+09:00
locked_files:
  - "[NEW] src/lib/infrastructure/adapters/dat-formatter.ts"
  - "[NEW] src/lib/infrastructure/adapters/subject-formatter.ts"
  - "[NEW] src/lib/infrastructure/adapters/bbs-cgi-parser.ts"
  - "[NEW] src/lib/infrastructure/adapters/bbs-cgi-response.ts"
  - "[NEW] src/lib/infrastructure/encoding/shift-jis.ts"
  - "[NEW] src/lib/infrastructure/adapters/__tests__/dat-formatter.test.ts"
  - "[NEW] src/lib/infrastructure/adapters/__tests__/subject-formatter.test.ts"
  - "[NEW] src/lib/infrastructure/adapters/__tests__/bbs-cgi-parser.test.ts"
  - "[NEW] src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts"
---

## タスク概要

5ch専用ブラウザ（専ブラ）互換のためのAdapter層コア実装を行う。Shift_JISエンコーディング変換、DATフォーマット構築、subject.txt構築、bbs.cgiリクエストパース、bbs.cgiレスポンス構築の5コンポーネントを実装する。各コンポーネントはHTTPコンテキストに依存しない純粋変換処理として実装し、vitestで単体テストを行う。

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature` — 全20シナリオ（BDDステップ定義は後続TASK-024で実装）

## 必読ドキュメント（優先度順）

1. [必須] `features/constraints/specialist_browser_compat.feature` — 専ブラ互換シナリオ
2. [必須] `docs/architecture/components/senbra-adapter.md` — 専ブラAdapter設計書
3. [参考] `docs/specs/openapi.yaml` — 専ブラ互換API部分
4. [参考] `docs/architecture/architecture.md` — §6 専ブラ互換APIアーキテクチャ
5. [参考] `docs/requirements/ubiquitous_language.yaml`

## 入力（前工程の成果物）

- `src/lib/domain/models/` — Post, Thread 等のドメインモデル型定義
- `src/lib/infrastructure/repositories/` — PostRepository, ThreadRepository

## 出力（生成すべきファイル）

- `src/lib/infrastructure/encoding/shift-jis.ts` — ShiftJisEncoder (UTF-8 ↔ Shift_JIS)
- `src/lib/infrastructure/adapters/dat-formatter.ts` — DAT形式テキスト構築
- `src/lib/infrastructure/adapters/subject-formatter.ts` — subject.txt構築
- `src/lib/infrastructure/adapters/bbs-cgi-parser.ts` — bbs.cgiリクエストパーサー
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — bbs.cgiレスポンスHTML生成
- 上記各ファイルのvitestテスト (`__tests__/` 配下)

## 完了条件

- [ ] 5コンポーネントが実装されている（ShiftJisEncoder, DatFormatter, SubjectFormatter, BbsCgiParser, BbsCgiResponseBuilder）
- [ ] DATフォーマット: `名前<>メール<>YYYY/MM/DD(曜) HH:mm:ss.SS ID:dailyId<>本文(<br>区切り)<>スレッドタイトル(1行目のみ)\n`
- [ ] subject.txt: `{threadKey}.dat<>{title} ({postCount})\n`
- [ ] HTMLエスケープ: `<script>` → `&lt;script&gt;` 等
- [ ] 改行変換: `\n` → `<br>`
- [ ] BOTマーク絵文字 → `[BOT]` テキスト置換（DAT出力時）
- [ ] 単体テスト全件PASS: `npx vitest run`
- [ ] 既存BDDテスト56シナリオが壊れていないこと: `npx cucumber-js`

## スコープ外

- Route Handler実装（TASK-023で実施）
- BDDステップ定義（TASK-024で実施）
- Range差分応答の実装（TASK-023で実施）
- cucumber.js の更新（TASK-024で実施）

## 補足・制約

- `iconv-lite` パッケージを使用してShift_JIS変換を行う（既にpackage.jsonに含まれているか確認し、なければ `npm install iconv-lite` で追加）
- D-08 senbra-adapter.md §2の公開インターフェースに準拠すること
- Application Layer（サービス層）にはShift_JIS関連の処理が一切漏出しないこと
- locked_files外のファイルを変更する必要が生じた場合はエスカレーションすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 5コンポーネント全実装 + 単体テスト全PASS + BDDテスト維持確認
- 次にすべきこと: なし（完了）
- 未解決の問題: なし

### 進捗ログ

- [完了] iconv-lite がpackage.jsonに含まれることを確認 (^0.7.2)
- [完了] ShiftJisEncoder 実装: `src/lib/infrastructure/encoding/shift-jis.ts`
  - テスト: `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts` (9テスト PASS)
- [完了] DatFormatter 実装: `src/lib/infrastructure/adapters/dat-formatter.ts`
  - DATフォーマット・HTML特殊文字エスケープ・BOT絵文字置換・改行<br>変換・isDeleted対応
  - calcShiftJisLineBytes()ユーティリティ実装（Range差分応答用バイト数計算）
  - テスト: `src/lib/infrastructure/adapters/__tests__/dat-formatter.test.ts` (15テスト PASS)
- [完了] SubjectFormatter 実装: `src/lib/infrastructure/adapters/subject-formatter.ts`
  - isDeleted=trueスレッド除外対応
  - テスト: `src/lib/infrastructure/adapters/__tests__/subject-formatter.test.ts` (8テスト PASS)
- [完了] BbsCgiParser 実装: `src/lib/infrastructure/adapters/bbs-cgi-parser.ts`
  - URLSearchParams + cookieヘッダ → BbsCgiParsedRequest変換
  - テスト: `src/lib/infrastructure/adapters/__tests__/bbs-cgi-parser.test.ts` (12テスト PASS)
- [完了] BbsCgiResponseBuilder 実装: `src/lib/infrastructure/adapters/bbs-cgi-response.ts`
  - buildSuccess / buildError / buildAuthRequired の3メソッド実装
  - （locked_filesにテストファイルの記載なし、BbsCgiResponseBuilderのテストはBDDステップで検証予定）

### テスト結果サマリー

#### 単体テスト (npx vitest run)
- テストファイル: 13 passed
- テスト総数: 396 passed (新規44テスト + 既存352テスト)
- 新規テスト内訳:
  - ShiftJisEncoder: 9テスト PASS
  - DatFormatter: 15テスト PASS
  - SubjectFormatter: 8テスト PASS
  - BbsCgiParser: 12テスト PASS

#### BDDテスト (npx cucumber-js)
- 56 scenarios (56 passed)
- 303 steps (303 passed)
- 既存テスト全件維持確認済み
