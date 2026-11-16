/**
 * 容器内每日定时器：北京时间每天 07:05 生成当日全部内容 + 公众号稿。
 * 不依赖 cron / systemd，Windows 与 Linux 都能跑（Node 内置定时器）。
 */
const TZ = "Asia/Shanghai";
const RUN_AT = process.env.RUN_AT ?? "07:05";

function shanghaiNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function todayStr() {
  const n = shanghaiNow();
  return `${n.year}-${String(n.month).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`;
}

const [hh, mm] = RUN_AT.split(":").map((v) => Number(v));
let lastRun = "";

async function tick() {
  const n = shanghaiNow();
  const date = todayStr();
  if (n.hour === hh && n.minute === mm && date !== lastRun) {
    lastRun = date;
    console.log(`[cron] ${date} ${RUN_AT} 开始生成…`);
    const { spawn } = await import("node:child_process");
    const child = spawn("node", ["src/server/cli/generate-daily.ts"], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => console.log(`[cron] 生成结束，退出码 ${code}`));
  }
}

console.log(`[cron] 定时器已启动：每天 ${RUN_AT}（${TZ}）`);
setInterval(() => void tick(), 30_000);
void tick();