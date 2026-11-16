// 语音合成管线自检脚本。
//
// 运行：npx tsx src/server/tts/_check.ts（工作目录为项目根）
//
// 依次验证：音色列表、>=800 字中文稿实测落盘、MP3 头解析有效性、
// 长文本（>2000 字）分段合成不丢内容、原生协议兜底可用。

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUDIO_DIR } from '../config.js';
import { DEFAULT_VOICE, estimateDurationSeconds, listVoices, splitIntoSegments, synthesize } from './edge.js';
import { countSilentFrames, parseMp3 } from './mp3.js';

const PROBE_TEXT = [
  '欢迎来到我的窗口。这是一个每天自动更新的个人学习站点，它把四类内容摆在同一个页面里，让你每天打开就能读，不用自己到处找信息。',
  '第一个板块是书籍学习。社会学、经济学、历史学、哲学、金融和人工智能六个方向轮流出现，每天讲一本书的核心观点。每一篇都会先说清楚这本书到底在讲什么，再解释它跟你的日常生活有什么关系，最后给出三到五个可以带走的要点。读完一篇，大概需要十分钟。',
  '第二个板块是前沿的人工智能应用。这一部分每周更新五个在 GitHub 上真正有人用的开源项目。我们不按热度排序，而是看最近一周新建、并且已经拿到足够星标的项目，再读一遍它们的说明文档，确认它到底能做什么、适合谁用、上手要几步。这样你看到的不是新闻稿，而是点开就用的东西。',
  '第三个板块是全球与中国的金融市场。这里最重要的一条规则是：所有数字都来自真实的行情接口，模型只负责解释，不负责编造。每一个涨跌幅、每一根蜡烛线都能追溯到具体的来源链接，读者可以自己点开核对。如果某个数字找不到出处，那它就不应该出现在文章里。',
  '第四个板块是全球局势，每天挑五件真正在发生的大事。每一件事都回答四个问题：发生了什么，为什么重要，会造成什么影响，以及接下来该看什么。还会标注置信度，区分哪些是已经确认的事实，哪些只是目前的推断。把事实和推断分开写，是为了让你知道该信到什么程度。',
  '至于朗读，这四类内容都可以直接用语音合成听。服务端把讲解稿切成小段送给在线语音服务，合成完之后拼成一个完整的音频文件，段落之间会留一秒的停顿。如果服务端合成失败，页面会自动退回浏览器自带的语音朗读，保证你永远有办法把一篇文章听完。',
  '整套内容每天由计划任务自动生成一次。生成的时候会把来源、抓取结果、模型输出和音频一起写进数据库，任何一步出问题都会留下记录，方便第二天回看。这不是一个需要维护的内容农场，它更像是一个每天早上自己准备好教材的私人课堂。你唯一需要做的事情，就是打开它，读完，然后继续。',
].join('');

/** 生成指定长度的中文朗读稿，用于长度对照实验 */
function makeChineseText(length: number): string {
  const base = '这是一段用于验证长文本合成是否丢内容的中文朗读稿，里面混有标点、数字与英文 Sample。';
  let text = '';
  while (text.length < length) text += base;
  return text.slice(0, length);
}

let failures = 0;

function check(label: string, condition: boolean, detail: string): void {
  const mark = condition ? 'PASS' : 'FAIL';
  console.log('  [' + mark + '] ' + label + ' —— ' + detail);
  if (!condition) failures += 1;
}

function formatBytes(bytes: number): string {
  return (bytes / 1024).toFixed(1) + ' KiB (' + bytes + ' 字节)';
}

const MODE = (process.env.TTS_CHECK_MODE ?? 'all').toLowerCase();

