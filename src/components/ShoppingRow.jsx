// One line of the shopping list: tick (checkbox and name), why it is there,
// and a "Quitar" button. In the cart there is no "Quitar": tap to untick.
export default function ShoppingRow({ entry, onToggle, onRemove }) {
  return (
    <li className={`shop-row${entry.checked ? ' shop-row-done' : ''}`}>
      <label className="shop-tick">
        <input type="checkbox" checked={entry.checked} onChange={() => onToggle(entry)} />
        <span>
          <span className="shop-name">{entry.name}</span>
          {entry.reasonText && <span className="muted shop-reason">{entry.reasonText}</span>}
        </span>
      </label>
      {onRemove && (
        <button type="button" className="link-button shop-remove" onClick={() => onRemove(entry)}>
          Quitar
        </button>
      )}
    </li>
  )
}
