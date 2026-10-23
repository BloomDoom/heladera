import { formatDate } from '../lib/format.js'
import { PLACES } from '../lib/products.js'
import { freshness, freshnessText } from '../lib/freshness.js'

export const MOVE_LABELS = {
  fridge: { button: 'Pasar a la heladera', toast: 'a la heladera' },
  freezer: { button: 'Pasar al freezer', toast: 'al freezer' },
  pantry: { button: 'Pasar a la alacena', toast: 'a la alacena' },
}

// One row of the fridge list. Tapping it opens the actions below.
export default function FridgeItem({ item, today, open, onToggle, onFinish, onExpiry, onMove }) {
  const f = freshness(item, today)
  const { since, warning } = freshnessText(f, item.place)
  const panelId = `fridge-item-${item.product_id}`

  return (
    <li className="fridge-item">
      <button className="fridge-row" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="fridge-name">{item.product.name}</span>
        {since && <span className="muted">{since}</span>}
        {warning && <span className={`chip chip-${f.status}`}>{warning}</span>}
      </button>
      {open && (
        <div className="fridge-actions" id={panelId}>
          <label>
            Vence el
            <input
              type="date"
              value={f.expiresOn ?? ''}
              onChange={(e) => onExpiry(e.target.value || null)}
            />
          </label>
          {f.manual ? (
            <button className="link-button" onClick={() => onExpiry(null)}>
              Usar la estimada
            </button>
          ) : (
            f.expiresOn && <p className="muted">Estimada: {formatDate(f.expiresOn)}</p>
          )}
          <button className="btn-secondary" onClick={onFinish}>Se acabó</button>
          {PLACES.filter((p) => p.key !== item.place).map((p) => (
            <button key={p.key} className="btn-secondary" onClick={() => onMove(p.key)}>
              {MOVE_LABELS[p.key].button}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
