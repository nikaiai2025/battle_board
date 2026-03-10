import "dotenv/config";

// TODO: クォータ復活後に Gemini API 呼び出しに戻す
const MOCK_POSTS = [
  "今日も平和だな",
  ">>3 ほんとそれ、エアコンつけたわ",
  "誰かおすすめのアニメ教えてくれ",
  "腹減った、カップ麺食うわ",
  "おまいら元気か？(´・ω・`)",
];

for (let i = 1; i <= 3; i++) {
  const start = performance.now();
  const text = MOCK_POSTS[Math.floor(Math.random() * MOCK_POSTS.length)];
  const elapsed = Math.round(performance.now() - start);
  console.log(`--- 実行 ${i} (${elapsed}ms) ---`);
  console.log(text);
  console.log();
}
