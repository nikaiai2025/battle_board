# ドキュメント整合性レビュー: Sprint-96/97 (!aori + !newspaper)

> task_id: P5-DR-S97
> reviewer: bdd-doc-reviewer
> 実施日: 2026-03-22
> 対象スプリント: Sprint-96, Sprint-97

---

## 検出事項

### [HIGH-1] D-08 command.md -- ステルスフィールド説明が実態と矛盾

**箇所:** `docs/architecture/components/command.md` L94 (stealth フィールド定義表)

```
| stealth | boolean | trueの場合、コマンド文字列が本文から除去される（Phase 2ではすべてfalse） |
```

**問題:** 括弧内の注記「Phase 2ではすべてfalse」は、Sprint-83 (!iamsystem, stealth:true) および Sprint-96 (!aori, stealth:true) の実装後も更新されていない。`config/commands.yaml` では `iamsystem.stealth: true`, `aori.stealth: true` であり、BDDシナリオ (`command_iamsystem.feature`, `command_aori.feature`) もステルス動作を前提としている。D-08本文の§5「ステルスコマンドの設計原則」でステルスの仕組みを詳細に記述しているにもかかわらず、フィールド定義表が矛盾している。

**是正案:** 注記を削除するか「現時点で iamsystem, aori がtrue」に更新する。

---

### [HIGH-2] D-08 command.md -- サンプルYAMLの tell コストが実態と乖離

**箇所:** `docs/architecture/components/command.md` L59 (サンプルYAML内)

```yaml
  tell:
    cost: 50
```

**問題:** D-08のサンプルYAMLでは `tell` のコストが 50 だが、正本である `config/commands.yaml` では `cost: 10`。BDDシナリオ (`ai_accusation.feature`) でも 10 が前提。D-08の例示コードがドキュメント作成時点から更新されておらず、コスト変更がD-08に伝播していない。サンプルコードとはいえ、コマンドのバランス設計を参照する際に誤解を招く。

**是正案:** D-08のサンプルYAMLを `config/commands.yaml` の現行値と同期するか、サンプルを「正本は config/commands.yaml を参照」の旨に切り替えて具体的な数値を削除する（DRY原則）。

---

### [MEDIUM-1] D-02 ユビキタス言語辞書 -- システムメッセージ表示名の不一致

**箇所:** `docs/requirements/ubiquitous_language.yaml` L87 (システムメッセージ定義)

```
表示名は「[システム]」。
```

**問題:** D-02では表示名を「[システム]」と記載しているが、BDDシナリオ (`command_system.feature`, `command_newspaper.feature`, `command_omikuji.feature` 等) および実装コード (`newspaper-service.ts` L133, `bot_state_transitions.yaml` L143) は一貫して「★システム」を使用している。独立システムレスの定義 (D-02 L111) でも「★システム」が使われており、同一辞書内でも表記が割れている。

**是正案:** D-02 のシステムメッセージ定義の表示名を「★システム」に統一する。

---

### [MEDIUM-2] D-04 OpenAPI仕様書 -- `/api/internal/newspaper/process` 未定義

**箇所:** `docs/specs/openapi.yaml`

**問題:** Sprint-97 で新設された `POST /api/internal/newspaper/process` エンドポイント（`src/app/api/internal/newspaper/process/route.ts` に実装済み、`newspaper-scheduler.yml` から呼び出し）が OpenAPI 仕様書に記載されていない。同様に、Sprint-86以前から存在する他の internal エンドポイント (`/api/internal/bot/execute`, `/api/internal/daily-reset`, `/api/internal/daily-stats`) もいずれも OpenAPI に未定義であり、internal API は意図的にスコープ外としている可能性がある。ただしタスク指示書のレビュー観点4にて明示的に確認対象とされているため報告する。

**是正案:** internal API を OpenAPI のスコープ外とする場合は、その方針を D-04 または D-07 に明記して判断を記録する。スコープ内であれば全 internal エンドポイントを追記する。

---

### [MEDIUM-3] D-05 bot_state_transitions.yaml -- 煽りBOT (使い切りBOT) の状態遷移が未定義

**箇所:** `docs/specs/bot_state_transitions.yaml`

**問題:** D-05 は「Phase 2 運営ボット荒らし役 10体」の状態遷移のみを定義しており、Sprint-96 で導入された煽りBOT（使い切りBOT）の特殊なライフサイクルが反映されていない。具体的には:
- 煽りBOTは `isActive=true, nextPostAt=null` でスポーンし、1回のみ書き込む
- 日次リセットで復活しない（`bot_profile_key = 'aori'` は復活対象外とすべき）
- 通常の `eliminated -> lurking` 日次復活の guard に `bot_profile_key != 'aori'` 条件が必要

