"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * "Thinking Five" loader — a custom rose trail using r = cos(5θ/3).
 * The fivefold cosine term with fractional denominator creates five outer
 * petals connected by inner loops through the center. Drawn progressively
 * with a bright head and fading trail.
 */
export function RoseLoader({
  size = 20,
  color = "#ffffff",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 1.5;

    // r = cos(5θ/3) needs θ ∈ [0, 3π] to close
    const totalAngle = 3 * Math.PI;
    const totalSteps = 400;
    const trailLength = 120; // visible trail length in steps
    const speed = 3; // steps per frame
    let head = 0;
    let frameId: number;

    // Pre-compute all points
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const theta = (i / totalSteps) * totalAngle;
      const r = maxR * Math.cos((5 * theta) / 3);
      points.push({
        x: cx + r * Math.cos(theta),
        y: cy + r * Math.sin(theta),
      });
    }

    function draw() {
      ctx!.clearRect(0, 0, size, size);

      const trailStart = Math.max(0, head - trailLength);
      const trailEnd = Math.min(head, totalSteps);

      // Draw trail segments with fading opacity
      for (let i = trailStart; i < trailEnd; i++) {
        const age = (head - i) / trailLength; // 0 = head, 1 = tail
        const alpha = Math.pow(1 - age, 2); // quadratic fade
        const p0 = points[i];
        const p1 = points[i + 1];

        ctx!.beginPath();
        ctx!.strokeStyle = color;
        ctx!.globalAlpha = alpha;
        ctx!.lineWidth = 1 + (1 - age) * 0.6;
        ctx!.lineCap = "round";
        ctx!.moveTo(p0.x, p0.y);
        ctx!.lineTo(p1.x, p1.y);
        ctx!.stroke();
      }

      ctx!.globalAlpha = 1;

      head += speed;
      // Loop continuously
      if (head > totalSteps + trailLength) head = 0;

      frameId = requestAnimationFrame(draw);
    }

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [size, color]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}
