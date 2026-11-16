# 语音朗读管线（TTS）

> 边界：`src/server/tts/**`。本文是这条管线的唯一说明与决策记录，代码与本文冲突时以本文为准。
> 最后实测：2026-11-16，Windows / Node 24.20.0 / msedge-tts 2.1.1。

## 一、这条管线做什么

把中文讲解稿真实合成成 MP3 落盘，让网页用 `<audio>` 直接播放朗读。

| 项 | 值 |
|---|---|
| 主路径 | 已安装的 `msedge-tts`（Edge 在线神经语音，无需任何 API key） |
| 兜底路径 | Node 24 内置全局 `WebSocket` 自实现 Edge 协议（`src/server/tts/protocol.ts`） |
| 输出格式 | MPEG-2 Layer III / 24000 Hz / 48 kbps / 单声道 MP3 |
| 语音来源 | Microsoft Edge「朗读」在线服务（`speech.platform.bing.com`） |
| 单次上限 | 每次送入 ≤ 2000 字符，超出自动切段 |
| 段间停顿 | 1 秒静音（静音帧拼接，不是 SSML `<break>`） |
| 失败策略 | 抛中文 Error，绝不静默返回空文件；主路径挂了自动切兜底路径 |
| 重试策略 | 兜底路径单次 30 秒超时，最多 4 次尝试，退避 1.2 s / 3 s / 6 s |

## 二、可用音色清单（zh-CN，实测 8 个）

接口：`GET https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`

| ShortName | Locale | 性别 | 特点 | 适合场景 |
|---|---|---|---|---|
| `zh-CN-XiaoxiaoNeural` | zh-CN | 女 | 微软官方最通用的中文女声，音色自然、咬字清楚、讲解感强 | **默认**，长篇连读 |
| `zh-CN-XiaoyiNeural` | zh-CN | 女 | 比晓晓更年轻明亮，语速感偏快 | 短段落、活泼题材 |
| `zh-CN-YunxiNeural` | zh-CN | 男 | 沉稳男声，音色偏低，接近播音腔 | 财经、历史类长文 |
| `zh-CN-YunjianNeural` | zh-CN | 男 | 新闻播报腔，咬字硬、节奏紧 | 全球局势、要点速览 |
| `zh-CN-YunyangNeural` | zh-CN | 男 | 央视主播风格，专业稳重 | 金融播报 |
| `zh-CN-YunxiaNeural` | zh-CN | 男 | 语速偏快，偏解说 | 工具类、教程类 |
| `zh-CN-liaoning-XiaobeiNeural` | zh-CN-liaoning | 女 | 东北官话口音 | 方言彩蛋，不适合正式内容 |
| `zh-CN-shaanxi-XiaoniNeural` | zh-CN-shaanxi | 女 | 陕西方言口音 | 方言彩蛋，不适合正式内容 |

> 每次请求只过滤 `locale` 以 `zh-CN` 开头的音色；`zh-HK` / `zh-TW` 等繁体音色当前不返回。

## 三、默认音色与选择理由

`DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"`

理由：

1. **场景匹配**：这个项目是「每天读一篇」的长期场景，单次朗读接近 3 分钟。晓晓属于微软官方最通用的自然音，长时间听不疲劳，男声播报腔在长段落里更容易听累。
2. **讲解感强**：项目产出的 `script` 是口语化讲解稿，不是新闻通稿。晓晓的语调起伏更适合承接「先说结论、再讲原因、最后给要点」这种结构。
3. **稳定性**：在 Edge 免费端点上，晓晓是可用性最稳的一档；方言音色（东北、陕西）在长文本下偶有节奏抖动。
4. **与既有决策一致**：`docs/PLAN.md` 第七章已写明「中文优先 `zh-CN-XiaoxiaoNeural`（女声、讲解感强）与 `zh-CN-YunxiNeural`（男声、沉稳）」，此处只是把首选落地为默认值。

换音色不需要改代码：`synthesize(text, outFile, { voice: "zh-CN-YunxiNeural" })` 即可。

## 四、对外 API（签名固定）

```ts
// src/server/tts/edge.ts
export interface TtsOptions { voice?: string; rate?: string; volume?: string; pitch?: string; }
export interface TtsResult { filePath: string; bytes: number; voice: string; estimatedSeconds: number; }
export async function synthesize(text: string, outFile: string, options?: TtsOptions): Promise<TtsResult>;
export async function listVoices(): Promise<Array<{ name: string; locale: string; gender: string; friendlyName?: string }>>;
export function estimateDurationSeconds(text: string): number;
export const DEFAULT_VOICE: string;
```

