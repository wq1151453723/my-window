import { CURRICULUM } from '../src/server/course/curriculum.js';
import { STAGES, TOTAL_LESSONS } from '../src/server/course/types.js';

console.log(`共 ${CURRICULUM.length} 讲 / 计划 ${TOTAL_LESSONS} 讲`);
for (const s of STAGES) {
  const n = CURRICULUM.filter((l) => l.stage === s.stage).length;
  console.log(`  ${s.stage} ${s.title}：${n} 讲（计划 ${s.to - s.from + 1}）`);
}
console.log("");
for (const n of [1, 2, 5, 12, 20, 33, 40]) {
  const l = CURRICULUM.find((x) => x.no === n);
  if (!l) { console.log(`#${n} 缺失`); continue; }
  console.log(`#${l.no} [${l.stage} ${l.stageTitle}] ${l.title}`);
  console.log(`   目标：${l.goal}`);
  console.log(`   锚点：${l.anchor}`);
  console.log(`   练习：${l.exercise}`);
  console.log(`   前置：${l.prerequisite} | 关键词：${l.keywords.join(" / ")}`);
  console.log("");
}
