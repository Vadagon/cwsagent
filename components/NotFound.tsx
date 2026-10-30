// Full-page dialog shown when a store page can't find the extension the popup
// asked for: make a new listing there, pick the item by hand, or stop.
import { useEffect, useRef } from 'react';

export function NotFound({ name, store, onCreate, onPick, onCancel }: {
  name: string; store: string; onCreate: () => void; onPick: () => void; onCancel: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  }, [onCancel]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="cwsagent-nf-title">
      <div className="dialog">
        <h2 id="cwsagent-nf-title">{name} isn’t on {store}</h2>
        <p>Create a new listing and link it, or open the item yourself and link it from the panel.</p>
        <div className="dialog-buttons">
          <button ref={first} className="btn" onClick={onCreate}><span>Create new listing</span></button>
          <button className="btn ghost" onClick={onPick}><span>Choose it myself</span></button>
          <button className="btn ghost" onClick={onCancel}><span>Cancel</span></button>
        </div>
      </div>
    </div>
  );
}