BDDシナリオ (`command_aori.feature` Scenario 6, 7) ではこの挙動を明確に検証しているが、D-05の遷移定義に反映されていない。現時点では guard 条件に `bot_profile_key != 'tutorial'` のみが記載されている (L174)。

**是正案:** D-05 の `eliminated -> lurking` 遷移の guard に `bot_profile_key != 'aori'` を追加するか、使い切りBOT全般のライフサイクルパターンを包括する guard 条件（例: `is_disposable != true`）を定義する。

---

### [MEDIUM-4] D-08 command.md -- サンプルYAMLに Sprint-83 以降のコマンドが未追加

**箇所:** `docs/architecture/components/command.md` L55--85 (§2.2 サンプルYAML)

**問題:** D-08 のサンプルYAMLには tell, w, hissi, kinou の4コマンドのみが記載されている。Sprint-83 以降で追加された omikuji, iamsystem, aori, newspaper が反映されていない。§2.2 の目的は「設定層のフォーマット例示」であり全コマンドの網羅は必須でないが、ステルスコマンドや非同期コマンドのサンプルがないと、新規コマンド追加者が設定パターンを把握しにくい。

**是正案:** DRY原則を考慮し、サンプルを必要最小限に絞った上で「全定義は config/commands.yaml を参照」と明記する。または stealth:true と非同期パターンの代表例（aori 等）を1件追加する。

---

### [LOW-1] config/commands.yaml -- !aori に responseType フィールドが未設定

**箇所:** `config/commands.yaml` L71--76 (aori エントリ)

**問題:** D-08 §2.2 のフィールド定義表では `responseType` は全コマンドに定義されるべきフィールドとして記載されている。`aori` エントリには `responseType` がない。`tell`, `attack`, `w`, `abeshinzo` も同様に `responseType` を省略しているが、これらは inline がデフォルトと解釈できる。`aori` はステルスかつ非同期のため、同期レスポンスの表示方式は「なし」（`systemMessage: null` を返す）が正しく、実装上は問題ないが、設定ファイルのスキーマ一貫性の観点で気になる点。

**備考:** `commands.ts` (TypeScript版) も同様に `responseType` を省略しており、正本 (`commands.yaml`) と同期は取れている。実害はないが、新規コマンド追加時の参照テンプレートとしては明示的な方が望ましい。

---

## 整合性確認結果（問題なし）

以下の観点は問題を検出しなかった:

| 確認項目 | 結果 |
|---|---|
| BDDシナリオ (7+5=12件) とステップ定義の対応 | OK -- 全シナリオにステップ定義が存在。共有ステップの再利用も正しく参照されている |
| BDDシナリオと `config/commands.yaml` のコスト値 | OK -- aori:10, newspaper:10, attack:5 全一致 |
| BDDシナリオのカテゴリ一覧と `config/newspaper-categories.ts` | OK -- 7カテゴリ完全一致（芸能, World, IT, スポーツ, 経済, 科学, エンタメ） |
| `config/commands.yaml` と `config/commands.ts` の同期 | OK -- 全エントリの cost, stealth, targetFormat, enabled が一致 |
| D-07 TDR-013 (Cron配置) と実装 | OK -- `newspaper-scheduler.yml` は GitHub Actions で実装、TDR-013 の方針（長時間ジョブは GitHub Actions）と一致 |
| D-07 TDR-015 (Gemini採用) と実装 | OK -- `google-ai-adapter.ts`, `newspaper-handler.ts` で `gemini-3-flash-preview` を使用 |
| D-08 §5 非同期キューイングパターンと実装 | OK -- AoriHandler/NewspaperHandler とも pending_async_commands テーブルに INSERT し、Cron で非同期処理する設計に準拠 |
| ファイル存在確認 | OK -- 全成果物ファイル（ハンドラ, リポジトリ, マイグレーション, 設定, テスト, GitHub Actions ワークフロー, InMemoryモック）が存在 |
| D-10 BDDテスト戦略 -- ディレクトリ構成 | OK -- step_definitions, support, in-memory の配置が戦略書と一致 |
| ステップ定義のモック戦略 | OK -- InMemoryリポジトリの DI 注入、動的 require パターンが D-10 §2 に準拠 |
| D-08 ステルス3原則と BDD | OK -- 成功時除去 / 失敗時残留 / 空本文許容の3パターンがシナリオで検証されている |

---

## レビューサマリー

| 重要度   | 件数 | ステータス |
|----------|------|-----------|
| CRITICAL | 0    | pass      |
| HIGH     | 2    | warn      |
| MEDIUM   | 4    | info      |
| LOW      | 1    | note      |

判定: WARNING -- マージ前に2件のHIGH（D-08のステルス記述矛盾、コスト値乖離）の修正を推奨します。MEDIUM 4件は次スプリントでの対応も可。
