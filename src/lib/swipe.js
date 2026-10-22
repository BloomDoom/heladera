// Horizontal drag distance (px) to a swipe direction; null when too short.
export function swipeDirection(dx, threshold = 80) {
  if (dx < -threshold) return 'left'
  if (dx > threshold) return 'right'
  return null
}
