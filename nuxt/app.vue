<template>
    <div>
        <div v-for="client in data?.clients" :key="client.client_id">
            <ui5-panel :collapsed="false">
                <div slot="header" class="header">
                    <ui5-tag :design="client.status.active ? 'Positive' : 'Critical'">{{ client.status.active ? 'Active' : 'Inactive' }}</ui5-tag>
                    <ui5-title level="H1">{{ client.client_id }}</ui5-title>
                    <span class="subheading">{{ client.payload.network.hostname}}</span>
                </div>
                <ui5-form layout="S1 M1 L1 XL1">
                    <ui5-form-group header-text="System Information">
                        <ui5-form-item>
                            <ui5-label>platform</ui5-label>
                            <span>{{ client.payload.os.platform }}</span>
                        </ui5-form-item>
                        <ui5-form-item>
                            <ui5-label>Kernel</ui5-label>
                            <span>{{ client.payload.os.kernel }}</span>
                        </ui5-form-item>
                    </ui5-form-group>
                    <ui5-form-group header-text="CPU Usage">
                        <ui5-form-item>
                            <ui5-label>Usage</ui5-label>
                            <span>{{ client.payload.cpu.cpu_percent_total }}%</span>
                        </ui5-form-item>
                        <ui5-form-item>
                            <ui5-label>Load Average (1m | 5m | 15m)</ui5-label>
                            <span>{{ client.payload.cpu.loadavg[1]}} | {{ client.payload.cpu.loadavg[5] }} | {{ client.payload.cpu.loadavg[15] }}</span>
                        </ui5-form-item>
                        <ui5-form-item>
                            <ui5-label>Temperature</ui5-label>
                            <span>{{ client.payload.cpu.temp_c }}°C</span>
                        </ui5-form-item>
                        <ui5-form-item>
                            <ui5-label>Frequency</ui5-label>
                            <span>{{ client.payload.cpu.freq_mhz_current }} MHz</span>
                        </ui5-form-item>
                    </ui5-form-group>
                    <ui5-form-group header-text="CPU Cores">
                        <ui5-form-item>
                            <ui5-label>Physical Cores</ui5-label>
                            <span>{{ client.payload.cpu.physical_cores }}</span>
                        </ui5-form-item>
                        <ui5-form-item>
                            <ui5-label>Logical Cores</ui5-label>
                            <span>{{ client.payload.cpu.logical_cores }}</span>
                        </ui5-form-item>
                    </ui5-form-group>
                    <ui5-form-group header-text="CPU Information">
                        <ui5-form-item>
                            <ui5-label>Architecture</ui5-label>
                            <span>{{ client.payload.cpu.arch }}</span>
                        </ui5-form-item>
                    </ui5-form-group>
                    <ui5-form-group header-text="Memory Usage">
                        <ui5-form-item>
                            <ui5-label>Total</ui5-label>
                            <span>{{ (client.payload.ram.total_bytes /1024 / 1024 / 1024).toFixed(2) }} GB</span>
                        </ui5-form-item>
                        <ui5-form-item>
                            <ui5-label>Used</ui5-label>
                            <span>{{ ((client.payload.ram.total_bytes - client.payload.ram.available_bytes) / 1024 / 1024 / 1024).toFixed(2) }} GB</span>
                        </ui5-form-item>
                        <ui5-form-item>
                            <ui5-label>Free</ui5-label>
                            <span>{{ (client.payload.ram.available_bytes / 1024 / 1024 / 1024).toFixed(2) }} GB</span>
                        </ui5-form-item>
                        <ui5-form-item>
                            <ui5-label>Usage</ui5-label>
                            <span>{{ client.payload.ram.used_percent }}%</span>
                        </ui5-form-item>
                    </ui5-form-group>
                    <ui5-form-group header-text="Disk Usage">
                        <ui5-form-item v-for="disk in [...new Map(client.payload.disks.map(disk => [disk.device, disk])).values()]" :key="disk.device">
                            <ui5-label>{{ disk.device }}</ui5-label>
                            <span>{{ disk.used_percent }}% used of {{ (disk.total_bytes / 1024 / 1024 / 1024).toFixed(2) }} GB</span>
                        </ui5-form-item>
                    </ui5-form-group>
                </ui5-form>
                <div>
                    <canvas
                        :ref="(el) => setCanvasRef(client.client_id, el as HTMLCanvasElement | null)"
                        class="ts-canvas"
                    />
                </div>
            </ui5-panel>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import "@ui5/webcomponents/dist/Panel";
