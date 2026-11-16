# 大模型端点实测与兜底链

> 对应任务书「C｜LLM 端点与兜底链（子任务 C）」。
> 实测时间：2026 本机 Windows / Node 24.20 / tsx。
> 代码：`src/server/llm/providers.ts`（兜底链实现）、`src/server/llm/providers.check.ts`（自检脚本）。
> 自检命令：`npx tsx src/server/llm/providers.check.ts`（一次跑完，不需要额外参数）。
>
> **本文件不含任何密钥原文**，只出现密钥名与 `hasKey` 布尔值。

---

## 一、一句话结论

三家厂商的端点全部可达、鉴权全部走 `Authorization: Bearer <key>`：

- **DeepSeek**（`api.deepseek.com`）✅ 完全可用，且是本机实测的综合首选。
- **MiniMax**（`api.minimax.cn` / `api.minimaxi.com`）✅ 完全可用，同一把 key 两个域都能用，是第二兜底。
- **小米 MiMo token plan**（`token-plan-cn.xiaomimimo.com`）⚠️ 端点与鉴权都正常，但 **token plan 额度已耗尽，所有模型返回 HTTP 429 `quota exhausted`**，当前不可用，等额度恢复即可插回链条。

兜底链 `chat()` 已实现并实测：首选失效会自动切下一家，三家全挂会抛错且**错误信息里不含密钥原文**。

---

## 二、端点实测表（脱敏）

短请求提示词固定为「用一句话介绍你自己，20 字以内」，每端点一次请求。

耗时列为两次独立运行（`npx tsx src/server/llm/providers.check.ts`）的实测值，以「」分隔。

| # | provider id | 厂商 | baseUrl | 模型 | 状态码 | 耗时（两次） | 返回中文 | 结论 |
|---|---|---|---|---|---|---|---|---|
| 1 | `deepseek-chat` | DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-chat` | 200 | 1507ms / 4000ms | 是 | ✅ 可用 |
| 2 | `minimax-cn-m3` | MiniMax | `https://api.minimax.cn/v1/chat/completions` | `MiniMax-M3` | 200 | 1178ms / 1291ms | 是 | ✅ 可用 |
| 3 | `deepseek-reasoner` | DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-reasoner` | 200 | 1414ms / 1279ms | 是 | ✅ 可用 |
| 4 | `mimo-v2.6-pro` | 小米 MiMo | `https://token-plan-cn.xiaomimimo.com/v1/chat/completions` | `mimo-v2.6-pro` | **429** | ~150ms | 否 | ❌ `quota exhausted` |
| 5 | `minimax-cn-m25` | MiniMax | `https://api.minimax.cn/v1/chat/completions` | `MiniMax-M2.5` | 200 | 1138ms / 1005ms | 是 | ✅ 可用 |
| 6 | `minimax-intl-m3` | MiniMax | `https://api.minimaxi.com/v1/chat/completions` | `MiniMax-M3` | 200 | 2531ms / 907ms | 是 | ✅ 可用 |
| 7 | `mimo-v2.6-flash` | 小米 MiMo | `https://token-plan-cn.xiaomimimo.com/v1/chat/completions` | `mimo-v2.6-flash` | **429** | ~230ms | 否 | ❌ `quota exhausted` |

密钥状态（`providerStatus()`）：

| 密钥名 | hasKey |
|---|---|
| `DEEPSEEK_API_KEY` | 是 |
| `MINIMAX_CN_API_KEY` | 是 |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | 是 |

三家密钥都存在，但 **MiMo 那把 key 额度已耗尽** —— 有 key ≠ 能用，这正是要做兜底链的原因。

---

## 三、模型名是怎么确认的（不靠记忆）

三家端点都实现了 OpenAI 兼容的 `GET {base}/models`，所以模型名是**列出来再逐个验证**的，不是拍脑袋写的：

| 端点 | `GET /models` 返回的模型 id |
|---|---|
| `api.deepseek.com/models` | `deepseek-flash`、`deepseek-v4-pro` |
| `api.minimax.cn/v1/models` | `MiniMax-M3.1-Flash`、`MiniMax-M3`、`MiniMax-M2.7`、`MiniMax-M2.7-highspeed`、`MiniMax-M2.5`、`MiniMax-M2.5-highspeed`、`MiniMax-M2.1`、`MiniMax-M2.1-highspeed`、`MiniMax-M` |
| `api.minimaxi.com/v1/models` | 与国内域完全一致（同一把 key 也可用） |
| `token-plan-cn.xiaomimimo.com/v1/models` | `mimo-v2.6-pro`、`mimo-v2.6-flash`、`mimo-v2.5-asr`、`mimo-v2.5-tts`、`mimo-v2.5-tts-voiceclone`、`mimo-v2.5-tts-voicedesign` |

