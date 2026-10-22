import { useEffect, useRef, useState } from 'react'
import { swipeDirection } from '../lib/swipe.js'

const EXIT_MS = 200

// One dish proposal. Swipe left (or ✕) to skip it, swipe right (or ✓) to see
// the recipe. The parent gives each dish its own `key`, so a new dish starts fresh.
export default function SuggestionCard({ suggestion, onSkip, onOpen }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const start = useRef(null) // { x, y } where the finger went down
  const done = useRef(false) // a double tap must not trigger two actions
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  function skip() {
    if (done.current) return
    done.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onSkip()
      return
    }
    setLeaving(true)
    setDx(-window.innerWidth)
    timer.current = setTimeout(onSkip, EXIT_MS)
  }

  function open() {
    if (done.current) return
    done.current = true
    onOpen()
  }

  function onPointerDown(e) {
    if (done.current || !e.isPrimary || e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!start.current) return
    setDx(e.clientX - start.current.x)
  }

  function onPointerUp(e) {
    if (!start.current) return
    const moveX = e.clientX - start.current.x
    const moveY = e.clientY - start.current.y
    start.current = null
    setDragging(false)
    // A mostly vertical drag is the page scrolling, not a swipe.
    const direction = Math.abs(moveY) > Math.abs(moveX) ? null : swipeDirection(moveX)
    if (direction === 'left') skip()
    else if (direction === 'right') open()
    else setDx(0)
  }

  function onPointerCancel() {
    start.current = null
    setDragging(false)
    setDx(0)
  }

  const style = {
    transform: `translateX(${dx}px) rotate(${dx / 30}deg)`,
    // No transition while the finger is down, so the card follows it.
    transition: dragging ? 'none' : `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out`,
    opacity: leaving ? 0 : 1,
  }

  return (
    <div className="suggestion">
      <div
        className="suggestion-card"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <h2>{suggestion.title}</h2>
        {suggestion.minutes != null && <p className="muted">{`${suggestion.minutes} min`}</p>}
        {suggestion.reasons.map((reason) => (
          <p key={reason} className="suggestion-reason">{reason}</p>
        ))}
        {suggestion.missing && <span className="chip chip-soon">{suggestion.missing}</span>}
      </div>
      <div className="suggestion-actions">
        <button className="suggestion-btn" aria-label="Otro plato" onClick={skip}>✕</button>
        <button className="suggestion-btn suggestion-btn-ok" aria-label="Ver receta" onClick={open}>✓</button>
      </div>
    </div>
  )
}
