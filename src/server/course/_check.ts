/**
 * 「AI 学习」课程骨架自检脚本。
 * 运行：npx tsx src/server/course/_check.ts
 *
 * 检查五件事：
 *   1. 条数与讲号：正好 40 条，no 从 1 到 40 连续无缺、无重复；
 *   2. 标题一致性：每条的 no / stage / stageTitle / title 与 types.ts 的 LESSON_TITLES 逐字一致；
 *   3. 阶段分布：S1=6、S2=8、S3=10、S4=8、S5=8，且每讲的阶段与 STAGES 声明的区间一致；
 *   4. 字段长度：goal / anchor / exercise 非空且落在规定区间（原始长度与去空白长度都要满足）；
 *   5. 关键词：每讲 3-6 个。
 *
 * 全程不发起任何网络请求。
 */
import { CURRICULUM } from './curriculum.js';
import { LESSON_TITLES, STAGES, TOTAL_LESSONS } from './types.js';

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

/** 去空白后的字符数（含中文标点）。 */
const countChars = (s: string): number => s.replace(/\s+/g, '').length;

/** 原始字符数（空格也计入）。 */
const rawLen = (s: string): number => s.length;

const failures: string[] = [];
let passed = 0;

function ok(label: string): void {
  passed += 1;
  console.log('  [PASS] ' + label);
}

function fail(label: string, detail?: string): void {
  failures.push(label + (detail ? ' —— ' + detail : ''));
  console.log('  [FAIL] ' + label + (detail ? ' —— ' + detail : ''));
}

function expect(cond: boolean, label: string, detail?: string): void {
  if (cond) ok(label);
  else fail(label, detail);
}

/**
 * 长度断言：原始长度与去空白长度都必须落在 [min, max] 内。
 * 两个口径同时约束，避免口径不同导致同一份文案忽过忽不过。
 */
function expectLen(label: string, value: string, min: number, max: number): void {
  const r = rawLen(value);
  const c = countChars(value);
  const okRange = r >= min && r <= max && c >= min && c <= max;
  expect(
    okRange,
    label,
    okRange ? undefined : '原始 ' + r + ' 字 / 去空白 ' + c + ' 字，要求两者都在 ' + min + '-' + max,
  );
}

/* ------------------------------------------------------------------ */
/* 1. 条数与讲号                                                       */
/* ------------------------------------------------------------------ */

console.log('\n[1] 条数与讲号');
expect(CURRICULUM.length === 40, '共 40 条', '实际 ' + CURRICULUM.length + ' 条');
expect(TOTAL_LESSONS === 40, 'types.ts 的 TOTAL_LESSONS 为 40', '实际 ' + TOTAL_LESSONS);

const seen = new Set<number>();
let noContinuous = true;
let noDetail = '';
for (const lesson of CURRICULUM) {
  if (seen.has(lesson.no)) {
    noContinuous = false;
    noDetail = '讲号 ' + lesson.no + ' 重复';
  }
  seen.add(lesson.no);
}
expect(noContinuous, '讲号无重复', noDetail);

const missing: number[] = [];
for (let n = 1; n <= 40; n += 1) {
  if (!seen.has(n)) missing.push(n);
}
expect(missing.length === 0, '讲号 1-40 连续无缺', '缺 ' + missing.join(', '));

const sorted = [...CURRICULUM].sort((a, b) => a.no - b.no);
expect(
  sorted.every((l, i) => l.no === i + 1),
  '按 no 升序排列后与 1-40 逐位对齐',
);
expect(
  CURRICULUM.every((l, i) => l.no === i + 1),
  '数组本身已按 no 升序（无需二次排序）',
);

/* ------------------------------------------------------------------ */
/* 2. 标题一致性                                                       */
/* ------------------------------------------------------------------ */

console.log('\n[2] 标题与 LESSON_TITLES 逐字一致');
const titleMap = new Map(LESSON_TITLES.map((t) => [t.no, t]));
let titleMismatch = 0;
let titleDetail = '';
for (const lesson of CURRICULUM) {
  const expected = titleMap.get(lesson.no);
  if (!expected) {
    titleMismatch += 1;
    titleDetail = '讲号 ' + lesson.no + ' 在 LESSON_TITLES 中不存在';
    continue;
  }
  for (const field of ['stage', 'stageTitle', 'title'] as const) {
    if (lesson[field] !== expected[field]) {
      titleMismatch += 1;
      titleDetail =
        '第 ' + lesson.no + ' 讲的 ' + field + ' 不一致：期望「' + expected[field] + '」，实际「' + lesson[field] + '」';
    }
  }
}
expect(titleMismatch === 0, '40 条的 stage / stageTitle / title 与定稿标题一字不差', titleDetail);