实测中逐个验证过的模型与结果：

| 模型 | 端点 | 结果 |
|---|---|---|
| `deepseek-chat` | api.deepseek.com | ✅ 200，**别名可用但不在 /models 列表里**（老牌模型名仍保留） |
| `deepseek-reasoner` | api.deepseek.com | ✅ 200，推理模型 |
| `deepseek-flash` / `deepseek-v4-pro` | api.deepseek.com | ✅ 200，但都是推理模型；`max_tokens` 给小了会把预算耗在 `reasoning_content` 上、正文为空 |
| `MiniMax-M3` | api.minimax.cn / api.minimaxi.com | ✅ 200 |
| `MiniMax-M2.5` | api.minimax.cn | ✅ 200（输出带 `<think>` 前缀） |
| `minimax-M2.5`（小写别名） | api.minimax.cn | ✅ 200，同样可用 |
| `MiniMax-M1` | api.minimax.cn | ❌ **HTTP 404** `The model "MiniMax-M1" is no longer available. (2069)` |
| `MiniMax-M2.5` | token-plan-cn.xiaomimimo.com | ❌ **HTTP 400** `Unsupported model MiniMax-M2.5`（MiMo 域不代理 MiniMax 模型） |
| `mimo-v2.6-pro` / `mimo-v2.6-flash` | token-plan-cn.xiaomimimo.com | ❌ **HTTP 429** `quota exhausted` |

> ⚠️ 任务书里猜的 `deepseek-chat` / `deepseek-reasoner` / `MiniMax-M2.5` / `minimax-M2.5` 里，
> `MiniMax-M1` 已经下线，MiMo 端点也不认 MiniMax 模型名 —— 这几个都是实测才发现的。

---

## 四、兜底顺序与实现

### 4.1 顺序（`PROVIDERS` 数组顺序即兜底顺序）

| 顺位 | provider id | 厂商 | 为什么排这个位置 |
|---|---|---|---|
| 1 | `deepseek-chat` | DeepSeek | 实测最快、输出最干净、无 `<think>` 包裹，还支持 `response_format=json_object` |
| 2 | `minimax-cn-m3` | MiniMax（国内域） | 第二家厂商，完全独立于 DeepSeek 的故障域；延迟与首选同档 |
| 3 | `deepseek-reasoner` | DeepSeek | 同域不同模型：`deepseek-chat` 因模型级原因报错时的替补；长文质量更好 |
| 4 | `mimo-v2.6-pro` | 小米 MiMo | 第三家厂商；当前 429，额度恢复后即成为真正的第三道防线 |
| 5 | `minimax-cn-m25` | MiniMax（国内域） | 同域备模型 |
| 6 | `minimax-intl-m3` | MiniMax（国际域） | 独立域名，独立故障域（与国内域延迟差约 1.5~2 倍） |
| 7 | `mimo-v2.6-flash` | 小米 MiMo | MiMo 轻量模型 |

前 3 位刻意覆盖了 **DeepSeek / MiniMax / （第 4 位 MiMo）** 三家厂商，正常情况下 3 次尝试以内就能落在一个健康端点上。

### 4.2 兜底规则

- 一次 `chat()` **最多尝试 3 家**（`MAX_PROVIDERS = 3`）。
- 失败判定：网络错误、非 2xx、超时、**空响应**（正文为空也算失败，继续往下兜）。
- **端点级故障跳过**：网络不可达或 HTTP 429（额度/限流）判定为「整个端点挂了」，同端点的其它模型直接跳过，**不消耗尝试次数**。
  例：`api.deepseek.com` 网络不通时，`deepseek-reasoner` 不会再被浪费一次尝试。
- **网络类瞬时故障允许同一家重试 1 次**（见第六节 EADDRINUSE 坑），所以极端情况下 HTTP 请求数上限是 6。
- 单请求默认超时 **60 秒**（`options.timeoutMs` 可覆盖）；**整链总时长上限 150 秒**，超时后立刻停止并抛错。
- `maxTokens` 默认 **2048**，`temperature` 默认 0.6，均可通过 `ChatOptions` 覆盖。
- 全部失败时抛 `ProviderCallError`，错误信息形如：
  `所有大模型端点均失败（尝试 3 家）：deepseek-chat(deepseek-chat): 网络错误：ECONNREFUSED；…`
  **不含任何密钥原文**（自检脚本第 3.3 步会验证这一点）。
- 运行时还会记住「上一次成功的 provider」，把它提到链条最前面，避免每次都从已经挂掉的端点开始试。

### 4.3 不依赖 `response_format=json_object`

请求体只发 `model / messages / temperature / max_tokens / stream=false`，**不发** `response_format`。
但 `chat()` 返回前会清洗模型输出：

