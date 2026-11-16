import { similarity, checkDuplicate, collectRecent, findDuplicateEvents, collectRecentWorldEvents, buildNoRepeatInstruction } from '../src/server/pipeline/dedupe.js';

let failed = 0;
const assert = (name: string, cond: boolean, detail = "") => {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${name}${detail ? " —— " + detail : ""}`);
  if (!cond) failed++;
};

console.log("=== 1. 相似度基础 ===");
const a1 = "科技成长承压，资金转向防御，市场情绪偏谨慎，分化明显";
const a2 = "科技成长承压，资金转向防御，市场情绪偏谨慎，分化明显";
const a3 = "今天宏观数据偏暖，债券收益率回落，黄金与美元走势分化，避险情绪有所缓解";
assert("同文相似度接近 1", similarity(a1, a2) > 0.95, similarity(a1, a2).toFixed(3));
assert("异题相似度足够低", similarity(a1, a3) < 0.2, similarity(a1, a3).toFixed(3));

console.log("=== 2. 查重判定 ===");
const recent = [
  { id: "x1", date: "2026-11-15", title: "科技股承压，资金转向防御", summary: a1, keys: [] },
  { id: "x2", date: "2026-11-14", title: "宏观数据偏暖，债市走强", summary: a3, keys: [] },
];
const same = checkDuplicate("markets", { title: "科技股承压，资金转向防御", summary: a1 }, recent);
assert("照搬判为 copy", same.level === "copy", `${same.level} ${same.score.toFixed(3)}`);
const diff = checkDuplicate("markets", { title: "人民币汇率走强，北向资金流入", summary: "汇率与资金面的变化是今天的主线，外资流入节奏比指数涨跌更值得看。" }, recent);
assert("新话题判为 none", diff.level === "none", `${diff.level} ${diff.score.toFixed(3)}`);
const near = checkDuplicate("markets", { title: "科技股承压资金转向防御", summary: "科技成长承压，资金转向防御，情绪谨慎，分化明显，市场情绪偏弱" }, recent);
assert("同义改写判为 topic 或 copy", near.level === "topic" || near.level === "copy", `${near.level} ${near.score.toFixed(3)}`);

console.log("=== 3. 事件级查重 ===");
const pastEvents = [
  { date: "2026-11-15", title: "中美俄领导人将在深圳峰会讨论世界和平", whatHappened: "峰会安排公布" },
];
const dup = findDuplicateEvents({ meta: { events: [{ title: "中美俄领导人将在深圳峰会讨论世界和平" }, { title: "某机构下修算力预测" }] } }, pastEvents);
assert("讲过的事件被识别", dup.count === 1, `count=${dup.count}`);
const fresh = findDuplicateEvents({ meta: { events: [{ title: "完全不同的新事件甲" }, { title: "完全不同的新事件乙" }] } }, pastEvents);
assert("新事件不被误判", fresh.count === 0, `count=${fresh.count}`);

console.log("=== 4. 指令生成 ===");
const instr = buildNoRepeatInstruction(same, "全球与中国金融");
assert("指令含被命中的旧标题", instr.includes("科技股承压"), "");
assert("指令含对比要求", instr.includes("相比上次新增了什么"), "");

console.log("=== 5. 真实历史语料 ===");
for (const sec of ["books", "markets", "world", "ai-tools"] as const) {
  const items = collectRecent(sec, 21);
  console.log(`  ${sec}: 历史条目 ${items.length} 条`);
  if (items.length) {
    const self = checkDuplicate(sec, { title: items[0].title, summary: items[0].summary }, items);
    assert(`${sec} 与自身历史判为 copy`, self.level === "copy", `${self.level}`);
  }
}
const evs = collectRecentWorldEvents(10);
console.log(`  world: 历史事件 ${evs.length} 条`);

console.log(failed === 0 ? "结果：全部通过" : `结果：${failed} 项失败`);
if (failed) process.exit(1);