/* ------------------------------------------------------------------ */
/* 3. 阶段分布                                                         */
/* ------------------------------------------------------------------ */

console.log('\n[3] 阶段分布');
const expectedCount: Record<string, number> = { S1: 6, S2: 8, S3: 10, S4: 8, S5: 8 };
for (const stage of STAGES) {
  const actual = CURRICULUM.filter((l) => l.stage === stage.stage).length;
  expect(
    actual === expectedCount[stage.stage],
    stage.stage + ' 共 ' + expectedCount[stage.stage] + ' 讲',
    '实际 ' + actual + ' 讲',
  );
}
const totalByStage = Object.values(expectedCount).reduce((a, b) => a + b, 0);
expect(totalByStage === CURRICULUM.length, '各阶段讲数之和等于总讲数', String(totalByStage));

let rangeMismatch = '';
for (const stage of STAGES) {
  for (const lesson of CURRICULUM.filter((l) => l.stage === stage.stage)) {
    if (lesson.no < stage.from || lesson.no > stage.to) {
      rangeMismatch = '第 ' + lesson.no + ' 讲标为 ' + stage.stage + '，却不在 ' + stage.from + '-' + stage.to + ' 区间内';
    }
    if (lesson.stageTitle !== stage.title) {
      rangeMismatch = '第 ' + lesson.no + ' 讲的 stageTitle 与 STAGES 中的 ' + stage.stage + ' 标题不一致';
    }
  }
}
expect(rangeMismatch === '', '每讲的阶段与 stageTitle 都落在 STAGES 声明的区间与标题上', rangeMismatch);

/* ------------------------------------------------------------------ */
/* 4. 字段长度                                                         */
/* ------------------------------------------------------------------ */

console.log('\n[4] 字段长度');
for (const lesson of CURRICULUM) {
  const tag = '第 ' + lesson.no + ' 讲';

  expect(lesson.goal.trim().length > 0, tag + ' goal 非空');
  expectLen(tag + ' goal 长度 20-40', lesson.goal, 20, 40);

  expect(lesson.anchor.trim().length > 0, tag + ' anchor 非空');
  expectLen(tag + ' anchor 长度 40-90', lesson.anchor, 40, 90);

  expect(lesson.exercise.trim().length > 0, tag + ' exercise 非空');
  expectLen(tag + ' exercise 长度 30-70', lesson.exercise, 30, 70);

  expect(lesson.prerequisite.trim().length > 0, tag + ' prerequisite 非空');
  if (lesson.no === 1) {
    expect(lesson.prerequisite === '无', '第 1 讲 prerequisite 为「无」', '实际「' + lesson.prerequisite + '」');
  } else {
    expectLen(tag + ' prerequisite 长度 10-30', lesson.prerequisite, 10, 30);
  }
}

/* ------------------------------------------------------------------ */
/* 5. 关键词                                                           */
/* ------------------------------------------------------------------ */

console.log('\n[5] 关键词');
for (const lesson of CURRICULUM) {
  const tag = '第 ' + lesson.no + ' 讲';
  const kws = lesson.keywords;
  expect(Array.isArray(kws) && kws.length >= 3 && kws.length <= 6, tag + ' keywords 数量 3-6', '实际 ' + kws.length);
  expect(
    kws.every((k) => typeof k === 'string' && k.trim().length > 0),
    tag + ' keywords 均为非空字符串',
  );
  expect(new Set(kws).size === kws.length, tag + ' keywords 无重复项');
}

/* ------------------------------------------------------------------ */
/* 汇总                                                               */
/* ------------------------------------------------------------------ */

console.log('\n[汇总]');
console.log('  断言通过：' + passed + ' 项');
console.log('  断言失败：' + failures.length + ' 项');
if (failures.length > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  - ' + f);
  console.log('\n结果：不通过');
  process.exit(1);
}
console.log('\n结果：全部通过 ✅');
