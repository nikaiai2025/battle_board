---
task_id: TASK-390
sprint_id: Sprint-155
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-04-18
updated_at: 2026-04-18
locked_files:
  - "[NEW] config/yomiage.ts"
  - "[NEW] src/lib/domain/rules/wav-encoder.ts"
  - "[NEW] src/lib/domain/rules/yomiage-voice-picker.ts"
  - "[NEW] src/__tests__/lib/domain/rules/wav-encoder.test.ts"
  - "[NEW] src/__tests__/lib/domain/rules/yomiage-voice-picker.test.ts"
---

## タスク概要

!yomiage コマンド実装の基盤となる定数ファイルと純粋関数（外部依存なし）を新規作成する。
後続タスク（TASK-391〜395）がこれらを import するため、インターフェース・定数名を確定させることが本タスクの最重要目標。

## 対象BDDシナリオ

- `features/command_yomiage.feature` — 本タスク単体では BDD を通す責務なし（後続タスクが担う）

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/yomiage.md §5.2` — 音声名30種・タグ17種・モデルID の正式リスト
2. [必須] `docs/architecture/components/yomiage.md §5.4` — wav-encoder の仕様（RIFF/WAVE ヘッダ構造・検証観点）
3. [必須] `docs/architecture/components/yomiage.md §5.7` — config/yomiage.ts の役割
4. [参考] `tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §2` — WAV サンプル検証結果（PoC 出力は既に完全 WAV ヘッダ付き。Gemini 出力形式の注意点あり）

## 出力（生成すべきファイル）

### 1. `config/yomiage.ts`

```typescript
// 定数エクスポート。newspaper-categories.ts と同じ型付き as const パターン

export const YOMIAGE_MODEL_ID = "gemini-3.1-flash-tts-preview" as const;

export const YOMIAGE_VOICE_NAMES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"
] as const;
export type YomiageVoiceName = typeof YOMIAGE_VOICE_NAMES[number];

export const YOMIAGE_VOICE_TAGS = [
  "[amazed]", "[crying]", "[curious]", "[excited]", "[excitedly]",
  "[sighs]", "[gasp]", "[giggles]", "[laughs]", "[mischievously]",
  "[panicked]", "[sarcastic]", "[serious]", "[shouting]", "[tired]",
  "[trembling]", "[whispers]"
] as const;
export type YomiageVoiceTag = typeof YOMIAGE_VOICE_TAGS[number];

// 保持期間（Litterbox 固定選択肢）
export const YOMIAGE_RETENTION_HOURS = 72 as const;
```

### 2. `src/lib/domain/rules/wav-encoder.ts`

PCM バイト列に RIFF/WAVE ヘッダを付与する純粋関数。
**注意**: `tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md §2.1` に記載の通り、
Gemini TTS の実際の出力が raw PCM なのか完全 WAV なのか実装時に要確認。
実装者は Gemini レスポンスの生データを確認し、ヘッダが既に付いている場合は no-op（入力をそのまま返す）でも構わない。
ただし、この関数自体は「raw PCM → WAV」変換の正しい実装として作成する（将来 no-op 化できる設計）。

```typescript
/**
 * raw PCM バイト列に RIFF/WAVE ヘッダを付与して WAV を生成する純粋関数。
 *
 * @param pcm - Gemini TTS が返す 24kHz mono 16bit PCM（ヘッダなし）
 * @param options - { sampleRate: 24000, numChannels: 1, bitDepth: 16 }
 * @returns 完全な WAV バイト列（RIFF ヘッダ + data チャンク）
 */
export function wrapPcmAsWav(
  pcm: Uint8Array,
  options: { sampleRate: number; numChannels: number; bitDepth: number }
): Uint8Array
```

**ヘッダ仕様（検証テストで確認する観点）**:
- RIFF チャンクサイズ = `data` チャンクサイズ + 36
- `fmt` チャンク: AudioFormat=1(PCM), ChannelCount, SampleRate, BitsPerSample
- byteRate = SampleRate × NumChannels × BitsPerSample / 8
- blockAlign = NumChannels × BitsPerSample / 8
- `data` チャンクサイズ = pcm.length
- リトルエンディアン

### 3. `src/lib/domain/rules/yomiage-voice-picker.ts`

voice name と voice tag を一様ランダムに選択する純粋関数。
テスト可能にするため `randomIndex` 関数を DI 可能にする（デフォルトは `Math.random` ベース）。

```typescript
import { YOMIAGE_VOICE_NAMES, YOMIAGE_VOICE_TAGS, type YomiageVoiceName, type YomiageVoiceTag } from "../../../config/yomiage";

