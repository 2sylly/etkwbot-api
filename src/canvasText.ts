import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";

const registeredFonts = new Set<string>();
const scratchCanvas = createCanvas(1, 1);
const scratchContext = scratchCanvas.getContext("2d");

type CanvasTextLayout = {
  lines: string[];
  lineHeight: number;
  lineMetrics: Array<{
    ascent: number;
    descent: number;
    width: number;
  }>;
  width: number;
  height: number;
};

type RenderCanvasTextArgs = {
  text: string;
  fontPath: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  opacity?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function ensureCanvasFontRegistered(fontPath: string, fontFamily: string): void {
  const cacheKey = `${fontFamily}:${fontPath}`;

  if (registeredFonts.has(cacheKey)) {
    return;
  }

  GlobalFonts.registerFromPath(fontPath, fontFamily);
  registeredFonts.add(cacheKey);
}

function setCanvasFont(
  ctx: SKRSContext2D,
  fontFamily: string,
  fontSize: number,
): void {
  ctx.font = `${fontSize}px "${fontFamily}", "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function buildCanvasTextLayout(
  text: string,
  fontFamily: string,
  fontSize: number,
): CanvasTextLayout {
  const lines = text.split("\n");
  setCanvasFont(scratchContext, fontFamily, fontSize);

  const lineMetrics = lines.map((line) => {
    const metrics = scratchContext.measureText(line || " ");
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize * 0.8);
    const descent = Math.ceil(metrics.actualBoundingBoxDescent || fontSize * 0.2);

    return {
      ascent,
      descent,
      width: Math.max(0, Math.ceil(metrics.width)),
    };
  });

  const lineHeight = Math.max(
    Math.ceil(fontSize * 1.15),
    ...lineMetrics.map((metrics) => metrics.ascent + metrics.descent),
  );

  return {
    lines,
    lineMetrics,
    lineHeight,
    width: Math.max(1, ...lineMetrics.map((metrics) => metrics.width)),
    height: Math.max(1, lineHeight * Math.max(1, lines.length)),
  };
}

export function measureCanvasTextWidth(
  text: string,
  fontPath: string,
  fontFamily: string,
  fontSize: number,
): number {
  ensureCanvasFontRegistered(fontPath, fontFamily);
  return buildCanvasTextLayout(text, fontFamily, fontSize).width;
}

export async function renderCanvasText(args: RenderCanvasTextArgs): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}> {
  ensureCanvasFontRegistered(args.fontPath, args.fontFamily);
  const layout = buildCanvasTextLayout(args.text, args.fontFamily, args.fontSize);
  const padding = Math.max(2, Math.ceil(args.fontSize * 0.12));
  const canvas = createCanvas(
    Math.max(1, layout.width + padding * 2),
    Math.max(1, layout.height + padding * 2),
  );
  const ctx = canvas.getContext("2d");

  setCanvasFont(ctx, args.fontFamily, args.fontSize);
  ctx.fillStyle = args.fill;
  ctx.globalAlpha = clamp(args.opacity ?? 1, 0, 1);

  for (const [index, line] of layout.lines.entries()) {
    const metrics = layout.lineMetrics[index];
    const y = padding + index * layout.lineHeight + metrics.ascent;
    ctx.fillText(line, padding, y);
  }

  return {
    buffer: Buffer.from(await canvas.encode("png")),
    width: layout.width,
    height: layout.height,
    offsetX: padding,
    offsetY: padding,
  };
}
