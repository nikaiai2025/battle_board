/**
 * 専ブラ互換 Route Handler 単体テスト
 *
 * テスト対象:
 *   - bbsmenu.html route.ts
 *   - [boardId]/SETTING.TXT route.ts
 *   - [boardId]/subject.txt route.ts
 *   - [boardId]/dat/[threadKey] route.ts
 *   - test/bbs.cgi route.ts
 *
 * テスト戦略:
 *   - 外部依存（ThreadRepository, PostRepository, PostService）はすべてvitest.mock
 *   - ShiftJisEncoderの実際の変換を使用してエンコーディング検証を行う
 *
 * See: features/constraints/specialist_browser_compat.feature
 * See: docs/architecture/components/senbra-adapter.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import iconv from "iconv-lite";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
  findByBoardId: vi.fn(),
  findByThreadKey: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
  findByThreadId: vi.fn(),
}));

vi.mock("@/lib/services/post-service", () => ({
  createPost: vi.fn(),
  createThread: vi.fn(),
  getThreadList: vi.fn(),
  getPostList: vi.fn(),
  getThread: vi.fn(),
}));

vi.mock("@/lib/services/auth-service", () => ({
  hashIp: vi.fn((ip: string) => `hashed:${ip}`),
  reduceIp: vi.fn((ip: string) => ip),
  verifyEdgeToken: vi.fn(),
  issueEdgeToken: vi.fn(),
  issueAuthCode: vi.fn(),
  verifyWriteToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック後に行う）
// ---------------------------------------------------------------------------

import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";
import * as PostRepository from "@/lib/infrastructure/repositories/post-repository";
import * as PostService from "@/lib/services/post-service";
import * as AuthService from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * Shift_JISのBufferをUTF-8文字列にデコードするヘルパー
 */
function decodeSjis(buffer: ArrayBuffer): string {
  return iconv.decode(Buffer.from(buffer), "CP932");
}

/**
 * テスト用Thread型のファクトリ
 */
function makeThread(overrides: Partial<{
  id: string;
  threadKey: string;
  boardId: string;
  title: string;
  postCount: number;
  datByteSize: number;
  createdBy: string;
  createdAt: Date;
  lastPostAt: Date;
  isDeleted: boolean;
}> = {}) {
  return {
    id: "thread-uuid-001",
    threadKey: "1234567890",
    boardId: "battleboard",
    title: "テストスレ",
    postCount: 3,
    datByteSize: 0,
    createdBy: "user-uuid-001",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    lastPostAt: new Date("2025-01-01T12:00:00Z"),
    isDeleted: false,
    ...overrides,
  };
}

/**
 * テスト用Post型のファクトリ
 */