| 导出 | 说明 |
|---|---|
| `synthesize` | 合成并落盘。长文本自动切段顺序合成，段间插 1 秒静音，最后按字节拼成一个 MP3。失败抛中文 Error。 |
| `listVoices` | 返回 zh-CN 音色清单。 |
| `estimateDurationSeconds` | **纯文本**估算朗读时长，用于合成前预估（比如填 `reading_minutes`）。 |
| `DEFAULT_VOICE` | 默认音色名。 |

> `TtsResult.estimatedSeconds` 字段名带 estimated，但它的值是**合成后从 MP3 帧头实测**的时长（比文本估算准），
> 字段名是契约固定不可改。两者关系：实测 169.20 秒 vs 文本估算 167.61 秒，误差 0.9%。

`rate` / `volume` / `pitch` 既接受 `msedge-tts` 的枚举值（`RATE.FAST`、`VOLUME.SOFT`、`PITCH.HIGH`），
也接受 SSML 相对写法（`+10%`、`-2st`、`+50Hz`、`0.5`）。无法识别的取值会退回默认值，不会把脏值塞进 SSML。

## 五、调用示例

### 服务端合成一篇朗读稿

```ts
import path from "node:path";
import { AUDIO_DIR } from "../config.js";
import { DEFAULT_VOICE, synthesize } from "./tts/edge.js";

export async function makeAudio(articleId: string, script: string): Promise<string> {
  const outFile = path.join(AUDIO_DIR, articleId + ".mp3");
  const result = await synthesize(script, outFile, { voice: DEFAULT_VOICE });
  // result.filePath / result.bytes / result.estimatedSeconds
  return result.filePath;
}
```

### 临时跑一次看看效果

```bash
npx tsx -e "import { synthesize } from './src/server/tts/edge.js'; synthesize('这是一段测试朗读稿。', 'data/audio/demo.mp3').then(console.log)"
```

### 完整自检

```bash
npx tsx src/server/tts/_check.ts
```

自检脚本分四段，顺序固定为「① 原生协议兜底 → ② 音色列表 → ③ 长稿实测 → ④ 长文本分段」：
原生协议放在最前面，是因为它要抢一个「干净」的连接条件（原因见第九节第 12 条）。

可用环境变量只跑其中一段（省网络请求）：

```bash
npx tsx src/server/tts/_check.ts                      # 全量（默认）
$env:TTS_CHECK_MODE='quick'; npx tsx src/server/tts/_check.ts      # 跳过耗时的长文本对照实验
$env:TTS_CHECK_MODE='protocol'; npx tsx src/server/tts/_check.ts  # 只跑原生协议兜底
```

### 强制走原生协议兜底

```bash
$env:TTS_BACKEND='protocol'; npx tsx src/server/tts/_check.ts
```

## 六、长文本策略

1. `splitIntoSegments(text, 2000)`：先按句末标点（`。！？；\n`）切句，再贪心装段；
   单句超长时在逗号处二次断开，硬上限 2000 字符。
2. 逐段顺序合成（同一个 WebSocket 连接，避免反复握手）。
3. 段与段之间插入 1 秒静音：`buildSilentMp3(1)` 生成 42 帧同规格静音帧（42 × 24 ms ≈ 1.008 秒）。
4. 全部按字节拼接成一个 MP3 落盘。

拼接安全性：Edge 输出的每段 MP3 都是连续的 MPEG-2 Layer III 帧（无 ID3 头），
拼接后所有帧依然连续、帧长对齐，浏览器可以整段播放。实测 4200 字长文 = 34543 帧，
帧覆盖字节数 = 文件字节数（4974192 / 4974192），没有空洞。

## 七、失败排查路径

