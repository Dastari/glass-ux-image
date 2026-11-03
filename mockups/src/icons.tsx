/* A starter set of tool icons on the Glass UX 24-unit grid: 1.75 stroke, one duotone pane. */
import type { ReactNode } from "react";
const glyphs: Record<string, ReactNode> = {
  move: <path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />,
  marquee: <><rect className="t" x="4" y="4" width="16" height="16" rx="3" /><rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="3 3.3" /></>,
  lasso: <><path d="M12 4c5 0 9 2.4 9 5.7s-4 5.8-9 5.8-9-2.5-9-5.8S7 4 12 4Z" strokeDasharray="3 3" /><path d="M9.2 15.2c-1.4 1.2-1.2 3.3.3 3.8 1.3.4 2.6-.5 2.4-1.7-.2-1.1-1.7-1.4-2.4-.5-.5.8-.5 2-.2 3.2" /></>,
  wand: <><path d="m4 20 10.5-10.5" /><path className="t" d="m13 8 3 3 1.5-1.5-3-3Z" /><path d="M18 3v3M16.5 4.5h3M20 12v2M19 13h2M10 3v2M9 4h2" /></>,
  crop: <path d="M7 2.5V17h14.5M2.5 7H17v14.5" />,
  brush: <><path d="M20.5 3.5c-3.2 1-8.2 5.2-10.7 8.7l2 2c3.5-2.5 7.7-7.5 8.7-10.7Z" /><path className="t" d="M9 13.5c-2 .2-3 1.5-3.2 3-.1 1-.8 1.9-2.3 2.4 2.7 1 6.7.5 7.5-2.5.3-1-.2-2-2-2.9Z" /><path d="M9 13.5c-2 .2-3 1.5-3.2 3-.1 1-.8 1.9-2.3 2.4 2.7 1 6.7.5 7.5-2.5.3-1-.2-2-2-2.9Z" /></>,
  eraser: <><path className="t" d="m8.3 8.2 7.5 7.5-3.8 3.8H8.5l-4.6-4.6a1.6 1.6 0 0 1 0-2.3Z" /><path d="M8.5 19.5 3.9 14.9a1.6 1.6 0 0 1 0-2.3l8.7-8.7a1.6 1.6 0 0 1 2.3 0l5.2 5.2a1.6 1.6 0 0 1 0 2.3l-8.2 8.1H8.5ZM8.3 8.2l7.5 7.5M8.5 19.5h12" /></>,
  fill: <><path className="t" d="M4 12.5h13.5l-5 5.2a2 2 0 0 1-2.8 0Z" /><path d="m10.5 3.5 9 9-7 7a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8l7-7ZM9 5l-2-2M4 12.5h15.5" /><path d="M20.5 16c.7 1 1.3 2 1.3 2.8a1.3 1.3 0 0 1-2.6 0c0-.8.6-1.8 1.3-2.8Z" /></>,
  gradient: <><path className="t" d="M12 3.5h5.5a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H12Z" /><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M12 3.5v17M7.5 8h.01M7.5 12h.01M7.5 16h.01" /></>,
  clone: <><path d="M9 11.8a3.6 3.6 0 1 1 6 0c-.7 1.1-.6 2 .4 2.9h3.3a1.3 1.3 0 0 1 1.3 1.3V18H4v-2a1.3 1.3 0 0 1 1.3-1.3h3.3c1-.9 1.1-1.8.4-2.9Z" /><path d="M5.5 21h13" /></>,
  heal: <><path className="t" d="m9 9 6 6-3.5 3.5-6-6Z" /><path d="m4.3 12.3 8-8a3.8 3.8 0 0 1 5.4 0l2 2a3.8 3.8 0 0 1 0 5.4l-8 8a3.8 3.8 0 0 1-5.4 0l-2-2a3.8 3.8 0 0 1 0-5.4ZM9 9l6 6M12 11.2h.01M12.8 12h.01" /></>,
  dodge: <><circle className="t" cx="12" cy="8" r="5" /><circle cx="12" cy="8" r="5" /><path d="M12 13v8" /></>,
  smudge: <path d="M3.5 8c3-3.2 5.5 3 8.5 0s5.5 3 8.5 0M3.5 13c3-3.2 5.5 3 8.5 0s5.5 3 8.5 0M6 18c2-1.600 4 1.5 6 0s4 1.5 6 0" />,
  text: <path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6" />,
  shape: <><path className="t" d="M15 3.5a5.5 5.5 0 0 1 0 11h-.5V12a2.5 2.5 0 0 0-2.5-2.5H9.5A5.5 5.5 0 0 1 15 3.5Z" /><rect x="3.5" y="9.5" width="11" height="11" rx="2.5" /><path d="M9.5 9.5A5.5 5.5 0 1 1 14.5 14.5" /></>,
  pen: <><path className="t" d="m12 3 5 9.5-5 7.5-5-7.5Z" /><path d="m12 3 5 9.5-5 7.5-5-7.5ZM12 3v8M9.5 21.5h5" /><circle cx="12" cy="12.5" r="1.3" /></>,
  hand: <path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5-7a1.5 1.5 0 0 1 3 0v7-5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7c-2.5 0-4-1-5.5-3L3 14.5c-.9-1.4 1-2.8 2.2-1.600L8 15.5" />,
  transform: <><rect className="t" x="5" y="5" width="14" height="14" /><path d="M5 7v10M19 7v10M7 5h10M7 19h10" /><rect x="3" y="3" width="4" height="4" rx="1" /><rect x="17" y="3" width="4" height="4" rx="1" /><rect x="3" y="17" width="4" height="4" rx="1" /><rect x="17" y="17" width="4" height="4" rx="1" /></>,
  adjust: <><path className="t" d="M12 3a9 9 0 0 1 0 18Z" /><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /></>,
  curves: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M6.5 17.5c4-.5 3.5-5.5 5.5-6s3.5-3 5.5-5" /></>,
  mask: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path className="t" d="M12 7.5a4.5 4.5 0 0 1 0 9Z" /><circle cx="12" cy="12" r="4.5" /></>,
  group: <><path className="t" d="M3.5 9h17v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /><path d="M3.5 17.5v-11a2 2 0 0 1 2-2h3.7a2 2 0 0 1 1.4.6L12.5 7h6a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.5-5.8L20 8.5" /><path d="M20 4v4.5h-4.5" /></>,
  swap: <path d="M6 16 3.5 13.5M6 16l2.5-2.5M6 16v-4a4 4 0 0 1 4-4h4M18 8l2.5 2.5M18 8l-2.5 2.5M18 8v4a4 4 0 0 1-4 4h-4" />,
  link: <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />,
  arrow: <path d="M4 20 19 5M19 5h-7M19 5v7" />,
  box: <rect x="4" y="5.5" width="16" height="13" rx="2.5" />,
};
export function Ti({ n }: { n: string }) {
  return <svg className="ti" viewBox="0 0 24 24" aria-hidden="true">{glyphs[n]}</svg>;
}
