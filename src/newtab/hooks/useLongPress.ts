import { useRef } from 'react'

export function useLongPress(
  onLongPress: ((pos: { x: number; y: number }) => void) | undefined,
  delay = 400
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggered = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })

  function start(e: React.MouseEvent) {
    if (e.button !== 0) return
    if (!onLongPress) return
    triggered.current = false
    startPos.current = { x: e.clientX, y: e.clientY }

    function cancelOnEarlyRelease() {
      if (timer.current !== null) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }

    document.addEventListener('mouseup', cancelOnEarlyRelease, { once: true })

    timer.current = setTimeout(() => {
      timer.current = null
      document.removeEventListener('mouseup', cancelOnEarlyRelease)
      triggered.current = true
      onLongPress(startPos.current)
    }, delay)
  }

  function wasLongPressed() {
    if (triggered.current) {
      triggered.current = false
      return true
    }
    return false
  }

  return { onMouseDown: start, wasLongPressed }
}