| 现象 | 可能原因 | 排查步骤 |
|---|---|---|
| `Edge 音色列表获取失败：HTTP 401` | 端点缺 `trustedclienttoken` 查询参数 | 确认 URL 带 `?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4` |
| `Edge 音色列表获取失败：返回体不是 JSON 数组` | 请求头缺 `Accept: application/json` | 该端点默认返回 JS 脚本，必须显式要 JSON |
| `Edge 语音合成失败：…（HTTP 401）` | `Sec-MS-GEC` 算错或缺请求头 | 检查 UA / Origin / Sec-MS-GEC / Sec-MS-GEC-Version 四个头是否齐全 |
| `Edge 语音合成失败：…（HTTP 403）` | 本机时钟与服务端偏差过大 | 已用服务端 `Date` 头自动修正并重试（只有偏差 > 5 秒才采纳，避免秒级噪声把 GEC 推到错误的 5 分钟窗口）；仍失败就查系统时间 |
| `Edge 语音合成失败：…（code=1006, reason=无）` | 握手成功后被上游硬断（TLS 被掐） | 已内置 4 次尝试 + 退避；连续出现就等 30 秒以上再跑 |
| `Edge 语音合成失败：…WebSocket 提前关闭（code=1007, reason=SSML is invalid）` | 文本里含未转义的 `&` `<` `>` | 文本必须走 `escapeXml()`；`<break>` 标签上游也不接受 |
| `Edge 语音合成失败：…WebSocket 连接失败：…` | 短时间内连续请求过多被临时拒绝 | 已内置退避重试；仍失败就隔几十秒再跑 |
| `Edge 语音合成失败：第 N 段返回空音频` | 上游对该段返回了空负载 | 打印该段文本长度，确认不是空字符串或纯控制字符 |
| `Edge 语音合成失败：待合成文本为空` | 上游传入空稿 | 直接判失败，不产出文件 |
| `MP3 解析失败：未找到有效帧头` | 落盘内容不是有效 MP3 | 检查是否被别的进程覆盖；`_check.ts` 会复现 |

通用步骤：

1. 单独跑 `npx tsx src/server/tts/_check.ts` 看哪一段失败。
2. 主路径失败会自动切兜底路径，错误信息里会同时出现两条原因。
3. 想确认是上游挂了还是本地问题，直接在浏览器打开音色列表 URL 看是否返回 JSON 数组。
4. 兜底路径单独验证：`$env:TTS_BACKEND='protocol'; npx tsx src/server/tts/_check.ts`。

## 八、兜底方案：浏览器 speechSynthesis

**这是第二层兜底**，与本文的 Edge 服务端合成互不依赖：Edge 挂了就用浏览器本地朗读，朗读稿 `script` 字段本身是纯文本，永远可用。

触发条件（建议）：`audio` 元素加载失败、`audio_path` 为空、或服务端 `synthesize` 抛错时，
页面自动切到 `window.speechSynthesis`，并提示用户「已切换为浏览器朗读」。

```tsx
// 前端兜底朗读（示意）
function speakWithBrowser(text: string, lang = "zh-CN") {
  if (!("speechSynthesis" in window)) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

// audio 加载失败时降级
<audio
  src={article.audioPath}
  controls
  onError={() => {
    setFallback(true);
    speakWithBrowser(article.script);
  }}
/>
```

| 维度 | Edge 服务端合成 | 浏览器 speechSynthesis |
|---|---|---|
| 音质 | 神经语音，自然 | 系统 TTS 引擎，机械感明显 |
| 离线 | 不可用 | **可用** |
| 音色 | 可选 8 个 zh-CN 音色 | 取决于系统安装的语音包 |
| 速度 | 合成耗时随文本长度增长（800 字约 10 秒） | 零延迟，即点即读 |
| 依赖 | 需要联网 | 无 |
| 长文 | 稳定，可暂停/续播/变速 | 长文本在部分浏览器会被截断 |

结论：**主用 Edge，兜底用浏览器**。两者并存，网页层只需在 `audio` 报错时切一次。

## 九、踩坑记录（全部为本机实测）

1. **音色列表必须带 `trustedclienttoken`**。不带就 `HTTP 401`；带了但请求头没有 `Accept: application/json`，
   端点会返回一段 JS 而不是 JSON 数组。任务书里给的裸 URL 因此不能直接用。
2. **SSML 的 `<break time="1000ms"/>` 被上游拒绝**，WebSocket 直接以 `code=1007 reason=SSML is invalid` 关闭。
   段间静音只能靠自己拼静音帧（帧头 `FF F3 64 C4` + 侧信息 9 字节 + 主数据 131 字节，全 0 解码即为静音）。
3. **原生 WebSocket 必须带 `User-Agent` 和 `Origin` 两个头**，缺任何一个握手直接失败（浏览器 API 不允许自定义头，
   但 Node 24 的全局 WebSocket 走 undici，可以用 `{ headers }` 第二参数传）。