import "@ui5/webcomponents/dist/Title";
import "@ui5/webcomponents/dist/Tag";
import "@ui5/webcomponents/dist/Form";
import "@ui5/webcomponents/dist/FormItem";
import "@ui5/webcomponents/dist/FormGroup";
import "@ui5/webcomponents/dist/Label";

import { useGetMonitoringData } from "@/composables/getMonitoringData";

type HistoryItem = {
  timestamp_unix: number;
  cpu_temp_c: number;
  cpu_freq_mhz: number;
  cpu_usage_percent: number;
  ram_usage_percent: number;
};

type ClientHistory = {
  client_id: string;
  count: number;
  items: HistoryItem[];
};

const { data, refresh, getClientHistory } = useGetMonitoringData("192.168.2.241:8000");
refresh();

let intervalHandle: number | undefined;
onMounted(() => {
  intervalHandle = window.setInterval(() => refresh(), 30000);
});
onBeforeUnmount(() => {
  if (intervalHandle) window.clearInterval(intervalHandle);
});

/** ---------- Canvas registry (one canvas per client) ---------- */
const canvasByClient = new Map<string, HTMLCanvasElement>();

function setCanvasRef(clientId: string, el: HTMLCanvasElement | null) {
  if (!el) {
    canvasByClient.delete(clientId);
    return;
  }
  canvasByClient.set(clientId, el);
  // draw once when mounted
  queueDrawClient(clientId);
}

/** ---------- Rendering queue (avoid over-drawing) ---------- */
const pending = new Set<string>();
function queueDrawClient(clientId: string) {
  if (pending.has(clientId)) return;
  pending.add(clientId);
  requestAnimationFrame(() => {
    pending.delete(clientId);
    drawClientChart(clientId);
  });
}

/** Redraw when data changes */
watch(
  () => data.value?.clients,
  async () => {
    await nextTick();
    for (const client of data.value?.clients ?? []) queueDrawClient(client.client_id);
  },
  { deep: true }
);

/** ---------- Chart drawing ---------- */

type SeriesDef = {
  key: "cpu_temp_c" | "cpu_freq_mhz" | "cpu_usage_percent" | "ram_usage_percent";
  label: string;
  unit: string;
};

const SERIES: SeriesDef[] = [
  { key: "cpu_temp_c", label: "CPU Temp", unit: "°C" },
  { key: "cpu_freq_mhz", label: "CPU Freq", unit: "MHz" },
  { key: "cpu_usage_percent", label: "CPU Usage", unit: "%" },
  { key: "ram_usage_percent", label: "RAM Usage", unit: "%" },
];

async function drawClientChart(clientId: string) {
  const canvas = canvasByClient.get(clientId);
  if (!canvas) return;

  const history = await getClientHistory("192.168.2.241:8000", clientId) as ClientHistory | undefined;
  const items = history?.items ?? [];
  if (items.length < 2) {
    clearCanvas(canvas, "No history");
    return;
  }

  // Ensure time is ascending (your sample is newest-first)
  const sorted = [...items].sort((a, b) => a.timestamp_unix - b.timestamp_unix);

  // Build x and series arrays
  const xs = sorted.map((p) => p.timestamp_unix);
  const series = SERIES.map((s) => ({
    def: s,
    ys: sorted.map((p) => Number(p[s.key] ?? 0)),
  }));

  // Per-series min/max → normalize to 0..1 so all fit in one plot
  const stats = series.map((s) => {
    let min = Infinity;
    let max = -Infinity;
    for (const v of s.ys) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (min === max) max = min + 1; // avoid flat division by zero
    return { min, max };
  });

  // Canvas sizing (CSS pixels -> device pixels)
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 220;
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Layout
  const padL = Math.floor(44 * dpr);
  const padR = Math.floor(10 * dpr);
  const padT = Math.floor(10 * dpr);
  const padB = Math.floor(28 * dpr);
  const plotX = padL;
  const plotY = padT;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // X domain
  const xMin = xs[0];
  const xMax = xs[xs.length - 1] || xMin + 1;

  const xToPx = (x: number) =>
    plotX + ((x - xMin) / (xMax - xMin)) * plotW;

  // Normalized y (0..1) → pixel
  const y01ToPx = (y01: number) => plotY + (1 - y01) * plotH;

  // Grid
  drawGrid(ctx, plotX, plotY, plotW, plotH, dpr);

  // Axes
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1 * dpr;
  ctx.strokeStyle = "#8a8a8a";
  ctx.beginPath();
  ctx.moveTo(plotX, plotY);
  ctx.lineTo(plotX, plotY + plotH);
  ctx.lineTo(plotX + plotW, plotY + plotH);
  ctx.stroke();
  ctx.restore();

  // Series colors (don’t depend on CSS vars)
  const colors = ["#0070f2", "#d43f3a", "#2e7d32", "#6a1b9a"];

  // Draw lines (all normalized so they fit)
  series.forEach((s, idx) => {
    const { min, max } = stats[idx];
    ctx.save();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = colors[idx % colors.length];
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const y = s.ys[i];
      const y01 = (y - min) / (max - min);
      const px = xToPx(xs[i]);
      const py = y01ToPx(clamp01(y01));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  });

  // Legend (includes per-series min/max to explain scaling)
  drawLegend(ctx, plotX, plotY, dpr, series, stats, colors);

  // X labels (start/end time)
  drawTimeLabels(ctx, plotX, plotY, plotW, plotH, dpr, xMin, xMax);
}

