/**
 * providers.ts 自检脚本：端点实测 + 长文实测 + 兜底链验证。
 *
 * 运行：npx tsx src/server/llm/providers.check.ts
 *
 * 打印内容全部经过脱敏：本脚本只打印 hasKey 布尔值，永远不打印密钥原文。
 */

import {
  PROVIDERS,
  ProviderCallError,
  callProvider,
  chat,
  containsSecretValue,
  overrideProviderBaseUrl,
  providerStatus,
  resetProviderState,
  type ChatMessage,
} from './providers.js';

const SHORT_PROMPT = '用一句话介绍你自己，20 字以内';
const LONG_PROMPT =
  '请写一段不少于 300 字的简体中文短文，主题是「普通人怎么理解复利」，讲人话、不要分点、不要标题，结尾收束到一句生活化的建议。';

/** 故意指向一个没人监听的本机端口，用来模拟「首选 provider 挂了」。 */
const deadUrl = (index: number): string => `http://127.0.0.1:${45001 + index}/v1/chat/completions`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

function countChinese(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
}

/** 按显示宽度补齐（中文算两格）。 */
function pad(text: string, width: number): string {
  let visual = 0;
  for (const ch of text) visual += /[\u3400-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  return text + ' '.repeat(Math.max(1, width - visual));
}

function briefError(error: unknown): string {
  if (error instanceof ProviderCallError) {
    const status = error.status ? `HTTP ${error.status}` : error.kind;
    return `${status} · ${error.message}`;
  }
  if (error instanceof Error) return `${error.name} · ${error.message}`;
  return String(error);
}

function section(title: string): void {
  console.log('');
  console.log('════════ ' + title + ' ════════');
}

async function main(): Promise<void> {
  console.log('我的窗口 · 大模型端点实测（providers.check.ts）');
  console.log('提示：本输出不含任何密钥原文，仅显示 hasKey 布尔值。');

  /* ---------------- 0. 端点与密钥状态 ---------------- */
  section('0. 端点与密钥状态（providerStatus）');
  console.log(
    pad('provider id', 22) +
      pad('baseUrl', 52) +
      pad('model', 20) +
      'hasKey',
  );
  console.log('-'.repeat(102));
  for (const row of providerStatus()) {
    console.log(pad(row.id, 22) + pad(row.baseUrl, 52) + pad(row.model, 20) + (row.hasKey ? '是' : '否'));
  }

  /* ---------------- 1. 候选端点逐个实测 ---------------- */
  section('1. 候选端点逐个实测（短请求：「' + SHORT_PROMPT + '」）');
  console.log(
    pad('provider id', 22) +
      pad('model', 20) +
      pad('状态码', 8) +
      pad('耗时', 10) +
      pad('中文', 6) +
      pad('字数', 6) +
      '输出预览 / 失败原因',
  );
  console.log('-'.repeat(102));

  const probeRows: Array<{
    id: string;
    baseUrl: string;
    model: string;
    status: string;
    latencyMs: number;
    chinese: boolean;
    length: number;
    note: string;
  }> = [];

  for (const spec of PROVIDERS) {
    try {
      const result = await callProvider(
        spec.id,
        [{ role: 'user', content: SHORT_PROMPT }],
        { maxTokens: 512, timeoutMs: 30_000 },
      );
      probeRows.push({
        id: spec.id,
        baseUrl: spec.baseUrl,
        model: spec.model,
        status: '200',
        latencyMs: result.latencyMs,
        chinese: hasChinese(result.text),
        length: result.text.length,
        note: result.text.replace(/\s+/g, ' ').slice(0, 46),
      });
    } catch (error) {
      probeRows.push({
        id: spec.id,
        baseUrl: spec.baseUrl,
        model: spec.model,
        status: error instanceof ProviderCallError && error.status ? String(error.status) : 'ERR',
        latencyMs: 0,
        chinese: false,
        length: 0,
        note: briefError(error),
      });
    }
    await sleep(400);
  }

  for (const row of probeRows) {
    console.log(
      pad(row.id, 22) +
        pad(row.model, 20) +
        pad(row.status, 8) +
        pad(row.latencyMs + 'ms', 10) +
        pad(row.chinese ? '是' : '否', 6) +
        pad(String(row.length), 6) +
        row.note,
    );
  }

  /* ---------------- 2. 长文实测 ---------------- */
  section('2. 长文实测（要求 ≥300 字中文，验证长输出不被截断）');
  const longMessages: ChatMessage[] = [{ role: 'user', content: LONG_PROMPT }];
  const longStart = Date.now();
  const longResult = await chat(longMessages, { maxTokens: 2048, timeoutMs: 60_000 });
  const longChinese = countChinese(longResult.text);
  const longTruncated =
    typeof longResult.usage?.completionTokens === 'number'
      ? longResult.usage.completionTokens >= 2048 - 8
      : false;
  console.log('接管 provider     : ' + longResult.provider + ' (' + longResult.model + ')');
  console.log('耗时              : ' + (Date.now() - longStart) + 'ms');
  console.log('总字数 / 中文字数 : ' + longResult.text.length + ' / ' + longChinese);
  console.log('usage             : ' + JSON.stringify(longResult.usage ?? null));
  console.log('是否达到 300 中文字: ' + (longChinese >= 300 ? '是' : '否'));
  console.log('是否疑似被截断    : ' + (longTruncated ? '是（completionTokens 顶到上限）' : '否'));
  console.log('结尾 60 字        : ' + JSON.stringify(longResult.text.slice(-60)));

  /* ---------------- 3. 兜底链验证 ---------------- */
  section('3. 兜底链验证（临时把首选 provider 的 baseUrl 指向无效地址）');

  // 3.1 首选失效
  resetProviderState();
  overrideProviderBaseUrl('deepseek-chat', deadUrl(0));
  const t31 = Date.now();
  try {
    const r = await chat([{ role: 'user', content: SHORT_PROMPT }], { maxTokens: 256, timeoutMs: 20_000 });
    console.log(
      '3.1 首选 deepseek-chat 失效 → 成功接管: ' +
        r.provider +
        ' (' +
        r.model +
        ')，耗时 ' +
        (Date.now() - t31) +
        'ms',
    );
    console.log('    返回内容: ' + JSON.stringify(r.text.replace(/\s+/g, ' ').slice(0, 50)));
    console.log('    结论: ' + (r.provider !== 'deepseek-chat' ? '兜底成功（已自动切换）' : '未切换（异常）'));
  } catch (error) {
    console.log('3.1 失败: ' + briefError(error));
  }

  // 3.2 首选 + 次选同时失效
  resetProviderState();
  overrideProviderBaseUrl('deepseek-chat', deadUrl(0));
  overrideProviderBaseUrl('minimax-cn-m3', deadUrl(1));
  const t32 = Date.now();
  try {
    const r = await chat([{ role: 'user', content: SHORT_PROMPT }], { maxTokens: 256, timeoutMs: 20_000 });
    console.log(
      '3.2 首选+次选失效 → 成功接管: ' +
        r.provider +
        ' (' +
        r.model +
        ')，耗时 ' +
        (Date.now() - t32) +
        'ms',
    );
    console.log('    结论: ' + (r.provider !== 'deepseek-chat' ? '兜底成功（已切到第三家）' : '未切换（异常）'));
  } catch (error) {
    console.log('3.2 失败: ' + briefError(error));
  }

  // 3.3 全部失效 → 抛错，且错误信息不含密钥
  resetProviderState();
  PROVIDERS.forEach((spec, index) => overrideProviderBaseUrl(spec.id, deadUrl(index)));
  try {
    await chat([{ role: 'user', content: SHORT_PROMPT }], { maxTokens: 256, timeoutMs: 20_000 });
    console.log('3.3 全部失效 → 未抛错（异常）');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log('3.3 全部失效 → 已按预期抛错');
    console.log('    错误信息: ' + message);
    console.log('    错误信息是否含密钥原文: ' + (containsSecretValue(message) ? '是（异常！）' : '否'));
  }
  resetProviderState();

  /* ---------------- 4. 结论 ---------------- */
  section('4. 结论');
  const usable = probeRows.filter((row) => row.status === '200');
  console.log('候选端点总数: ' + probeRows.length + '，实测 200 可用: ' + usable.length);
  for (const row of usable) {
    console.log(
      '  ✔ ' +
        pad(row.id, 22) +
        pad(row.model, 20) +
        pad(row.latencyMs + 'ms', 10) +
        '中文=' +
        (row.chinese ? '是' : '否'),
    );
  }
  for (const row of probeRows.filter((r) => r.status !== '200')) {
    console.log('  ✘ ' + pad(row.id, 22) + pad(row.model, 20) + row.status + ' → ' + row.note);
  }
  console.log('');
  console.log('自检结束。');
}

main().catch((error) => {
  console.error('自检脚本异常终止: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
