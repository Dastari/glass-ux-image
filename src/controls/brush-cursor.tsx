import type { Ref } from 'react';
/** A picture-space cursor projected into screen pixels; has no session dependency. */
export interface BrushCursorProps {
  /** Screen x coordinate. */ x?: number;
  /** Screen y coordinate. */ y?: number;
  /** Horizontal radius in screen pixels. */ radiusX?: number;
  /** Vertical radius in screen pixels. */ radiusY?: number;
  /** Rotation in degrees. */ angle?: number;
  /** Inner fully covered fraction, 0–1. */ hardness?: number;
  /** Hide the rings until the cursor enters the picture. */ hidden?: boolean;
  /** SVG reference for hosts updating cursor positions without rendering per pointer frame. */ ref?: Ref<SVGSVGElement>;
  /** Layout class. */ className?: string;
}
/** Two outlined rings show size and hardness; image coordinates remain left-to-right. */
export function BrushCursor({ x = 0, y = 0, radiusX = 16, radiusY = radiusX, angle = 0, hardness = .75, hidden = false, ref, className }: BrushCursorProps) {
  return <svg ref={ref} className={['gi-brush-cursor', className].filter(Boolean).join(' ')} aria-hidden="true">
    <g data-brush-ring="" visibility={hidden ? 'hidden' : 'visible'} transform={`translate(${x} ${y}) rotate(${angle})`}>
      <ellipse className="gi-cursor-shadow" data-outer-shadow="" rx={radiusX} ry={radiusY} />
      <ellipse className="gi-cursor-shadow" data-inner-shadow="" rx={radiusX * hardness} ry={radiusY * hardness} />
      <ellipse data-outer="" rx={radiusX} ry={radiusY} />
      <ellipse data-inner="" rx={radiusX * hardness} ry={radiusY * hardness} />
    </g>
    <g data-source-marker="" visibility="hidden"><path d="M-7 0H7M0-7V7" /><circle r="5" /></g>
    <polygon data-patch-outline="" points="" />
  </svg>;
}
