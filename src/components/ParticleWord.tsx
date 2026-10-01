import { useEffect, useRef } from 'react'

type P = { hx: number; hy: number; x: number; y: number; vx: number; vy: number }
type Floater = { x: number; y: number; vx: number; vy: number; r: number; ph: number; sp: number }

export default function ParticleWord({ theme }: { theme: 'light' | 'dark' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const mouse = { x: -9999, y: -9999 }
    const RADIUS = 90
    let w = 0, h = 0, raf = 0
    let pts: P[] = []
    let floaters: Floater[] = []

    const seedFloaters = () => {
      const n = Math.min(90, Math.max(40, Math.floor((w * h) / 22000)))
      floaters = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 0.8 + Math.random() * 1.6,
        ph: Math.random() * Math.PI * 2,
        sp: 0.5 + Math.random() * 1.5,
      }))
    }

    const build = () => {
      const rect = canvas.parentElement!.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seedFloaters()

      const off = document.createElement('canvas')
      off.width = Math.max(1, Math.floor(w))
      off.height = Math.max(1, Math.floor(h))
      const o = off.getContext('2d', { willReadFrequently: true })
      if (!o) return

      const fontSize = Math.min(w / 4.6, h / 1.7, 380)
      o.clearRect(0, 0, w, h)
      o.fillStyle = '#fff'
      o.textAlign = 'center'
      o.textBaseline = 'middle'
      const oStyle = o as CanvasRenderingContext2D & { letterSpacing?: string }
      oStyle.letterSpacing = `${-fontSize * 0.02}px`
      o.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", system-ui, sans-serif`
      o.fillText('Ugbeshe', w / 2, h / 2 + fontSize * 0.02)

      const gap = w < 640 ? 3 : fontSize > 240 ? 6 : 4
      const W = Math.floor(w)
      const H = Math.floor(h)
      const img = o.getImageData(0, 0, W, H).data
      pts = []
      for (let y = 0; y < H; y += gap) {
        for (let x = 0; x < W; x += gap) {
          if (img[(y * W + x) * 4 + 3] > 128) {
            pts.push({ hx: x, hy: y, x, y, vx: 0, vy: 0 })
          }
        }
      }
    }

    const el = canvas.parentElement!

    build()
    if (document.fonts?.ready) document.fonts.ready.then(build).catch(() => {})
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(build, 150)
    }
    window.addEventListener('resize', onResize)

    const setMouse = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = cx - r.left
      mouse.y = cy - r.top
    }
    const onMove = (e: PointerEvent) => setMouse(e.clientX, e.clientY)
    const onDown = (e: PointerEvent) => setMouse(e.clientX, e.clientY)
    const onLeave = () => {
      mouse.x = -9999
      mouse.y = -9999
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerleave', onLeave)

    let t = 0
    const frame = () => {
      t += 0.016
      const dark = themeRef.current === 'dark'
      ctx.clearRect(0, 0, w, h)

      // ambient floaters behind the word — glow harder in dark mode
      for (const f of floaters) {
        f.x += f.vx + Math.sin(t * 0.6 + f.ph) * 0.07
        f.y += f.vy + Math.cos(t * 0.5 + f.ph) * 0.07
        const dx = f.x - mouse.x
        const dy = f.y - mouse.y
        const d2 = dx * dx + dy * dy
        if (d2 < 140 * 140 && d2 > 1) {
          const d = Math.sqrt(d2)
          const push = ((140 - d) / 140) * 0.5
          f.x += (dx / d) * push
          f.y += (dy / d) * push
        }
        if (f.x < -10) f.x = w + 10
        if (f.x > w + 10) f.x = -10
        if (f.y < -10) f.y = h + 10
        if (f.y > h + 10) f.y = -10
        const tw = 0.5 + 0.5 * Math.sin(t * f.sp + f.ph)
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        if (dark) {
          ctx.shadowColor = 'rgba(255,224,194,0.9)'
          ctx.shadowBlur = 12
          ctx.fillStyle = `rgba(255,224,194,${(0.35 + tw * 0.55).toFixed(3)})`
        } else {
          ctx.shadowColor = 'rgba(100,74,64,0.55)'
          ctx.shadowBlur = 10
          ctx.fillStyle = `rgba(80,58,48,${(0.16 + tw * 0.26).toFixed(3)})`
        }
        ctx.fill()
      }
      ctx.shadowBlur = 0

      // the word — magnetic squares: coffee in light, #ffe0c2 on black in dark
      ctx.fillStyle = dark ? '#ffe0c2' : '#644a40'
      const S = 2
      for (const p of pts) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const d2 = dx * dx + dy * dy
        if (d2 < RADIUS * RADIUS) {
          const d = Math.sqrt(d2) || 1
          const fall = 1 - d / RADIUS
          const f = fall * fall * 1.6
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
        }
        p.vx += (p.hx - p.x) * 0.035
        p.vy += (p.hy - p.y) * 0.035
        p.vx *= 0.82
        p.vy *= 0.82
        p.x += p.vx
        p.y += p.vy
        ctx.fillRect(p.x, p.y, S, S)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="stage-canvas"
      style={{ cursor: 'crosshair' }}
      role="img"
      aria-label="Ugbeshe written in interactive magnetic particles"
    />
  )
}