async function main(): Promise<void> {
  if (MODE === 'all' || MODE === 'quick' || MODE === 'protocol') {
  console.log('================ 1. 原生 WebSocket 协议兜底（先跑，保证连接条件干净） ================');
  process.env.TTS_BACKEND = 'protocol';
  const fallbackFile = path.join(os.tmpdir(), 'tts-fallback-' + Date.now() + '.mp3');
  try {
    const fallback = await synthesize('这是原生协议兜底路径的验证语音。', fallbackFile);
    const fallbackInfo = parseMp3(await fs.readFile(fallback.filePath));
    console.log('兜底输出：' + fallback.filePath);
    console.log('兜底字节：' + formatBytes(fallback.bytes) + '，时长 ' + fallback.estimatedSeconds + ' 秒');
    console.log('MP3 头解析：' + fallbackInfo.version + ' ' + fallbackInfo.layer + ' / ' + fallbackInfo.sampleRate + ' Hz / ' + fallbackInfo.bitrateKbps + ' kbps / ' + fallbackInfo.channels + ' 声道');
    check('原生协议兜底能产出有效 MP3', fallback.bytes > 0 && fallbackInfo.frameCount > 0, fallbackInfo.frameCount + ' 帧 / ' + fallbackInfo.durationSeconds.toFixed(2) + ' 秒');
  } finally {
    delete process.env.TTS_BACKEND;
    await fs.rm(fallbackFile, { force: true });
  }
  console.log('');
  }

  if (MODE === 'all' || MODE === 'quick') {
  console.log('================ 2. 音色列表（zh-CN） ================');
  const voices = await listVoices();
  console.log('默认音色：' + DEFAULT_VOICE);
  console.log('共 ' + voices.length + ' 个 zh-CN 音色：');
  for (const voice of voices) {
    console.log('  - ' + voice.name.padEnd(28) + ' | ' + voice.locale.padEnd(16) + ' | ' + voice.gender.padEnd(7) + ' | ' + (voice.friendlyName ?? ''));
  }
  check('zh-CN 音色数量 >= 3', voices.length >= 3, '实际 ' + voices.length + ' 个');
  check('默认音色在可用列表中', voices.some((voice) => voice.name === DEFAULT_VOICE), DEFAULT_VOICE);

  console.log('');
  console.log('================ 3. 长稿实测（>=800 字） ================');
  console.log('朗读稿字符数：' + PROBE_TEXT.length + '（含标点）');
  console.log('文本估算时长：' + estimateDurationSeconds(PROBE_TEXT) + ' 秒');
  const probeFile = path.join(AUDIO_DIR, '_tts_probe.mp3');
  const probe = await synthesize(PROBE_TEXT, probeFile);
  console.log('输出路径：' + probe.filePath);
  console.log('文件字节：' + formatBytes(probe.bytes));
  console.log('实测时长：' + probe.estimatedSeconds + ' 秒');
  console.log('使用音色：' + probe.voice);

  const stat = await fs.stat(probe.filePath);
  const raw = await fs.readFile(probe.filePath);
  const info = parseMp3(raw);
  console.log('MP3 头解析：' + info.version + ' ' + info.layer + ' / ' + info.sampleRate + ' Hz / ' + info.bitrateKbps + ' kbps / ' + info.channels + ' 声道');
  console.log('有效帧数：' + info.frameCount + '，帧头前 16 字节：' + raw.subarray(0, 16).toString('hex'));
  check('稿件 >= 800 字', PROBE_TEXT.length >= 800, PROBE_TEXT.length + ' 字');
  check('文件已落盘且字节数一致', stat.size === probe.bytes && stat.size > 0, formatBytes(stat.size));
  check('MP3 帧头可解析（不是空文件）', info.frameCount > 0 && info.durationSeconds > 0, info.frameCount + ' 帧 / ' + info.durationSeconds.toFixed(2) + ' 秒');
  check('全文件字节都属于连续合法帧', info.coveredBytes === raw.length, '帧覆盖 ' + info.coveredBytes + ' / 文件 ' + raw.length + ' 字节');
  check('实测时长与文本估算接近（误差 < 40%）', Math.abs(info.durationSeconds - estimateDurationSeconds(PROBE_TEXT)) / info.durationSeconds < 0.4, '实测 ' + info.durationSeconds.toFixed(2) + ' 秒 vs 估算 ' + estimateDurationSeconds(PROBE_TEXT) + ' 秒');

  }

  if (MODE === 'all') {
  console.log('');
  console.log('================ 4. 长文本分段合成不丢内容 ================');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-check-'));
  const singleText = makeChineseText(2000);
  const longText = makeChineseText(4200);
  const singleFile = path.join(tmpDir, 'single.mp3');
  const longFile = path.join(tmpDir, 'long.mp3');
  const single = await synthesize(singleText, singleFile);
  const long = await synthesize(longText, longFile);
  const segments = splitIntoSegments(longText);
  console.log('2000 字单段：' + formatBytes(single.bytes) + '，时长 ' + single.estimatedSeconds + ' 秒，段数 ' + splitIntoSegments(singleText).length);
  console.log('4200 字长文：' + formatBytes(long.bytes) + '，时长 ' + long.estimatedSeconds + ' 秒，段数 ' + segments.length);
  console.log('字节比：' + (long.bytes / single.bytes).toFixed(2) + ' 倍（要求 > 1.50）');
  check('长文本被切成 >= 3 段', segments.length >= 3, segments.length + ' 段，每段 <= 2000 字符');
  check('每段字符数 <= 2000', segments.every((segment) => segment.length <= 2000), '最长段 ' + Math.max(...segments.map((s) => s.length)) + ' 字符');
  check('长文本字节数 > 单段的 1.5 倍', long.bytes > single.bytes * 1.5, long.bytes + ' > ' + Math.round(single.bytes * 1.5));
  const longRaw = await fs.readFile(longFile);
  const longInfo = parseMp3(longRaw);
  const silentFrames = countSilentFrames(longRaw);
  console.log('长文中的静音帧：' + silentFrames + ' 帧（约 ' + (silentFrames * 0.024).toFixed(2) + ' 秒，2 段间隙各约 1 秒）');
  check('拼接后 MP3 帧连续可解析', longInfo.frameCount > 0 && longInfo.durationSeconds > single.estimatedSeconds, longInfo.frameCount + ' 帧 / ' + longInfo.durationSeconds.toFixed(2) + ' 秒');
  check('拼接后全文件字节都属于连续合法帧', longInfo.coveredBytes === longRaw.length, '帧覆盖 ' + longInfo.coveredBytes + ' / 文件 ' + longRaw.length + ' 字节');
  check('段间静音已写入（静音帧 >= 80）', silentFrames >= 80, silentFrames + ' 帧');
  await fs.rm(tmpDir, { recursive: true, force: true });
  }


  console.log('');
  console.log('================ 结果 ================');
  if (failures === 0) {
    console.log('全部检查通过（0 项失败）');
  } else {
    console.log('失败项：' + failures);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('自检脚本异常终止：' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