function makePost(overrides: Partial<{
  id: string;
  threadId: string;
  postNumber: number;
  authorId: string | null;
  displayName: string;
  dailyId: string;
  body: string;
  inlineSystemInfo: string | null;
  isSystemMessage: boolean;
  isDeleted: boolean;
  createdAt: Date;
}> = {}) {
  return {
    id: "post-uuid-001",
    threadId: "thread-uuid-001",
    postNumber: 1,
    authorId: null,
    displayName: "名無しさん",
    dailyId: "AbCd1234",
    body: "テスト本文",
    inlineSystemInfo: null,
    isSystemMessage: false,
    isDeleted: false,
    createdAt: new Date("2025-01-01T12:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// bbsmenu.html Route Handler テスト
// ---------------------------------------------------------------------------

describe("bbsmenu.html Route Handler", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 動的importで最新のモジュールを取得する
    const mod = await import("../bbsmenu.html/route");
    GET = mod.GET;
  });

  it("200 OK を返す", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.html");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("Content-TypeヘッダにShift_JISが含まれる", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.html");
    const res = await GET(req);
    expect(res.headers.get("content-type")).toContain("charset=Shift_JIS");
  });

  it("レスポンスがShift_JISエンコードされている", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.html");
    const res = await GET(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    // Shift_JISとして正常にデコードできることを確認
    expect(decoded).toContain("BattleBoard");
  });

  it("板へのリンクを含むHTMLが返される", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.html");
    const res = await GET(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("<A HREF=");
    expect(decoded).toContain("battleboard");
  });

  it("HTMLにtitleタグが含まれる", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.html");
    const res = await GET(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("<title>");
  });

  it("Content-Lengthヘッダが設定されている", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.html");
    const res = await GET(req);
    const contentLength = res.headers.get("content-length");
    expect(contentLength).not.toBeNull();
    expect(parseInt(contentLength!, 10)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// bbsmenu.json Route Handler テスト
// ---------------------------------------------------------------------------

describe("bbsmenu.json Route Handler", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 動的importで最新のモジュールを取得する
    const mod = await import("../bbsmenu.json/route");
    GET = mod.GET;
  });

  it("200 OK を返す", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.json");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("Content-TypeヘッダがapplicationJsonである", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.json");
    const res = await GET(req);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("JSONとしてパース可能なレスポンスが返される", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.json");
    const res = await GET(req);
    const text = await res.text();
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it("menu_list配列が含まれる", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.json");
    const res = await GET(req);
    const body = await res.json();
    expect(Array.isArray(body.menu_list)).toBe(true);
    expect(body.menu_list.length).toBeGreaterThan(0);
  });

  it("各カテゴリにcategory_nameとcategory_contentが含まれる", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.json");
    const res = await GET(req);
    const body = await res.json();
    for (const category of body.menu_list) {
      expect(typeof category.category_name).toBe("string");
      expect(Array.isArray(category.category_content)).toBe(true);
    }
  });

  it("各板にurl, board_name, directory_nameが含まれる", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.json");
    const res = await GET(req);
    const body = await res.json();
    for (const category of body.menu_list) {
      for (const board of category.category_content) {
        expect(typeof board.url).toBe("string");
        expect(board.url.length).toBeGreaterThan(0);
        expect(typeof board.board_name).toBe("string");
        expect(board.board_name.length).toBeGreaterThan(0);
        expect(typeof board.directory_name).toBe("string");
        expect(board.directory_name.length).toBeGreaterThan(0);
      }
    }
  });

  it("urlにbattleboardが含まれる", async () => {
    const req = new NextRequest("http://localhost/bbsmenu.json");
    const res = await GET(req);
    const body = await res.json();
    const allBoards = body.menu_list.flatMap(
      (cat: { category_content: { url: string }[] }) => cat.category_content
    );
    expect(allBoards.some((b: { url: string }) => b.url.includes("battleboard"))).toBe(true);
  });

  it("NEXT_PUBLIC_BASE_URLが設定されている場合にそのURLを使用する", async () => {
    const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    process.env.NEXT_PUBLIC_BASE_URL = "https://custom.example.com";

    // モジュールキャッシュをクリアして再インポートする
    vi.resetModules();
    const mod = await import("../bbsmenu.json/route");
    const customGET = mod.GET;

    const req = new NextRequest("http://localhost/bbsmenu.json");
    const res = await customGET(req);
    const body = await res.json();
    const allBoards = body.menu_list.flatMap(
      (cat: { category_content: { url: string }[] }) => cat.category_content
    );
    expect(allBoards.some((b: { url: string }) => b.url.includes("custom.example.com"))).toBe(true);

    // 環境変数を元に戻す
    if (originalBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    }
  });
});

// ---------------------------------------------------------------------------
// SETTING.TXT Route Handler テスト
// ---------------------------------------------------------------------------

describe("SETTING.TXT Route Handler", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ boardId: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../[boardId]/SETTING.TXT/route");
    GET = mod.GET;
  });

  it("200 OK を返す", async () => {
    const req = new NextRequest("http://localhost/battleboard/SETTING.TXT");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.status).toBe(200);
  });

  it("Content-TypeヘッダにShift_JISが含まれる", async () => {
    const req = new NextRequest("http://localhost/battleboard/SETTING.TXT");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.headers.get("content-type")).toContain("charset=Shift_JIS");
  });

  it("BBS_TITLE= を含むテキストが返される", async () => {
    const req = new NextRequest("http://localhost/battleboard/SETTING.TXT");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("BBS_TITLE=");
  });

  it("BBS_NONAME_NAME=名無しさん が含まれる", async () => {
    const req = new NextRequest("http://localhost/battleboard/SETTING.TXT");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("BBS_NONAME_NAME=名無しさん");
  });

  it("Content-Typeヘッダがtext/plainである", async () => {
    const req = new NextRequest("http://localhost/battleboard/SETTING.TXT");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("未定義の板IDでもデフォルト設定を返す", async () => {
    const req = new NextRequest("http://localhost/unknownboard/SETTING.TXT");
    const res = await GET(req, { params: Promise.resolve({ boardId: "unknownboard" }) });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("BBS_TITLE=");
    expect(decoded).toContain("BBS_NONAME_NAME=名無しさん");
  });
});

