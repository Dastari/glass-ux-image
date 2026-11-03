import { Children, type ReactNode } from 'react';
import { Fieldset } from 'glass-ux/field';

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

/** Related controls in a tool panel, under one overline label when given (R15.8). */
export function PanelGroup({ label, children, className }: {
  /** Overline label; omit for a plain group that only spaces its rows. */
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return label
    ? <Fieldset className={cx('gi-panel-group', className)} legend={label} variant="section">{children}</Fieldset>
    : <div className={cx('gi-panel-group', className)}>{children}</div>;
}

/** Two fields side by side, such as width and height, with an optional control between them. */
export function PanelPair({ children, link }: {
  /** Two fields. */
  children: ReactNode;
  /** A link or lock toggle drawn between the fields. */
  link?: ReactNode;
}) {
  const [first, ...rest] = Children.toArray(children);
  return <div className="gi-panel-pair" data-linked={link ? '' : undefined}>{first}{link && <div className="gi-panel-pair-link">{link}</div>}{rest}</div>;
}

/** A panel's closing actions: secondary first, the primary action at the reading end (R12.1). */
export function PanelActions({ children, start }: {
  /** Buttons at the reading end, primary last. */
  children: ReactNode;
  /** An optional action at the start, such as a reset. */
  start?: ReactNode;
}) {
  return <div className="gi-panel-actions">{start && <div className="gi-panel-actions-start">{start}</div>}{children}</div>;
}

/** A short explanation under a group; muted caption text. */
export function PanelHint({ children }: { children: ReactNode }) {
  return <p className="gi-panel-hint">{children}</p>;
}
