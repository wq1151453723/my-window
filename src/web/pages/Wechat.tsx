import { useEffect, useState } from 'react';
import { api, type WechatPreview } from '../lib/api';
import { PageHeader } from '../components/PageHeader';

export function Wechat() {
  const [preview, setPreview] = useState<WechatPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setElapsed(0);
    const t0 = Date.now();
    const watchdog = window.setTimeout(() => {
      setErr("打包超时（12 秒）没拿到内容，请确认后端服务在运行");
      setLoading(false);
    }, 12000);
    api.wechatPreview()
      .then((p) => {
        setPreview(p);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        window.clearTimeout(watchdog);
        setElapsed(Date.now() - t0);
        setLoading(false);
      });
  };

  useEffect(() => {
    let alive = true;
    const t0 = Date.now();
    setLoading(true);
    setElapsed(0);
    api.wechatPreview()
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        setErr(null);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!alive) return;
        setElapsed(Date.now() - t0);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** 粘到公众号后台前，把本地图片地址换成可见占位，避免粘过去是裂图 */
  const copyPublishHtml = async () => {
    if (!preview) return;
    const labelOf = (src: string) =>
      preview.images.find((i) => i.url === src)?.label ?? "配图";
    const html = preview.contentHtml.replace(
      /<img src="([^"]+)" data-wx-img="1"[^>]*\/>/g,
      (_m, src: string) =>
        `<p style="margin:0.6em 0 1.3em;text-align:center;color:#b0341f;font-size:14px;">【在此插入图片：${labelOf(src)}】</p>`
    );
    try {
      await navigator.clipboard.writeText(html);
      setMsg("已复制带占位的正文：粘进公众号后，按【在此插入图片：…】的位置逐张插入即可。");
      setErr(null);
    } catch {
      setErr("浏览器拒绝了剪贴板访问，请改用「下载 HTML」。");
    }
  };

  const copyHtml = async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.contentHtml);
      setMsg("已复制排版好的 HTML：打开公众号后台新建图文，粘贴到正文即可。");
      setErr(null);
    } catch {
      setErr("浏览器拒绝了剪贴板访问，请改用「下载 HTML」。");
    }
  };

  const downloadHtml = () => {
    if (!preview) return;
    const blob = new Blob([preview.contentHtml], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `我的窗口-${preview.date}-公众号稿.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("已下载 HTML，可直接用浏览器打开预览或粘贴进公众号后台。");
  };

  const buildAudio = async () => {
    setBusy("audio");
    setMsg(null);
    try {
      const r = await api.wechatAudio();
      setPreview((p) => (p ? { ...p, audioPath: r.audioPath, audioSeconds: r.seconds } : p));
      setMsg(`摘要朗读已生成：约 ${r.seconds} 秒（微信单条语音上限 2 分钟）。`);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const insertHint = (kind: string) =>
    kind === "cover"
      ? "公众号封面图（后台设置封面时上传）"
      : kind === "poster"
        ? "正文第一张（标题上方）"
        : "正文第二张（标题下方）";

  const copyImage = async (url: string, label: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setMsg(`已复制「${label}」，到公众号正文里直接粘贴即可。`);
      setErr(null);
    } catch {
      setErr("浏览器拒绝了剪贴板访问，请改用「下载」后手动上传。");
    }
  };

  const downloadImage = (url: string, kind: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `我的窗口-${preview?.date ?? ""}-${kind}.png`;
    a.click();
  };

  const publish = async () => {
    setBusy("publish");
    setMsg(null);
    try {
      const r = await api.wechatPublish();
      if (r.ok) setMsg(`已写入草稿箱（media_id: ${r.mediaId}），登录公众号后台即可看到并发布。`);
      else setErr(r.error ?? "写入草稿箱失败");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-[13px] text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-45";

  return (
    <div>
      <PageHeader
        kicker="公众号日报"
        title="把今天这一讲，打包成一条能发出去的图文"
        desc="公众号只发 AI 学习：每天一讲，一讲一张图、一段朗读。正文按公众号排版规则生成（全部内联样式），个人订阅号可复制粘贴发布，认证号可直接写进草稿箱。"
      />

      {loading && (
        <div className="py-16 text-center">
          <p className="text-[14px] text-muted">正在打包今天这一讲…</p>
          <p className="mt-1 text-[12px] text-muted">
            {elapsed !== null ? `请求用时 ${elapsed}ms` : "正在取今天的各板块内容"}
          </p>
        </div>
      )}

      {!loading && preview && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="kicker">正文预览</span>
              <span className="text-[12px] text-muted">
                第 {preview.images.length} 张图 · 白底模拟公众号排版
                {elapsed !== null ? ` · 打包 ${elapsed}ms` : ""}
              </span>
            </div>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
              <div
                className="max-h-[760px] overflow-y-auto px-6 py-6"
                dangerouslySetInnerHTML={{ __html: preview.contentHtml }}
              />
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <div className="kicker">标题</div>
              <div className="mt-2 text-[14px] font-medium leading-relaxed">{preview.title}</div>
              <div className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
                {preview.digest}
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <div className="kicker">朗读音频</div>
              {preview.audioPath ? (
                <div className="mt-3">
                  <audio controls preload="metadata" src={preview.audioPath} className="w-full" />
                  {preview.audioSeconds ? (
                    <div className="mt-2 text-[12px] text-muted">约 {preview.audioSeconds} 秒</div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  还没生成。摘要朗读稿会自动取每段的第一条要点，控制在 90 秒左右。
                </p>
              )}
              <button onClick={buildAudio} disabled={busy === "audio"} className={`${btn} mt-4`}>
                {busy === "audio" ? "生成中…" : preview.audioPath ? "重新生成音频" : "生成摘要朗读"}
              </button>
            </div>

            {preview.images.length > 0 && (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <div className="flex items-baseline justify-between">
                  <span className="kicker">配图</span>
                  <span className="text-[12px] text-muted">{preview.images.length} 张 · 点「复制图片」再粘进公众号</span>
                </div>
                <div className="mt-3 space-y-3">
                  {preview.images.map((img) => (
                    <div key={img.kind} className="flex gap-3">
                      <img src={img.url} alt={img.label} className="h-20 w-16 shrink-0 rounded border border-line object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px]">{img.label}</div>
                        <div className="mt-0.5 text-[12px] text-muted">
                          {img.width}×{img.height} · {Math.round(img.bytes / 1024)} KB · {insertHint(img.kind)}
                        </div>
                        <div className="mt-1.5 flex gap-2">
                          <button
                            onClick={() => void copyImage(img.url, img.label)}
                            className="rounded-full border border-line-strong px-2.5 py-1 text-[12px] text-ink-soft hover:border-accent hover:text-accent"
                          >
                            复制图片
                          </button>
                          <button
                            onClick={() => downloadImage(img.url, img.kind)}
                            className="rounded-full border border-line-strong px-2.5 py-1 text-[12px] text-ink-soft hover:border-accent hover:text-accent"
                          >
                            下载
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <div className="kicker">发布</div>
              <div className="mt-3 flex flex-wrap gap-2.5">
                <button onClick={copyPublishHtml} className={`${btn} border-accent text-accent`}>
                  复制图文（带插图占位）
                </button>
                <button onClick={copyHtml} className={btn}>复制原样 HTML</button>
                <button onClick={downloadHtml} className={btn}>下载 HTML</button>
                <button
                  onClick={publish}
                  disabled={busy === "publish" || !preview.status.configured}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-45"
                >
                  {busy === "publish" ? "写入中…" : "写入草稿箱"}
                </button>
              </div>
              {!preview.status.configured && (
                <p className="mt-3 border-l-[3px] border-gold bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-muted">
                  {preview.status.reason}
                </p>
              )}
              {preview.status.configured && (
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
                  已配置凭证（{preview.status.appId}），点「写入草稿箱」即可自动生成草稿。
                </p>
              )}
            </div>

            {msg && <div className="rounded-[var(--radius-card)] border border-jade/40 bg-jade-soft px-4 py-3 text-[13px] leading-relaxed text-jade">{msg}</div>}
            {err && <div className="rounded-[var(--radius-card)] border border-accent/40 bg-accent-soft px-4 py-3 text-[13px] leading-relaxed text-accent-ink">{err}</div>}

            <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-5 py-4 text-[13px] leading-relaxed text-muted">
              <div className="kicker mb-2">每天怎么发（约一分钟）</div>
              <ol className="space-y-1.5">
                <li>1. 点「复制图文（带插图占位）」→ 公众号后台新建图文 → 粘到正文。</li>
                <li>2. 按占位顺序插图：先点「复制图片」再 Ctrl+V 粘到对应位置（海报在标题上方，AI 学习配图在标题下方）；封面用封面图。</li>
                <li>3. 音频：下载 MP3 → 后台「素材管理 → 语音」上传 → 正文里插入音频（或先只发图文）。</li>
                <li>4. 预览 → 填封面 → 发表。每天固定时间发，订阅者才会养成习惯。</li>
              </ol>
            </div>

            <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-5 py-4 text-[13px] leading-relaxed text-muted">
              <div className="kicker mb-2">发布须知</div>
              <ul className="space-y-1.5">
                <li>· 订阅号每天可群发 1 条，这条日报正好占满当天配额。</li>
                <li>· 个人主体订阅号拿不到微信认证，只能复制粘贴发布。</li>
                <li>· 正文不放外链与图片（微信会过滤外链图），需要细节回网页版看。</li>
                <li>· 语音单条约 2 分钟上限，本稿的摘要朗读已控制在 90 秒内。</li>
                <li>· 涉及市场内容已注明「不构成投资建议」，建议保留。</li>
              </ul>
            </div>
          </aside>
        </div>
      )}

      {!loading && err && !preview && (
        <div className="rounded-[var(--radius-card)] border border-accent/40 bg-accent-soft px-5 py-4 text-[13px] text-accent-ink">
          打包失败：{err}
        </div>
      )}
    </div>
  );
}