- 剥离 `<think>…</think>` 思考块（MiniMax-M2.5 / 推理模型会带）；
- 剥离 ````json … ```` 围栏。

另外导出了 `extractJson(text)`：从「说明文字 + JSON + 说明文字」里抠出最外层 `{…}` 并去掉尾随逗号，供 `llm/client.ts` 做 zod 校验前处理。

---

## 五、推荐默认组合

| 用途 | 推荐 |
|---|---|
| **默认首选** | `deepseek-chat`（`api.deepseek.com`）—— 延迟低、中文自然、支持 json_object，四板块日常生成走它 |
| **第二兜底** | `minimax-cn-m3`（`api.minimax.cn` + `MiniMax-M3`）—— 不同厂商、不同故障域，延迟相当 |
| **第三兜底** | `deepseek-reasoner` —— 长文质量最好，适合「书籍学习 / 全球局势」这类需要长推理的板块 |
| **第四兜底（待恢复）** | `mimo-v2.6-pro` —— 额度恢复后，第三道防线换回真正的第三家厂商 |
| **跨域保险** | `minimax-intl-m3` —— 国内域被限流时的同厂商备用通道 |

调用方无需关心顺序，直接用兜底链：

```ts
import { chat } from './llm/providers.js';

const result = await chat(
  [
    { role: 'system', content: '你是讲解助手，用大白话写作。' },
    { role: 'user', content: userPrompt },
  ],
  { temperature: 0.6, maxTokens: 2048 },
);
// result.provider / result.model 告诉你这次是谁接管的，直接写进 runs 表便于排障
```

---

## 六、各家输出风格差异（实测观察）

### 6.1 短请求（同一句提示词）

同一句提示词跑两次，措辞会变（模型非确定性），下面是第一次的输出：

| provider | 实际返回 | 字数 | 耗时 |
|---|---|---|---|
| `deepseek-chat` | 「我是DeepSeek，AI助手，随时为你效劳。」 | 23 | 1507ms |
| `deepseek-reasoner` | 「我是你的智能助手，随时为你答疑解惑。」 | 18 | 1414ms |
| `minimax-cn-m3` | 「我是乐于助人的 AI 助手。」 | 14 | 1178ms |
| `minimax-cn-m25` | 「我是一个乐于助人的 AI 助手。」 | 16 | 1138ms |
| `minimax-intl-m3` | 「我是一个乐于助人的 AI 助手。」 | 16 | 2531ms |

- **DeepSeek**：自带品牌名，措辞偏「助手服务」风格，长句更多。
- **MiniMax**：明显更短更模板化（14~16 字），措辞几乎固定；国际域与国内域输出几乎一模一样。
- **MiniMax-M2.5** 会额外吐一段英文 `<think>` 思考过程（已由 `chat()` 剥离）。

### 6.2 长文（要求 ≥300 字中文）

| provider | 输出长度 | 中文占比 | 耗时 | 风格 |
|---|---|---|---|---|
| `deepseek-chat` | 528 字 / 479 中文字（第二次 537 / 482） | 91% | 8.8s / 13.5s | **最自然**：口语化、有具体例子（存一万块、年息 5%、二十年后差距），结尾收在一句生活建议上，`finish_reason=stop`，`completion_tokens=345 / 339` 远低于 2048 上限 → **未被截断** |
| `MiniMax-M3` | 1498 字（含 `<think>` 块） | — | 7.6s | 开头带一大段英文推理，正文比 DeepSeek 长一倍，结构化程度高、略啰嗦；同样 `finish_reason=stop` 未截断 |
| `deepseek-reasoner` | — | — | 慢 | 推理模型：短答就要烧 194 个 completion token（其中 185 是 `reasoning_content`）。**给 `maxTokens` 时必须留足预算**，否则正文会空，`chat()` 会把它当成失败继续兜底 |

结论：**长文质量与中文自然度，DeepSeek 系 > MiniMax 系**；**速度**，MiniMax 国内域 ≈ DeepSeek < MiniMax 国际域 < DeepSeek 推理模型。

---

## 七、踩坑清单

### A. `readSecret()` 读不到 DSH 凭据仓里的三把 key（**需要上游修**）

DSH 凭据文件 `E:\dsh-home\.credentials.yaml` 的结构是：

```
version: 1
records:
  ...
refs:
  DEEPSEEK_API_KEY: <值>
  MINIMAX_CN_API_KEY: <值>
  XIAOMI_TOKEN_PLAN_CN_API_KEY: <值>
```

三把 key 缩进在 `refs:` 块下面，而 `src/server/secrets.ts` 的 `parseKeyValueYaml()` 明确 **跳过所有以空白开头的行**（`if (/^\s/.test(raw)) continue;`），
所以 `readSecret('DEEPSEEK_API_KEY')` 返回 `undefined`（已实测确认）。