// ---------------------------------------------------------------------------
// subject.txt Route Handler テスト
// ---------------------------------------------------------------------------

describe("subject.txt Route Handler", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ boardId: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../[boardId]/subject.txt/route");
    GET = mod.GET;
  });

  it("スレッドが存在する場合に200 OK を返す", async () => {
    vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([
      makeThread({ threadKey: "1234567890", title: "テストスレ", postCount: 5 }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/subject.txt");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.status).toBe(200);
  });

  it("Content-TypeヘッダにShift_JISが含まれる", async () => {
    vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([
      makeThread(),
    ]);
    const req = new NextRequest("http://localhost/battleboard/subject.txt");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.headers.get("content-type")).toContain("charset=Shift_JIS");
  });

  it("{threadKey}.dat<>{title} ({postCount}) 形式で返される", async () => {
    vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([
      makeThread({ threadKey: "1234567890", title: "テストスレ", postCount: 5 }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/subject.txt");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("1234567890.dat<>テストスレ (5)");
  });

  it("1行1スレッドの形式である（末尾改行含む）", async () => {
    vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([
      makeThread({ threadKey: "1111111111", title: "スレ1", postCount: 1 }),
      makeThread({ threadKey: "2222222222", title: "スレ2", postCount: 2 }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/subject.txt");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    const lines = decoded.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(2);
  });

  it("スレッドが0件の場合に空レスポンスを返す", async () => {
    vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([]);
    const req = new NextRequest("http://localhost/battleboard/subject.txt");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.status).toBe(200);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toBe("");
  });

  it("If-Modified-Since が最終更新日時以降の場合に 304 を返す", async () => {
    const lastPostAt = new Date("2025-01-01T12:00:00Z");
    vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([
      makeThread({ lastPostAt }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/subject.txt", {
      headers: { "if-modified-since": lastPostAt.toUTCString() },
    });
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.status).toBe(304);
  });

  it("If-Modified-Since が最終更新日時より前の場合に 200 を返す", async () => {
    const lastPostAt = new Date("2025-01-02T12:00:00Z");
    vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([
      makeThread({ lastPostAt }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/subject.txt", {
      headers: { "if-modified-since": new Date("2025-01-01T00:00:00Z").toUTCString() },
    });
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.status).toBe(200);
  });

  it("Last-Modified ヘッダが設定されている", async () => {
    vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([
      makeThread(),
    ]);
    const req = new NextRequest("http://localhost/battleboard/subject.txt");
    const res = await GET(req, { params: Promise.resolve({ boardId: "battleboard" }) });
    expect(res.headers.get("last-modified")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DATファイル Route Handler テスト
// ---------------------------------------------------------------------------

describe("DATファイル Route Handler", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ boardId: string; threadKey: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../[boardId]/dat/[threadKey]/route");
    GET = mod.GET;
  });

  it("スレッドが存在しない場合に 404 を返す", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat");
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    expect(res.status).toBe(404);
  });

  it("スレッドが存在し、レスがある場合に 200 を返す", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ postNumber: 1, body: "テスト本文" }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat");
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    expect(res.status).toBe(200);
  });

  it("Content-TypeヘッダにShift_JISが含まれる", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([makePost()]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat");
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    expect(res.headers.get("content-type")).toContain("charset=Shift_JIS");
  });

  it("各行が 名前<>メール<>日付とID<>本文<>スレッドタイトル 形式である", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(
      makeThread({ title: "テストスレ" })
    );
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ postNumber: 1, displayName: "名無しさん", dailyId: "AbCd1234", body: "本文テスト" }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat");
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    const lines = decoded.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeGreaterThan(0);
    // 1行目の形式を確認: 名前<>メール<>日付ID<>本文<>スレッドタイトル
    const fields = lines[0].split("<>");
    expect(fields).toHaveLength(5);
  });

  it("1行目のみスレッドタイトルを含む", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(
      makeThread({ title: "テストスレ" })
    );
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ postNumber: 1 }),
      makePost({ postNumber: 2, body: "2レス目" }),
      makePost({ postNumber: 3, body: "3レス目" }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat");
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    const lines = decoded.split("\n").filter((l) => l.trim() !== "");
    // 1行目はスレッドタイトルを含む
    expect(lines[0]).toContain("テストスレ");
    // 2行目以降の末尾フィールドは空
    const line2Fields = lines[1].split("<>");
    expect(line2Fields[4]).toBe("");
    const line3Fields = lines[2].split("<>");
    expect(line3Fields[4]).toBe("");
  });

  it("If-Modified-Since が last_post_at と同時刻の場合に 304 を返す", async () => {
    const lastPostAt = new Date("2025-01-01T12:00:00Z");
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(
      makeThread({ lastPostAt })
    );
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat", {
      headers: { "if-modified-since": lastPostAt.toUTCString() },
    });
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    expect(res.status).toBe(304);
  });

  it("Range ヘッダ付きリクエストに 206 Partial Content を返す", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(
      makeThread({ datByteSize: 100 })
    );
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ postNumber: 1 }),
      makePost({ postNumber: 2, body: "追加レス" }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat", {
      headers: { range: "bytes=0-" },
    });
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    expect(res.status).toBe(206);
  });

  it("Range が全データサイズ以上の場合に空の 206 を返す", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(
      makeThread({ datByteSize: 0 })
    );
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ postNumber: 1, body: "本文" }),
    ]);
    // まず全体サイズを知るため、モックデータから実際のサイズを求める
    // ここでは非常に大きなオフセットを指定して空のレスポンスを期待する
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat", {
      headers: { range: "bytes=999999-" },
    });
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    expect(res.status).toBe(206);
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBe(0);
  });

  it("206 レスポンスに Content-Range ヘッダが含まれる", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(
      makeThread({ datByteSize: 100 })
    );
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ postNumber: 1 }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat", {
      headers: { range: "bytes=0-" },
    });
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    expect(res.headers.get("content-range")).toMatch(/^bytes \d+-\d+\/\d+$/);
  });

  it("日付フィールドに ID:xxxxxxxx 形式が含まれる", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ dailyId: "AbCd1234" }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat");
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("ID:AbCd1234");
  });

  it("本文中の改行が <br> に変換される", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ body: "1行目\n2行目" }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat");
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("1行目<br>2行目");
  });

  it("本文中の HTML 特殊文字がエスケープされる", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
      makePost({ body: "<script>alert('xss')</script>" }),
    ]);
    const req = new NextRequest("http://localhost/battleboard/dat/1234567890.dat");
    const res = await GET(req, {
      params: Promise.resolve({ boardId: "battleboard", threadKey: "1234567890" }),
    });
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("&lt;script&gt;");
    expect(decoded).not.toContain("<script>");
  });
});