export interface VoicePick {
  voiceName: YomiageVoiceName;
  voiceTag:  YomiageVoiceTag;
}

/**
 * voice name と voice tag を一様ランダムに選択する。
 * @param randomFn - テスト時に差し替え可能（デフォルト: Math.random）
 */
export function pickVoice(randomFn: () => number = Math.random): VoicePick
```

## 完了条件

- [ ] `npx vitest run src/__tests__/lib/domain/rules/wav-encoder.test.ts` 全 PASS
- [ ] `npx vitest run src/__tests__/lib/domain/rules/yomiage-voice-picker.test.ts` 全 PASS
- [ ] `npx vitest run` 全体で回帰なし
- [ ] TypeScript コンパイルエラーなし（`npx tsc --noEmit`）

### テストで検証すべき観点

**wav-encoder.test.ts:**
- RIFF ヘッダの "RIFF" / "WAVE" マジック確認
- `fmt` チャンクの各フィールド値（AudioFormat=1, SampleRate=24000, NumChannels=1, BitsPerSample=16）
- RIFF チャンクサイズ = data サイズ + 36
- data チャンクサイズ = pcm.length
- 空 PCM (長さ0) でも正常動作すること

**yomiage-voice-picker.test.ts:**
- 返り値が YOMIAGE_VOICE_NAMES に含まれること
- 返り値が YOMIAGE_VOICE_TAGS に含まれること
- randomFn を固定値で差し替えると決定論的に選択できること（インデックス計算の確認）

## スコープ外

- BDD ステップ定義（TASK-395）
- Gemini API 呼び出し（TASK-391）
- YomiageHandler（TASK-392）

## 補足・制約

- `config/yomiage.ts` は `config/hiroyuki-prompt.ts` や `config/newspaper-categories.ts` と同じ config/ 直下に配置
- `wav-encoder.ts` と `yomiage-voice-picker.ts` は外部依存を一切持たない純粋関数（import するのは config/ のみ可）
- ソースレイアウトガイド（`.claude/rules/Source_Layout.md`）の `src/lib/domain/rules/` ルールに準拠

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 必読ドキュメント確認、定数ファイル作成、純粋関数作成、単体テスト作成、回帰確認、TypeScript 型確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
<!-- ワーカーが作業中に逐次追記 -->
- 2026-04-18: TASK-390 着手。`docs/architecture/components/yomiage.md` §5.2/§5.4/§5.7、`features/command_yomiage.feature`、`.claude/rules/Source_Layout.md` を確認。
- 2026-04-18: `config/yomiage.ts` にモデル ID、音声名30種、音声タグ17種、保持期間定数を追加。
- 2026-04-18: `src/lib/domain/rules/wav-encoder.ts` に raw PCM → WAV 変換の純粋関数を追加。既存 WAV の no-op も実装。
- 2026-04-18: `src/lib/domain/rules/yomiage-voice-picker.ts` に音声名・音声タグのランダム選択関数を追加。`randomFn` DI に対応。
- 2026-04-18: `src/__tests__/lib/domain/rules/wav-encoder.test.ts` と `src/__tests__/lib/domain/rules/yomiage-voice-picker.test.ts` を追加し、ヘッダ構造と決定論的選択を検証。

### テスト結果サマリー
<!-- テスト実行後にワーカーが追記 -->
- `npx vitest run src/__tests__/lib/domain/rules/wav-encoder.test.ts` → PASS（3/3）
- `npx vitest run src/__tests__/lib/domain/rules/yomiage-voice-picker.test.ts` → PASS（4/4）
- `npx vitest run` → PASS（全体回帰なし。既存テスト由来の stderr ログ出力あり）
- `npx tsc --noEmit` → PASS
