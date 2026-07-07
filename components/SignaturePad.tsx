"use client";

import { useEffect, useRef, useState } from "react";

/** Pad de signature manuscrite (souris + tactile), export PNG en data URL. */
export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [vide, setVide] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) {
      setVide(false);
      onChange(canvasRef.current!.toDataURL("image/png"));
    }
  }

  function effacer() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setVide(true);
    onChange(null);
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-40 w-full touch-none rounded-xl border-2 border-black bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {vide && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-black/40">
            Signez ici (souris ou doigt)
          </span>
        )}
      </div>
      <button type="button" className="btn-outline btn-sm mt-2" onClick={effacer}>
        Effacer la signature
      </button>
    </div>
  );
}