// ---------------------------------------------------------------------------
// bbs.cgi Route Handler テスト
// ---------------------------------------------------------------------------

describe("bbs.cgi Route Handler", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../test/bbs.cgi/route");
    POST = mod.POST;
  });

  /**
   * Shift_JISエンコードされたapplication/x-www-form-urlencoded形式のボディを生成する。
   *
   * 専ブラの実際の動作を再現する:
   * 1. 各パラメータのキーと値をCP932バイト列に変換する
   * 2. 各バイトをパーセントエンコードする（%XX形式）
   * 3. key=value を & で連結する
   *
   * NOTE: 旧実装 (new URLSearchParams(params).toString() → iconv.encode) は
   * UTF-8 URLエンコード文字列 (%E3%83... 形式) をCP932に変換するだけで、
   * 本物の専ブラが送る %83e 形式（Shift-JISバイトのURLエンコード）とは異なっていた。
   */
  function makeShiftJisBody(params: Record<string, string>): string {
    const pairs: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      const encodedKey = percentEncodeShiftJis(key);
      const encodedValue = percentEncodeShiftJis(value);
      pairs.push(`${encodedKey}=${encodedValue}`);
    }
    return pairs.join("&");
  }

  /**
   * 文字列をCP932バイト列に変換し、各バイトをパーセントエンコードする。
   * ASCII英数字と一部の記号はエンコードしない（URLセーフな文字）。
   */
  function percentEncodeShiftJis(str: string): string {
    const sjisBytes = iconv.encode(str, "CP932");
    let result = "";
    for (const byte of sjisBytes) {
      // URLセーフな文字（英数字・記号の一部）はそのまま
      if (
        (byte >= 0x41 && byte <= 0x5a) || // A-Z
        (byte >= 0x61 && byte <= 0x7a) || // a-z
        (byte >= 0x30 && byte <= 0x39) || // 0-9
        byte === 0x2d || // -
        byte === 0x5f || // _
        byte === 0x2e || // .
        byte === 0x7e    // ~
      ) {
        result += String.fromCharCode(byte);
      } else {
        result += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
    return result;
  }

  it("書き込み成功時に titleタグに 書きこみました を含む HTML を返す", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostService.createPost).mockResolvedValue({
      success: true,
      postId: "post-uuid-001",
      postNumber: 2,
      systemMessages: [],
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      FROM: "名無しさん",
      mail: "",
      MESSAGE: "テスト書き込み",
      submit: "書き込む",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded; charset=Shift_JIS" },
    });

    const res = await POST(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("書きこみました");
  });

  it("本文が空のとき ＥＲＲＯＲ を含む HTML を返す", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostService.createPost).mockResolvedValue({
      success: false,
      error: "本文を入力してください",
      code: "EMPTY_BODY",
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      FROM: "",
      mail: "",
      MESSAGE: "",
      submit: "書き込む",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    const res = await POST(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("ＥＲＲＯＲ");
  });

  it("スレッドが存在しない場合に ＥＲＲＯＲ を返す", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(null);

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "9999999999",
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    const res = await POST(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("ＥＲＲＯＲ");
  });

  it("Content-TypeヘッダにShift_JISが含まれる", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostService.createPost).mockResolvedValue({
      success: true,
      postId: "post-uuid-001",
      postNumber: 2,
      systemMessages: [],
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    const res = await POST(req);
    expect(res.headers.get("content-type")).toContain("charset=Shift_JIS");
  });

  it("認証が必要な場合に認証案内HTMLを返しSet-Cookieを設定する", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostService.createPost).mockResolvedValue({
      authRequired: true,
      code: "123456",
      edgeToken: "test-token-value",
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    const res = await POST(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    // 認証案内HTMLが返される
    expect(decoded).toContain("認証");
    // Set-Cookieヘッダが設定されている
    expect(res.headers.get("set-cookie")).toContain("edge-token=test-token-value");
  });

  it("新規スレッド作成（subjectパラメータあり）が成功する", async () => {
    vi.mocked(PostService.createThread).mockResolvedValue({
      success: true,
      thread: makeThread({ threadKey: "9876543210" }),
      firstPost: makePost(),
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      subject: "新しいスレッド",
      FROM: "名無しさん",
      mail: "",
      MESSAGE: "スレッド本文",
      submit: "新規スレッド",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    const res = await POST(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("書きこみました");
  });

  it("Shift_JIS日本語文字が正しくデコードされる（文字化けなし）", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());

    // キャプチャ用: createPostに渡されたbodyを記録する
    let capturedBody = "";
    vi.mocked(PostService.createPost).mockImplementation(async (input) => {
      capturedBody = input.body;
      return {
        success: true,
        postId: "post-uuid-001",
        postNumber: 2,
        systemMessages: [],
      };
    });

    const japaneseMessage = "日本語テスト書き込み★";
    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      MESSAGE: japaneseMessage,
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    await POST(req);
    // PostServiceに渡されたbodyが元の日本語文字列と一致することを確認する
    expect(capturedBody).toBe(japaneseMessage);
  });

  it("threadKeyが空の場合に ＥＲＲＯＲ を返す", async () => {
    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "",
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    const res = await POST(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    expect(decoded).toContain("ＥＲＲＯＲ");
  });

  // ---------------------------------------------------------------------------
  // write_token 関連テスト
  // See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
  // See: features/constraints/specialist_browser_compat.feature @無効なwrite_tokenでは書き込みが拒否される
  // See: tmp/auth_spec_review_report.md §3.2 write_token 方式
  // ---------------------------------------------------------------------------

  it("有効な write_token をメール欄に含む場合: 書き込みが成功し edge-token Cookie が設定される", async () => {
    const validWriteToken = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"; // 32文字hex
    vi.mocked(AuthService.verifyWriteToken).mockResolvedValue({
      valid: true,
      edgeToken: "verified-edge-token",
    });
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostService.createPost).mockResolvedValue({
      success: true,
      postId: "post-uuid-001",
      postNumber: 2,
      systemMessages: [],
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      FROM: "名無しさん",
      mail: `#${validWriteToken}`,
      MESSAGE: "テスト書き込み",
      submit: "書き込む",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded; charset=Shift_JIS" },
    });

    const res = await POST(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    // 書き込み成功
    expect(decoded).toContain("書きこみました");
    // edge-token Cookie が設定されている
    expect(res.headers.get("set-cookie")).toContain("edge-token=verified-edge-token");
    // verifyWriteToken が呼ばれたこと
    expect(AuthService.verifyWriteToken).toHaveBeenCalledWith(validWriteToken);
  });

  it("write_token を含む mail 欄: PostService に渡す際に write_token が除去されている（DAT漏洩防止）", async () => {
    const validWriteToken = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    vi.mocked(AuthService.verifyWriteToken).mockResolvedValue({
      valid: true,
      edgeToken: "verified-edge-token",
    });
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());

    let capturedEmail: string | undefined;
    vi.mocked(PostService.createPost).mockImplementation(async (input) => {
      capturedEmail = input.email;
      return {
        success: true,
        postId: "post-uuid-001",
        postNumber: 2,
        systemMessages: [],
      };
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      mail: `sage#${validWriteToken}`,
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    await POST(req);
    // PostService に渡された email には write_token が含まれていない
    expect(capturedEmail).toBe("sage");
    expect(capturedEmail).not.toContain(validWriteToken);
    expect(capturedEmail).not.toContain("#");
  });

  it("mail欄が '#<write_token>' のみの場合: 除去後に空文字列として渡される", async () => {
    const validWriteToken = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    vi.mocked(AuthService.verifyWriteToken).mockResolvedValue({
      valid: true,
      edgeToken: "verified-edge-token",
    });
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());

    let capturedEmail: string | undefined;
    vi.mocked(PostService.createPost).mockImplementation(async (input) => {
      capturedEmail = input.email;
      return {
        success: true,
        postId: "post-uuid-001",
        postNumber: 2,
        systemMessages: [],
      };
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      mail: `#${validWriteToken}`,
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    await POST(req);
    // write_token のみの場合、除去後は空文字列 → PostService の email に undefined が渡される
    expect(capturedEmail).toBeUndefined();
  });

  it("無効な write_token の場合: ＥＲＲＯＲ を含む HTML を返す", async () => {
    const invalidWriteToken = "ffffffffffffffffffffffffffffffff"; // 無効なトークン
    vi.mocked(AuthService.verifyWriteToken).mockResolvedValue({ valid: false });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      mail: `#${invalidWriteToken}`,
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    const res = await POST(req);
    const buffer = await res.arrayBuffer();
    const decoded = decodeSjis(buffer);
    // ＥＲＲＯＲ レスポンスが返される
    expect(decoded).toContain("ＥＲＲＯＲ");
    // 書き込みは実行されない
    expect(PostService.createPost).not.toHaveBeenCalled();
  });

  it("無効な write_token の場合: Set-Cookie ヘッダは設定されない", async () => {
    const invalidWriteToken = "ffffffffffffffffffffffffffffffff";
    vi.mocked(AuthService.verifyWriteToken).mockResolvedValue({ valid: false });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      mail: `#${invalidWriteToken}`,
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    const res = await POST(req);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("write_token を含まない通常の mail 欄では verifyWriteToken が呼ばれない", async () => {
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostService.createPost).mockResolvedValue({
      success: true,
      postId: "post-uuid-001",
      postNumber: 2,
      systemMessages: [],
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      mail: "sage",
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    await POST(req);
    expect(AuthService.verifyWriteToken).not.toHaveBeenCalled();
  });

  it("write_token が大文字小文字混在でも正しく検出・小文字化される", async () => {
    // 大文字のhexトークン（実際には正規表現でケースインセンシティブマッチ）
    const upperWriteToken = "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4";
    const lowerWriteToken = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    vi.mocked(AuthService.verifyWriteToken).mockResolvedValue({
      valid: true,
      edgeToken: "verified-edge-token",
    });
    vi.mocked(ThreadRepository.findByThreadKey).mockResolvedValue(makeThread());
    vi.mocked(PostService.createPost).mockResolvedValue({
      success: true,
      postId: "post-uuid-001",
      postNumber: 2,
      systemMessages: [],
    });

    const body = makeShiftJisBody({
      bbs: "battleboard",
      key: "1234567890",
      mail: `#${upperWriteToken}`,
      MESSAGE: "テスト",
    });

    const req = new NextRequest("http://localhost/test/bbs.cgi", {
      method: "POST",
      body,
    });

    await POST(req);
    // 小文字化されて verifyWriteToken に渡される
    expect(AuthService.verifyWriteToken).toHaveBeenCalledWith(lowerWriteToken);
  });
});