4. **二进制消息格式**是 `[2 字节大端长度][ASCII 头][负载]`，头以 `Path:audio\r\n` 结尾；
   不能像文本帧那样直接按 `\r\n\r\n` 切。
5. **`Sec-MS-GEC` 是 v2 算法**：`SHA-256(版权行 + Windows 刻度 + 客户端令牌)`，再取摘要前 8 字节派生 64 位校验和，
   最终值是 `校验和大写十六进制 + "-" + 摘要大写十六进制`。版本号必须配套 `2-143.0.3650.96`。
   刻度值有 100ns 精度要求，必须用 BigInt 算，否则 1.3e16 超出双精度安全整数会掉精度。
6. **Edge 免费端点会截断长文本**，所以必须切成 ≤ 2000 字符分段合成再拼。
7. **朗读稿来自大模型，必须 XML 转义**。稿子里出现 `&`、`<`、`>` 会让整个 SSML 被拒（同样 1007）。
8. **`msedge-tts` 的类型声明把 `pitch`/`rate`/`volume` 写成可选字段**，但运行时类里有默认值；
   直接读 `prosody.pitch` 会拿到 `string | undefined`，拼进 SSML 会变成字面量 `undefined`。本项目改用显式常量兜底。
9. **MP3 拼接的 reservoir 边界**：各段独立合成，段首帧可能从上一段残留的比特池借数据，
   听感上最多是段首几毫秒的极轻微杂音，不影响播放。段间静音帧用的是 `main_data_begin = 0` 的帧，不消耗比特池。
10. **`msedge-tts` 的 `toFile` 会把文件写死成 `audio.mp3`**，多段合成要用 `toStream` 收集流，不能用 `toFile`。
11. **握手成功 ≠ 连接可用**。上游有时在 WebSocket 握手已经返回 101 之后，直接把 TLS 连接掐掉，
    表现为 `onopen` 触发、紧接着 `error`（undici 抛 `TypeError`，message 为空）并以 `code=1006` 关闭。
    所以判定成功必须以收到 `Path:turn.end` 为准，不能以 `onopen` 为准；
    错误处理上要等 `close` 事件补上 `code`/`reason`，否则诊断信息是空的。
12. **硬关闭会招致短时封禁**。对照实验：先做 3 次 msedge-tts 合成并**优雅关闭**，紧接着的原生协议连接正常；
    换成 `terminate()` 硬杀 socket，紧接着的原生协议连接 9 ms 内就被拒。
    所以本项目只走优雅关闭（`MsEdgeTTS.close()`），并且把「协议兜底」测试放在自检脚本最前面，
    避免和 msedge-tts 的连接收尾抢时间窗。
13. **重试要拉得开**。上游这类硬断是秒级窗口，前一次连接被拒后立刻重试大概率继续被拒；
    现在的退避表是 1.2 s / 3 s / 6 s，最多 4 次尝试。

## 十、验收记录（2026-11-16 实测）

| 验收项 | 结果 |
|---|---|
| `npx tsx src/server/tts/_check.ts` | 四段全部通过，0 项失败，退出码 0 |
| ① 原生 WebSocket 协议兜底 | 21456 字节 / 149 帧 / 3.58 秒，有效 MP3 |
| ② zh-CN 音色数量 ≥ 3 | **8 个** |
| ③ ≥800 字中文稿实测 | 808 字稿 → `data/audio/_tts_probe.mp3`，**1015200 字节**（991.4 KiB） |
| ③ MP3 有效性 | 帧头 `fff364c40000000348000000004c414d` = MPEG-2 Layer III / 24000 Hz / 48 kbps / 单声道 |
| ③ 时长 | 7050 帧 × 24 ms = **169.20 秒**（文本估算 167.61 秒，误差 0.9%） |
| ③ 帧连续性 | 帧覆盖 1015200 / 文件 1015200 字节，无空洞 |
| ④ 长文本不丢内容 | 4200 字长文 4974192 字节 ÷ 2000 字单段 2364624 字节 = **2.10 倍**（要求 > 1.5） |
| ④ 分段 | 4200 字切成 3 段，最长段 1980 字符（上限 2000） |
| ④ 段间静音 | 长文中检出 84 个静音帧 ≈ 2.02 秒（2 个间隙各约 1 秒） |

`data/audio/_tts_probe.mp3` 是自检产物，可随时删除；`docs/PLAN.md` 第九章「音频可播放，时长与文稿匹配」由本条管线承接。