function clearCanvas(canvas: HTMLCanvasElement, msg: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor((canvas.clientWidth || 600) * dpr));
  const h = Math.max(1, Math.floor((canvas.clientHeight || 220) * dpr));
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.font = `${12 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = "#666";
  ctx.fillText(msg, 12 * dpr, 24 * dpr);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dpr: number
) {
  ctx.save();
  ctx.lineWidth = 1 * dpr;
  ctx.strokeStyle = "#e0e0e0";
  ctx.globalAlpha = 1;

  // 5 horizontal lines
  for (let i = 1; i <= 4; i++) {
    const yy = y + (h * i) / 5;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }

  // 6 vertical lines
  for (let i = 1; i <= 5; i++) {
    const xx = x + (w * i) / 6;
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + h);
    ctx.stroke();
  }

  ctx.restore();
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  plotX: number,
  plotY: number,
  dpr: number,
  series: { def: { label: string; unit: string }; ys: number[] }[],
  stats: { min: number; max: number }[],
  colors: string[]
) {
  ctx.save();
  ctx.font = `${11 * dpr}px system-ui, sans-serif`;
  ctx.textBaseline = "top";

  let lx = plotX + 6 * dpr;
  let ly = plotY + 6 * dpr;

  series.forEach((s, idx) => {
    // color swatch
    ctx.fillStyle = colors[idx % colors.length];
    ctx.fillRect(lx, ly + 3 * dpr, 10 * dpr, 3 * dpr);

    // label
    ctx.fillStyle = "#333";
    const { min, max } = stats[idx];
    const text = `${s.def.label} (${min.toFixed(1)}–${max.toFixed(1)} ${s.def.unit})`;
    ctx.fillText(text, lx + 14 * dpr, ly);

    ly += 16 * dpr;
  });

  ctx.restore();
}

function drawTimeLabels(
  ctx: CanvasRenderingContext2D,
  plotX: number,
  plotY: number,
  plotW: number,
  plotH: number,
  dpr: number,
  xMin: number,
  xMax: number
) {
  const fmt = (unix: number) => {
    const d = new Date(unix * 1000);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  ctx.save();
  ctx.font = `${11 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = "#555";
  ctx.textBaseline = "top";

  const y = plotY + plotH + 6 * dpr;
  ctx.fillText(fmt(xMin), plotX, y);

  const end = fmt(xMax);
  const metrics = ctx.measureText(end);
  ctx.fillText(end, plotX + plotW - metrics.width, y);

  ctx.restore();
}

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
</script>

<style>
.header {
    display: flex;
    flex-direction: row;
    justify-content: last baseline;
    align-items: baseline;
    gap: 0.5rem;
}

.header ui5-tag {
    width: 4.75rem;
}

.header .subheading {
    font-size: 10pt;
    color: gray;
}

.ts-canvas {
  width: 100%;
  height: 220px;
  display: block;
}
</style>