import { useEffect, useRef } from 'react';
import { createChart, AreaSeries, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts';

export function TrendChart({
  data,
  height = 200,
  color = "#b0341f",
}: {
  data: Array<{ time: number; value: number }>;
  height?: number;
  color?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6a6153",
        fontFamily: "Inter, PingFang SC, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(23,19,14,0.05)" },
        horzLines: { color: "rgba(23,19,14,0.05)" },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: false },
      crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      handleScale: { axisPressedMouseMove: false },
    });
    chartRef.current = chart;
    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: color + "33",
      bottomColor: color + "05",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    seriesRef.current = series;
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, color]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setData(
      data.map((d) => ({ time: (d.time / 1000) as never, value: d.value })) as never
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={boxRef} className="w-full" style={{ height }} />;
}