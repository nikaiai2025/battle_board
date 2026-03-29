/**
 * DatFormatter 単体テスト
 * See: features/specialist_browser_compat.feature
 *   @scenario DATファイルが所定のフォーマットで返される
 *   @scenario DATファイルの1行目のみスレッドタイトルを含む
 *   @scenario レス内の改行がHTMLのbrタグに変換される
 *   @scenario レス内のHTML特殊文字がエスケープされる
 *   @scenario 日次リセットIDがDATの日付フィールドに正しく含まれる
 */

import { describe, expect, it } from "vitest";
import type { Post } from "../../../domain/models/post";
import { DatFormatter } from "../dat-formatter";

/** テスト用Postファクトリ */
function makePost(overrides: Partial<Post> = {}): Post {
	return {
		id: "uuid-001",
		threadId: "thread-uuid-001",
		postNumber: 1,
		authorId: "user-uuid-001",
		displayName: "名無しさん",
		dailyId: "AbCd1234",
		body: "テスト本文",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2024/01/15 12:30:45"),
		...overrides,
	};
}

describe("DatFormatter", () => {
	describe("buildDat()", () => {
		it("DATフォーマット: 名前<>メール<>日付とID<>本文<>スレッドタイトル 形式で出力する", () => {
			const formatter = new DatFormatter();
			const post = makePost({ postNumber: 1 });
			const result = formatter.buildDat([post], "テストスレ");
			// <> 区切りで5フィールド
			const line = result.split("\n")[0];
			const fields = line.split("<>");
			expect(fields).toHaveLength(5);
		});

		it("1行目の末尾フィールドにスレッドタイトルが含まれる", () => {
			const formatter = new DatFormatter();
			const post = makePost({ postNumber: 1 });
			const result = formatter.buildDat([post], "テストスレ");
			const firstLine = result.split("\n")[0];
			const fields = firstLine.split("<>");
			expect(fields[4]).toBe("テストスレ");
		});

		it("スレッドタイトル内の < > がHTMLエンティティにエスケープされる（デリミタ<>衝突防止）", () => {
			const formatter = new DatFormatter();
			const post = makePost({ postNumber: 1 });
			const result = formatter.buildDat([post], "テスト<スレ>");
			const firstLine = result.split("\n")[0];
			const fields = firstLine.split("<>");
			// エスケープにより<>デリミタと衝突せずフィールド数が5のまま
			expect(fields).toHaveLength(5);
			expect(fields[4]).toBe("テスト&lt;スレ&gt;");
		});

		it("2行目以降の末尾フィールドは空である", () => {
			const formatter = new DatFormatter();
			const posts = [
				makePost({ postNumber: 1, id: "uuid-001" }),
				makePost({ postNumber: 2, id: "uuid-002" }),
				makePost({ postNumber: 3, id: "uuid-003" }),
			];
			const result = formatter.buildDat(posts, "テストスレ");
			const lines = result.split("\n").filter((l) => l.length > 0);
			expect(lines).toHaveLength(3);
			for (let i = 1; i < lines.length; i++) {
				const fields = lines[i].split("<>");
				expect(fields[4]).toBe("");
			}
		});

		it("各行が改行(\\n)で区切られ、末尾に改行がある", () => {
			const formatter = new DatFormatter();
			const post = makePost({ postNumber: 1 });
			const result = formatter.buildDat([post], "テストスレ");
			expect(result.endsWith("\n")).toBe(true);
		});

		it("名前フィールドに displayName が含まれる", () => {
			const formatter = new DatFormatter();
			const post = makePost({ displayName: "テスト太郎" });
			const result = formatter.buildDat([post], "スレ");
			const line = result.split("\n")[0];
			const fields = line.split("<>");
			expect(fields[0]).toBe("テスト太郎");
		});

		it("日付フィールドに 'ID:AbCd1234' が含まれる", () => {
			const formatter = new DatFormatter();
			const post = makePost({ dailyId: "AbCd1234" });
			const result = formatter.buildDat([post], "スレ");
			const line = result.split("\n")[0];
			const fields = line.split("<>");
			expect(fields[2]).toContain("ID:AbCd1234");
		});

		it("日付フォーマットが 'YYYY/MM/DD(曜日) HH:mm:ss.SS ID:xxxxxxxx' 形式である", () => {
			const formatter = new DatFormatter();
			const post = makePost({
				createdAt: new Date("2024-01-15T12:30:45.123Z"),
				dailyId: "AbCd1234",
			});
			const result = formatter.buildDat([post], "スレ");
			const line = result.split("\n")[0];
			const dateField = line.split("<>")[2];
			// YYYY/MM/DD(曜) HH:mm:ss.SS ID:xxxxxxxx
			expect(dateField).toMatch(
				/^\d{4}\/\d{2}\/\d{2}\([月火水木金土日]\) \d{2}:\d{2}:\d{2}\.\d{2} ID:[A-Za-z0-9]{8}$/,
			);
		});

		it("本文内の改行(\\n)が <br> に変換される", () => {
			const formatter = new DatFormatter();
			const post = makePost({ body: "1行目\n2行目" });
			const result = formatter.buildDat([post], "スレ");
			const line = result.split("\n")[0];
			const bodyField = line.split("<>")[3];
			expect(bodyField).toBe("1行目<br>2行目");
		});

		it("本文内のHTML特殊文字がエスケープされる: < > & \" '", () => {
			const formatter = new DatFormatter();
			const post = makePost({
				body: "<script>alert('xss')</script> & \"test\"",
			});
			const result = formatter.buildDat([post], "スレ");
			const line = result.split("\n")[0];
			const bodyField = line.split("<>")[3];
			expect(bodyField).toContain("&lt;script&gt;");
			expect(bodyField).toContain("&amp;");
			expect(bodyField).toContain("&#39;");
			expect(bodyField).toContain("&quot;");
		});

		it("BOT絵文字(🤖)はそのまま本文に含まれる（Shift_JIS変換はエンコード層が担う）", () => {
			const formatter = new DatFormatter();
			const post = makePost({ body: "🤖BOTからのメッセージ" });
			const result = formatter.buildDat([post], "スレ");
			const line = result.split("\n")[0];
			const bodyField = line.split("<>")[3];
			expect(bodyField).toContain("🤖");
			expect(bodyField).not.toContain("[BOT]");
		});

		it("displayNameにBOT絵文字が含まれる場合もそのまま出力される", () => {
			const formatter = new DatFormatter();
			const post = makePost({ displayName: "BattleBot🤖" });
			const result = formatter.buildDat([post], "スレ");
			const line = result.split("\n")[0];
			const nameField = line.split("<>")[0];
			expect(nameField).toContain("🤖");
			expect(nameField).not.toContain("[BOT]");
		});

		it("空配列を渡すと空文字列を返す（エッジケース: 空配列）", () => {
			const formatter = new DatFormatter();
			const result = formatter.buildDat([], "スレ");
			expect(result).toBe("");
		});

		it("isDeleted=trueのレスは本文が「このレスは削除されました」に置換される", () => {
			const formatter = new DatFormatter();
			const post = makePost({ body: "本来の内容", isDeleted: true });
			const result = formatter.buildDat([post], "スレ");
			const bodyField = result.split("\n")[0].split("<>")[3];
			expect(bodyField).toBe("このレスは削除されました");
		});

		// -----------------------------------------------------------------------
		// inlineSystemInfo 連結出力
		// See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
		// See: docs/architecture/components/posting.md §5 方式A: レス内マージ
		// -----------------------------------------------------------------------

		it("inlineSystemInfoがある場合、本文末尾に区切り線付きで連結される", () => {
			const formatter = new DatFormatter();
			const post = makePost({
				body: "これAIだろ !tell >>5",
				inlineSystemInfo: "!tell >>5 を実行しました",
			});
			const result = formatter.buildDat([post], "スレ");
			const bodyField = result.split("\n")[0].split("<>")[3];
			// 区切り線は全角ダッシュ10個
			expect(bodyField).toContain("<br>──────────<br>");
			expect(bodyField).toContain("!tell &gt;&gt;5 を実行しました");
		});

		it("inlineSystemInfoがnullの場合、区切り線は付与されない", () => {
			const formatter = new DatFormatter();
			const post = makePost({ body: "通常の書き込み", inlineSystemInfo: null });
			const result = formatter.buildDat([post], "スレ");
			const bodyField = result.split("\n")[0].split("<>")[3];
			expect(bodyField).not.toContain("──────────");
			expect(bodyField).toBe("通常の書き込み");
		});

		it("inlineSystemInfoが空文字列の場合、区切り線は付与されない", () => {
			const formatter = new DatFormatter();
			const post = makePost({ body: "通常の書き込み", inlineSystemInfo: "" });
			const result = formatter.buildDat([post], "スレ");
			const bodyField = result.split("\n")[0].split("<>")[3];
			expect(bodyField).not.toContain("──────────");
		});

		it("isDeleted=trueの場合はinlineSystemInfoがあっても区切り線は付与されない", () => {
			const formatter = new DatFormatter();
			const post = makePost({
				body: "削除対象",
				inlineSystemInfo: "コマンド結果",
				isDeleted: true,
			});
			const result = formatter.buildDat([post], "スレ");
			const bodyField = result.split("\n")[0].split("<>")[3];
			expect(bodyField).toBe("このレスは削除されました");
		});

		it("inlineSystemInfoにHTML特殊文字が含まれる場合もエスケープされる", () => {
			const formatter = new DatFormatter();
			const post = makePost({
				body: "テスト",
				inlineSystemInfo: '<script>alert("xss")</script>',
			});
			const result = formatter.buildDat([post], "スレ");
			const bodyField = result.split("\n")[0].split("<>")[3];
			expect(bodyField).toContain("&lt;script&gt;");
			expect(bodyField).not.toContain("<script>");
		});

		it("inlineSystemInfoに改行が含まれる場合、<br>に変換される", () => {
			const formatter = new DatFormatter();
			const post = makePost({
				body: "テスト",
				inlineSystemInfo: "行1\n行2",
			});
			const result = formatter.buildDat([post], "スレ");
			const bodyField = result.split("\n")[0].split("<>")[3];
			expect(bodyField).toContain("行1<br>行2");
		});
	});

	describe("calcShiftJisLineBytes()", () => {
		it("DAT1行のShift_JISバイト数を計算する", () => {
			const formatter = new DatFormatter();
			const post = makePost({ postNumber: 1 });
			const line =
				formatter.buildDat([post], "テストスレ").split("\n")[0] + "\n";
			const bytes = formatter.calcShiftJisLineBytes(line);
			expect(bytes).toBeGreaterThan(0);
			expect(typeof bytes).toBe("number");
		});

		it("空文字列のバイト数は0を返す（エッジケース: 空文字列）", () => {
			const formatter = new DatFormatter();
			expect(formatter.calcShiftJisLineBytes("")).toBe(0);
		});
	});
});
