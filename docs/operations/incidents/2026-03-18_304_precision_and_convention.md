# 304精度バグ共通化 + InMemory規約の明文化

- **日付:** 2026-03-18
- **担当:** bdd-architect
- **前提:** `2026-03-18_inmemory_uuid_validation.md` の後続対応

---

## 1. InMemory UUID バリデーション規約の明文化

前回の UUID バリデーション追加（60箇所）を受け、今後の新規実装で同じルールが守られるよう規約として明文化した。

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `docs/architecture/bdd_test_strategy.md` §2 | 「インメモリ実装の設計方針」にUUID形式バリデーション規約を1項目追加 |
| `.claude/agents/bdd-coding.md` | 「InMemoryリポジトリの規約」セクションを新設。§2への参照リマインド |

### 判断根拠

- 規約の正本は bdd_test_strategy.md §2（InMemoryリポジトリの設計方針を定義するセクション）
- CLAUDE.md（全エージェント向け憲法）には粒度が細かすぎるため不採用
- bdd-coding.md にはリマインド（3行 + 参照先）のみ記載。AIエージェントが毎回 §2 を読みに行く保証がないため、直接目に入る場所に配置

---

## 2. 残存リスク分析（UNIQUE / NOT NULL）

LL-002 で掲げた3制約のうち、UUID形式以外の2つ（UNIQUE制約、NOT NULL制約）について、DBスキーマ全体を精査した。

### 結論: 即時対応は不要

| 制約 | 判断 | 理由 |
|------|------|------|
| UNIQUE制約 | 対応不要 | サービス層の事前チェック + BDDシナリオの二重防御あり。UUIDバグとはリスク構造が異なる |
| NOT NULL制約 | 対応不要 | TypeScript型定義が事実上のNOT NULL制約として機能。ランタイムチェックの費用対効果が低い |

UUIDバグは「サービス層に防御がなく、テストでも検出できない盲点」だったから致命的だった。UNIQUE/NOT NULLにはそのような盲点が現時点で確認されない。

---

## 3. 304 Not Modified 精度バグ — DRY違反の共通化

### 事象

subject.txt route の 304 判定で、HTTP日付（秒精度）とDB日付（ミリ秒精度）を直接比較していた。同一秒内の更新が検出されず、専ブラに 304（変更なし）が誤返却されていた。DAT route には正しい実装（秒単位正規化）が既に存在しており、DRY違反が根本原因。

### BDDテストが検出できなかった理由

BDDステップ定義が Route Handler を呼ばず、304判定ロジックを自前で再実装していた。テスト側の実装は正しかったため、Route Handler がバグっていてもテストは永久にGREEN。これはBDDサービス層テストの設計上の限界（HTTP層を経由しない）であり、APIテスト層の責務。

### 対応

304判定ロジックを共通関数に抽出し、DRY違反を解消。

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/infrastructure/adapters/http-cache.ts` | **新規作成** — `isNotModifiedSince(entityDate, ifModifiedSince)` |
| `src/app/(senbra)/[boardId]/subject.txt/route.ts` | インライン304判定（15行）→ 共通関数呼び出し（4行）に置換 |
| `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` | 同上 |

### 効果

- 秒精度正規化のロジックが1箇所に集約。今後の新規routeでの再実装ミスを防止
- 既存の単体テスト（`route.test.ts` 13件）は共通関数を透過的に使用するため影響なし
