import { useEffect, useRef, useState } from 'react'

// "¿Se acabó algo?": after cooking, offers to mark fridge products as finished.
// Nothing is checked by default. `items` are fridge items; `onDone(chosen)`
// gets the ones the user ticked (none for "Nada se acabó").
export default function FinishedSheet({ items, busy, onDone }) {
  const [checked, setChecked] = useState(() => new Set())
  const sheet = useRef(null)

  // Move focus into the sheet, so keyboard and VoiceOver start here.
  useEffect(() => {
    sheet.current?.focus()
  }, [])

  function toggle(id) {
    setChecked((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onKeyDown(e) {
    // Closing without choosing is the same as "Nada se acabó".
    if (e.key === 'Escape' && !busy) onDone([])
  }

  return (
    <div className="sheet-backdrop">
      <div
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id="sheet-title">¿Se acabó algo?</h2>
        <ul className="sheet-list">
          {items.map((item) => (
            <li key={item.product_id}>
              <label className="sheet-check">
                <input
                  type="checkbox"
                  checked={checked.has(item.product_id)}
                  onChange={() => toggle(item.product_id)}
                />
                {item.product.name}
              </label>
            </li>
          ))}
        </ul>
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => onDone(items.filter((i) => checked.has(i.product_id)))}
        >
          Listo
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => onDone([])}>
          Nada se acabó
        </button>
      </div>
    </div>
  )
}
