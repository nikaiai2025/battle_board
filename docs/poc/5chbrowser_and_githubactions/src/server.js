import "dotenv/config";
import express from "express";
import iconv from "iconv-lite";
import { threads } from "./data.js";

const PORT = process.env.PORT || 3000;
const BOARD_ID = process.env.BOARD_ID || "battleboard";

const app = express();

// リクエストログ
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`, {
    host: req.headers.host,
    "user-agent": req.headers["user-agent"],
    range: req.headers.range,
    "if-modified-since": req.headers["if-modified-since"],
  });
  next();
});

// bbs.cgi 用: bodyをrawバッファで受け取る
app.use("/:boardId/bbs.cgi", express.raw({ type: "*/*" }));

// --- ヘルパー ---

function toSjis(str) {
  return iconv.encode(str, "CP932");
}

function escapeBody(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(d) {
  const weekdays = "日月火水木金土";
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const ymd = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const day = weekdays[d.getDay()];
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const cs = pad(Math.floor(d.getMilliseconds() / 10));
  return `${ymd}(${day}) ${time}.${cs}`;
}

function decodeSjisFormBody(buf) {
  // latin1でバイト値を保持したまま文字列化
  const raw = buf.toString("latin1");
  const pairs = raw.split("&");
  const result = {};
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=");
    const encoded = rest.join("=");
    // パーセントデコード + '+' → 0x20
    const decoded = encoded.replace(/\+/g, " ").replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    // latin1文字列をバイト列に戻してShift_JISデコード
    const bytes = Buffer.from(decoded, "latin1");
    result[key] = iconv.decode(bytes, "CP932");
  }
  return result;
}

// --- エンドポイント ---

// GET /bbsmenu.html
app.get("/bbsmenu.html", (req, res) => {
  const host = req.headers.host;
  const html = `<HTML>
<HEAD><TITLE>BBS MENU</TITLE></HEAD>
<BODY>
<B>カテゴリ</B><br>
<A HREF=http://${host}/${BOARD_ID}/>BattleBoard</A><br>
</BODY>
</HTML>`;
  const body = toSjis(html);
  res.set("Content-Type", "text/html; charset=Shift_JIS");
  res.send(body);
});

// GET /:boardId/SETTING.TXT
app.get("/:boardId/SETTING.TXT", (_req, res) => {
  const settings = `BBS_TITLE=BattleBoard
BBS_TITLE_PICTURE=
BBS_NONAME_NAME=名無しさん
BBS_DELETE_NAME=名無しさん
BBS_SUBJECT_COUNT=64
BBS_NAME_COUNT=64
BBS_MAIL_COUNT=64
BBS_MESSAGE_COUNT=2048
BBS_THREAD_TATESUGI=0
BBS_LINE_NUMBER=40
BBS_UNICODE=pass`;
  const body = toSjis(settings);
  res.set("Content-Type", "text/plain; charset=Shift_JIS");
  res.send(body);
});

// GET /:boardId/subject.txt
app.get("/:boardId/subject.txt", (_req, res) => {
  const sorted = [...threads].sort((a, b) => b.lastModified - a.lastModified);
  const lines = sorted.map(t => `${t.key}.dat<>${t.title} (${t.posts.length})`).join("\n") + "\n";
  const body = toSjis(lines);
  res.set("Content-Type", "text/plain; charset=Shift_JIS");
  res.send(body);
});

// GET /:boardId/dat/:threadKey.dat
app.get("/:boardId/dat/:threadKey.dat", (req, res) => {
  const key = req.params.threadKey;
  const thread = threads.find(t => t.key === key);
  if (!thread) {
    res.status(404).send("Not Found");
    return;
  }

  // If-Modified-Since チェック
  const ims = req.headers["if-modified-since"];
  if (ims) {
    const imsDate = new Date(ims);
    if (thread.lastModified <= imsDate) {
      res.status(304).end();
      return;
    }
  }

  // DAT生成
  const lines = thread.posts.map((p, i) => {
    const title = i === 0 ? thread.title : "";
    const body = escapeBody(p.body);
    return `${p.name}<>${p.mail}<>${p.date} ID:${p.id}<>${body}<>${title}`;
  }).join("\n") + "\n";

  const fullBuf = toSjis(lines);

  res.set("Last-Modified", thread.lastModified.toUTCString());

  // Range ヘッダ対応
  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-/);
    if (match) {
      const start = parseInt(match[1], 10);
      if (start < fullBuf.length) {
        const partial = fullBuf.subarray(start);
        res.status(206);
        res.set("Content-Range", `bytes ${start}-${fullBuf.length - 1}/${fullBuf.length}`);
        res.set("Content-Type", "text/plain; charset=Shift_JIS");
        res.send(partial);
        return;
      }
    }
  }

  res.set("Content-Type", "text/plain; charset=Shift_JIS");
  res.send(fullBuf);
});

// POST /:boardId/bbs.cgi
app.post("/:boardId/bbs.cgi", (req, res) => {
  res.set("Content-Type", "text/html; charset=Shift_JIS");

  const params = decodeSjisFormBody(req.body);
  const message = (params.MESSAGE || "").trim();

  if (!message) {
    res.send(toSjis('<html><head><title>ＥＲＲＯＲ</title></head><body>本文が空です。</body></html>'));
    return;
  }

  const name = params.FROM || "名無しさん";
  const mail = params.mail || "";
  const now = new Date();
  const post = {
    name,
    mail,
    date: formatDate(now),
    id: "PoC00000",
    body: message,
  };

  const key = params.key;
  const subject = params.subject;

  if (key) {
    // 返信
    const thread = threads.find(t => t.key === key);
    if (!thread) {
      res.send(toSjis('<html><head><title>ＥＲＲＯＲ</title></head><body>スレッドが見つかりません。</body></html>'));
      return;
    }
    thread.posts.push(post);
    thread.lastModified = now;
  } else if (subject) {
    // 新規スレッド作成
    threads.push({
      key: String(Math.floor(now.getTime() / 1000)),
      title: subject,
      lastModified: now,
      posts: [post],
    });
  } else {
    res.send(toSjis('<html><head><title>ＥＲＲＯＲ</title></head><body>不正なリクエストです。</body></html>'));
    return;
  }

  console.log("書き込み:", { name, mail, message: message.substring(0, 50) });
  res.send(toSjis('<html><head><title>書きこみました</title></head><body>書きこみました。</body></html>'));
});

app.listen(PORT, () => {
  console.log(`PoC server running on http://localhost:${PORT}`);
  console.log(`板URL: http://localhost:${PORT}/${BOARD_ID}/`);
});
