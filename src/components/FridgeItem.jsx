import { formatDate } from '../lib/format.js'
import { freshness, freshnessText } from '../lib/freshness.js'

// One row of the fridge list. Tapping it opens the actions below.
export default function FridgeItem({ item, today, open, onToggle, onFinish, onExpiry }) {
  const f = freshness(item, today)
  const { since, warning } = freshnessText(f)
  const panelId = `fridge-item-${item.product_id}`

  return (
    <li className="fridge-item">
      <button className="fridge-row" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="fridge-name">{item.product.name}</span>
        <span className="muted">{since}</span>
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
        </div>
      )}
    </li>
  )
}
