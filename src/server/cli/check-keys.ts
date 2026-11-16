import { secretFingerprint, secretStatus } from '../secrets.js';
import { providerStatus } from '../llm/providers.js';

const names = ["DEEPSEEK_API_KEY", "MINIMAX_CN_API_KEY", "XIAOMI_TOKEN_PLAN_CN_API_KEY"];
console.log("密钥装载状态（只打印长度与前两位，不打印原文）：");
for (const n of names) console.log("  " + secretFingerprint(n));
console.log("hasKey 布尔：", JSON.stringify(secretStatus(names)));
console.log("端点可用性：");
for (const p of providerStatus()) console.log(`  ${p.id.padEnd(22)} ${p.hasKey ? "有key" : "无key"}  ${p.model}`);
