'use client';

// a side "shelf" of actions. an item with options slides out a touch (like easing a book off the
// shelf) and fans its choices on a circle centered on the button: +45deg up, straight out, -45deg
// down. plain items (no options) just fire. real buttons in dom order, so keyboard + screen readers
// reach the choices; click toggles, hover opens on desktop, escape / outside-click closes.
import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface RadialOption {
  label: string;
  tone?: 'success' | 'danger' | 'warning';
  onSelect: () => void;
  disabled?: boolean;
}

export interface RadialItem {
  id: string;
  label: string;
  dataGuide?: string;
  onSelect?: () => void;
  options?: RadialOption[];
}

// shelf sits at the far left; the arc fans out to the RIGHT, into the gutter beside it:
// compliant up-right, noncompliant straight, unclear down-right. it stays open until you pick
// one or click away (no close-on-leave, or the choices would vanish before you reach them).
const ANGLES = [45, 0, -45];
const RADIUS = 130;

export default function RadialMenu({ items }: { items: RadialItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="radial" ref={ref}>
      {items.map((item) => {
        const isOpen = open === item.id;
        return (
          <div key={item.id} className={`radial-item${isOpen ? ' open' : ''}`}>
            <button
              type="button"
              className="radial-btn"
              data-guide={item.dataGuide}
              aria-haspopup={item.options ? 'menu' : undefined}
              aria-expanded={item.options ? isOpen : undefined}
              onMouseEnter={() => item.options && setOpen(item.id)}
              onClick={() => {
                if (item.options) setOpen(isOpen ? null : item.id);
                else item.onSelect?.();
              }}
            >
              {item.label}
              {item.options && <span aria-hidden="true"> ›</span>}
            </button>

            {item.options && isOpen && (
              <div className="radial-arc" role="menu" aria-label={item.label}>
                {item.options.map((opt, i) => {
                  const a = ((ANGLES[i] ?? 0) * Math.PI) / 180;
                  const x = Math.round(Math.cos(a) * RADIUS);
                  const y = Math.round(-Math.sin(a) * RADIUS);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      role="menuitem"
                      disabled={opt.disabled}
                      className={`radial-opt${opt.tone ? ' tone-' + opt.tone : ''}`}
                      style={{ '--tx': `${x}px`, '--ty': `${y}px`, animationDelay: `${i * 50}ms` } as CSSProperties}
                      onClick={() => {
                        opt.onSelect();
                        setOpen(null);
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
