import { repairEscapedNewlines, repairPayloadStrings } from '../src/server/llm/text.js';

let failed = 0;
const assert = (name: string, cond: boolean, detail = "") => {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${name}${detail ? " —— " + detail : ""}`);
  if (!cond) failed++;
};

console.log("=== 1. 单反斜杠 n ===");
const single = "第一段\n\n第二段";
const fixedSingle = repairEscapedNewlines(single);
assert("字面量转义变成真实换行", fixedSingle === "第一段\n\n第二段", JSON.stringify(fixedSingle));

console.log("=== 2. 双反斜杠 n ===");
const dbl = "第一段\\n\\n第二段";
const fixedDbl = repairEscapedNewlines(dbl);
assert("双层转义也归一为真实换行", fixedDbl === "第一段\n\n第二段", JSON.stringify(fixedDbl));

console.log("=== 3. 正常内容不动 ===");
const good = "第一段\n\n第二段";
assert("已有真实换行不被改动", repairEscapedNewlines(good) === good);
assert("无转义内容不被改动", repairEscapedNewlines("普通中文内容") === "普通中文内容");

console.log("=== 4. 混合内容保守处理 ===");
const mixed = "第一段\n第二段\n\\n第三段";
assert("混合时保持原样（不误伤讲解 \\n 的段落）", repairEscapedNewlines(mixed) === mixed, JSON.stringify(repairEscapedNewlines(mixed)));

console.log("=== 5. 深层结构 ===");
const payload = {
  title: "标题",
  body: "正文\n\n第二段",
  meta: { items: ["甲\n乙", { deep: "丙\n丁" }] },
};
const repaired = repairPayloadStrings(payload) as any;
assert("嵌套字符串被修复", repaired.body === "正文\n\n第二段", JSON.stringify(repaired.body));
assert("数组元素被修复", repaired.meta.items[0] === "甲\n乙", JSON.stringify(repaired.meta.items[0]));
assert("再嵌套被修复", repaired.meta.items[1].deep === "丙\n丁", JSON.stringify(repaired.meta.items[1].deep));

console.log(failed === 0 ? "结果：全部通过" : `结果：${failed} 项失败`);
if (failed) process.exit(1);