**本次的处理**：`providers.ts` 里先调项目自带的 `readSecret()`，读不到再兜一层「任意缩进的同名键」解析
（`readNestedSecret()`，只读不写、不打印、不落盘）。这样不改动边界外的 `secrets.ts`，功能也完整。

> **建议上游修**：`src/server/secrets.ts` 的 `parseKeyValueYaml()` 应支持一层缩进的 `refs:` 子块。
> 修好后 `providers.ts` 的兜底分支自动变成冗余但无害（可保留）。

### B. Windows 上 `fetch` 偶发 `EADDRINUSE`（本机端口耗尽，不是厂商故障）

现象：一批快速连发请求里，部分请求直接 `TypeError: fetch failed`，`error.cause.code === 'EADDRINUSE'`；
隔几秒再发同样的请求就全好了。实测 12 连发时 **12/12 全失败**，冷却后加 400ms 间隔 **6/6 全成功**，
`net.setDefaultAutoSelectFamily(false)` 也是 6/6 成功。

**处理**：
- `providers.ts` 里网络类错误**同一家重试 1 次**（间隔 900ms）；
- 连续两次请求之间留 **250ms** 间隔；
- 判定为网络故障时直接切到下一家。

### C. 429「额度耗尽」会被误判成「模型坏了」

MiMo 返回的是 `429 quota exhausted`，不是 400。链里把 429 归为**端点级故障**，同端点其它模型一起跳过，
避免浪费尝试次数。

### D. 推理模型会把 `max_tokens` 烧在思考里

`deepseek-flash` / `deepseek-v4-pro` / `deepseek-reasoner` 会先产出 `reasoning_content`。
`max_tokens=200` 时正文直接为空。处理：`chat()` 把「正文为空」判为失败并继续兜底；
给推理模型用时 `maxTokens` 至少给到 2048。

### E. `max_tokens` 参数名各家通用

三家都吃 OpenAI 兼容的 `max_tokens`（不是 `max_completion_tokens`），实测均正常返回 `usage.prompt_tokens / usage.completion_tokens`。

### F. MiniMax 的 `<think>` 与 JSON 围栏

MiniMax-M2.5 会把英文思考过程混进 `content`，模型偶尔也会把 JSON 包在 ````json` 里。
两者都由 `cleanModelText()` 统一剥离，`extractJson()` 再负责抠 JSON。

### G. 任务书通用约束「网络请求 10~20 秒超时」与本任务「单请求 60 秒」的取舍

本任务书明确要求「单请求默认超时 60 秒」，与通用约束的 10~20 秒冲突。**按任务书执行**：`chat()` 默认 60 秒（整链 150 秒上限）；
自检脚本里的短请求探测用 30 秒、长文用 60 秒，都不超过 60 秒上限。

### H. 密钥读取路径

`readNestedSecret()` 依次尝试：`DSH_CREDENTIALS_PATH` 环境变量 → `DSH_HOME\.credentials.yaml` → `E:\dsh-home\.credentials.yaml`。
密钥只存在于内存，进程退出即消失；所有错误信息在抛出前统一过 `redact()`。

---

## 八、自检脚本做了什么

`npx tsx src/server/llm/providers.check.ts` 一次跑完，输出五段：

0. **端点与密钥状态**：`providerStatus()` 全表（只有 `hasKey` 布尔值）。
1. **候选端点逐个实测**：每个候选端点发一次「用一句话介绍你自己，20 字以内」，打印 baseUrl / 模型 / 状态码 / 耗时 / 是否中文 / 字数 / 输出预览。
2. **长文实测**：要求 ≥300 字中文，打印接管者、耗时、中文字数、`usage`、是否疑似被截断、结尾 60 字。
3. **兜底链验证**：
   - 3.1 把 `deepseek-chat` 的 baseUrl 指向本机无效端口 → 期望自动切到 `minimax-cn-m3`；
   - 3.2 把首选+次选都指向无效端口 → 期望切到第三家 `deepseek-reasoner`；
   - 3.3 全部指向无效端口 → 期望抛错，并检查错误信息里**没有密钥原文**。
4. **结论**：可用 / 不可用端点清单。

脚本只读不写，不改任何项目文件；末尾会 `resetProviderState()` 还原所有临时覆盖。

---

## 九、涉及文件

| 文件 | 说明 |
|---|---|
| `src/server/llm/providers.ts` | 端点表 + 多级兜底 `chat()` + `providerStatus()` + 文本清洗 + 自检钩子 |
| `src/server/llm/providers.check.ts` | 自检脚本（端点实测 / 长文实测 / 兜底验证） |
| `docs/LLM-PROVIDERS.md` | 本文件 |
