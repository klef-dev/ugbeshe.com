import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ALLOWED_SET, ANSWERS } from '../game/words'

type Theme = 'light' | 'dark'
type Status = 'correct' | 'present' | 'absent' | 'empty' | 'tbd'
type Mode = 'daily' | 'practice'

const ROWS = 6
const COLS = 5
const STATS_KEY = 'ugbeshe-wordle-stats-v1'
const DAY_MS = 86400000

function utcDayNumber(d = new Date()): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS)
}

function todayKey(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function answerForDay(dayNum: number): string {
  return ANSWERS[((dayNum % ANSWERS.length) + ANSWERS.length) % ANSWERS.length]
}

function dailyAnswer(): { word: string; key: string; dayNum: number } {
  const dayNum = utcDayNumber()
  return { word: answerForDay(dayNum), key: todayKey(), dayNum }
}

export function msUntilNextUTC(): number {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0))
  return Math.max(0, next.getTime() - now.getTime())
}

function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

type Stats = {
  played: number
  won: number
  currentStreak: number
  maxStreak: number
  lastDate: string | null // YYYY-MM-DD last daily completed
  winsByGuess: number[] // len 6
}

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Stats
      if (Array.isArray(s.winsByGuess) && s.winsByGuess.length === 6) return s
    }
  } catch { /* ignore */ }
  return { played: 0, won: 0, currentStreak: 0, maxStreak: 0, lastDate: null, winsByGuess: [0, 0, 0, 0, 0, 0] }
}

function yesterdayKey(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) - DAY_MS)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function evaluate(guess: string, answer: string): Status[] {
  const res: Status[] = Array(COLS).fill('absent')
  const counts = new Map<string, number>()
  for (let i = 0; i < COLS; i++) {
    if (guess[i] !== answer[i]) counts.set(answer[i], (counts.get(answer[i]) ?? 0) + 1)
  }
  // correct first
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct'
  }
  for (let i = 0; i < COLS; i++) {
    if (res[i] === 'correct') continue
    const c = guess[i]
    const left = counts.get(c) ?? 0
    if (left > 0) {
      res[i] = 'present'
      counts.set(c, left - 1)
    } else {
      res[i] = 'absent'
    }
  }
  return res
}

const ROW1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']
const ROW2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']
const ROW3 = ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK']

export default function WordleGame({ theme, onExit, onToggleTheme }: { theme: Theme; onExit: () => void; onToggleTheme: () => void }) {
  const dark = theme === 'dark'
  const daily = useMemo(() => dailyAnswer(), [])
  const [mode, setMode] = useState<Mode>('daily')
  const [practiceWord, setPracticeWord] = useState<string>(() =>
    ANSWERS[Math.floor(Math.random() * ANSWERS.length)],
  )
  const [practiceId, setPracticeId] = useState(1)

  const answer = mode === 'daily' ? daily.word : practiceWord
  const storageKey = mode === 'daily' ? `ugbeshe-wordle-daily-${daily.key}` : `ugbeshe-wordle-practice-${practiceId}`

  const [guesses, setGuesses] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        if (Array.isArray(arr)) return arr.filter((g) => typeof g === 'string').slice(0, ROWS)
      }
    } catch { /* ignore */ }
    return []
  })
  const [current, setCurrent] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [shakeRow, setShakeRow] = useState<number>(-1)
  const [revealRow, setRevealRow] = useState<number>(-1)
  const [stats, setStats] = useState<Stats>(() => loadStats())
  const [showStats, setShowStats] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [shared, setShared] = useState(false)
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilNextUTC()))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishedCounted = useRef(false)

  const gameOver = guesses.length >= ROWS || guesses[guesses.length - 1] === answer
  const won = guesses[guesses.length - 1] === answer
  const attempts = won ? guesses.length : -1

  // reload per mode/key
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        if (Array.isArray(arr)) {
          setGuesses(arr.filter((g) => typeof g === 'string').slice(0, ROWS))
          setCurrent('')
          finishedCounted.current = false
          return
        }
      }
    } catch { /* ignore */ }
    setGuesses([])
    setCurrent('')
    finishedCounted.current = false
  }, [storageKey])

  // persist guesses
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(guesses))
    } catch { /* ignore */ }
  }, [guesses, storageKey])

  // countdown ticker
  useEffect(() => {
    if (mode !== 'daily') return
    const id = setInterval(() => setCountdown(formatCountdown(msUntilNextUTC())), 1000)
    return () => clearInterval(id)
  }, [mode])

  const showToast = useCallback((msg: string, ms = 1600) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), ms)
  }, [])

  // record daily stats once on game end
  useEffect(() => {
    if (mode !== 'daily') return
    if (!gameOver || finishedCounted.current) return
    finishedCounted.current = true
    setStats((prev) => {
      if (prev.lastDate === daily.key) return prev // already counted (reload)
      const next: Stats = { ...prev, winsByGuess: [...prev.winsByGuess], played: prev.played + 1 }
      if (won) {
        next.won += 1
        next.winsByGuess[Math.max(0, guesses.length - 1)] += 1
        next.currentStreak = prev.lastDate === yesterdayKey(daily.key) ? prev.currentStreak + 1 : 1
        next.maxStreak = Math.max(prev.maxStreak, next.currentStreak)
      } else {
        next.currentStreak = 0
      }
      next.lastDate = daily.key
      try {
        localStorage.setItem(STATS_KEY, JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
    if (won) {
      const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!']
      showToast(msgs[Math.min(guesses.length - 1, 5)], 2000)
    }
  }, [gameOver, mode, won, guesses.length, daily.key, showToast])

  // auto-open stats on daily finish (delayed for flip animation)
  useEffect(() => {
    if (mode === 'daily' && gameOver) {
      const id = setTimeout(() => setShowStats(true), 1400)
      return () => clearTimeout(id)
    }
  }, [mode, gameOver])

  const keyStatus = useMemo(() => {
    const map = new Map<string, Status>()
    const rank = (s: Status) => (s === 'correct' ? 3 : s === 'present' ? 2 : s === 'absent' ? 1 : 0)
    guesses.forEach((g) => {
      const ev = evaluate(g, answer)
      for (let i = 0; i < COLS; i++) {
        const prev = map.get(g[i]) ?? 'empty'
        if (rank(ev[i]) > rank(prev)) map.set(g[i], ev[i])
      }
    })
    return map
  }, [guesses, answer])

  const submit = useCallback(() => {
    if (gameOver) return
    if (current.length < COLS) {
      setShakeRow(guesses.length)
      setTimeout(() => setShakeRow(-1), 500)
      showToast('Not enough letters')
      return
    }
    const guess = current.toUpperCase()
    if (!ALLOWED_SET.has(guess)) {
      setShakeRow(guesses.length)
      setTimeout(() => setShakeRow(-1), 500)
      showToast('Not in word list')
      return
    }
    setRevealRow(guesses.length)
    setTimeout(() => setRevealRow(-1), 1800)
    setGuesses((p) => [...p, guess])
    setCurrent('')
  }, [current, gameOver, guesses.length, showToast])

  const onKey = useCallback((k: string) => {
    if (showStats || showHelp) return
    if (gameOver) return
    if (k === 'ENTER') submit()
    else if (k === 'BACK') setCurrent((c) => c.slice(0, -1))
    else if (/^[A-Z]$/.test(k) && current.length < COLS) setCurrent((c) => c + k)
  }, [current.length, gameOver, showHelp, showStats, submit])

  // physical keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') onKey('ENTER')
      else if (e.key === 'Backspace') onKey('BACK')
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase())
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onKey])

  const share = useCallback(async () => {
    const n = won ? String(guesses.length) : 'X'
    const grid = guesses
      .map((g) =>
        evaluate(g, answer)
          .map((s) => (s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛'))
          .join(''),
      )
      .join('\n')
    const label = mode === 'daily' ? `Ugbeshe Daily ${daily.key}` : 'Ugbeshe Word (practice)'
    const text = `${label} ${n}/6\n\n${grid}\n\nPlay: ${window.location.href}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        showToast('Copied to clipboard!')
      }
      setShared(true)
    } catch {
      try {
        await navigator.clipboard.writeText(text)
        showToast('Copied to clipboard!')
        setShared(true)
      } catch { showToast('Copy failed') }
    }
  }, [answer, daily.key, guesses, mode, showToast, won])

  const newPractice = () => {
    let w = practiceWord
    while (w === practiceWord) w = ANSWERS[Math.floor(Math.random() * ANSWERS.length)]
    setPracticeId((i) => i + 1)
    setPracticeWord(w)
    setShowStats(false)
  }

  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0
  const maxWins = Math.max(1, ...stats.winsByGuess)

  return (
    <div
      className="wordle-root"
      style={{
        backgroundColor: dark ? '#000000' : '#ffffff',
        color: dark ? '#ffe0c2' : '#644a40',
      }}
    >
      {toast && <div className="wordle-toast" role="status">{toast}</div>}

      <header className="wordle-header" style={{ borderColor: dark ? 'rgba(255,224,194,0.18)' : 'rgba(100,74,64,0.18)' }}>
        <button type="button" onClick={onExit} className="wordle-icon-btn" aria-label="Back home">←</button>
        <div className="wordle-title">Daily Word</div>
        <div className="wordle-header-actions">
          <button type="button" className="wordle-icon-btn wordle-help-btn" aria-label="How to play" onClick={() => setShowHelp(true)}>?</button>
          <button type="button" className="wordle-icon-btn" aria-label="Stats" onClick={() => setShowStats(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20V10" />
              <path d="M10 20V4" />
              <path d="M16 20v-7" />
              <path d="M22 20H2" />
            </svg>
          </button>
          <button type="button" className="wordle-icon-btn" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onToggleTheme}>
            {dark ? (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className="wordle-tabs" role="tablist" aria-label="Mode">
        {(['daily', 'practice'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setShowStats(false) }}
            className={`wordle-tab ${mode === m ? 'active' : ''}`}
            style={
              mode === m
                ? { backgroundColor: dark ? '#ffe0c2' : '#644a40', color: dark ? '#000' : '#fff' }
                : { color: dark ? '#ffe0c2' : '#644a40', borderColor: dark ? 'rgba(255,224,194,0.3)' : 'rgba(100,74,64,0.3)' }
            }
          >
            {m === 'daily' ? `Daily 🔥${stats.currentStreak}` : 'Practice ∞'}
          </button>
        ))}
      </div>
      <div className="wordle-sub">
        {mode === 'daily'
          ? `Same word for everyone • ${daily.key} • new in ${countdown}`
          : 'Unlimited words • streak not counted'}
      </div>

      <div className="wordle-board" role="grid" aria-label="Guesses">
        {Array.from({ length: ROWS }).map((_, r) => {
          const guess = guesses[r] ?? (r === guesses.length ? current.padEnd(COLS, ' ') : '')
          const submitted = r < guesses.length
          const ev = submitted ? evaluate(guesses[r], answer) : null
          return (
            <div key={r} className={`wordle-row ${shakeRow === r ? 'shake' : ''}`} role="row">
              {Array.from({ length: COLS }).map((_, c) => {
                const ch = (guess[c] ?? '').trim()
                const st: Status = submitted && ev ? ev[c] : ch ? 'tbd' : 'empty'
                return (
                  <div
                    key={c}
                    role="gridcell"
                    className={`wordle-tile ${st} ${revealRow === r && submitted ? 'reveal' : ''}`}
                    style={{ animationDelay: revealRow === r ? `${c * 0.28}s` : undefined }}
                  >
                    {ch}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {gameOver && (
        <div className="wordle-endmsg">
          {won ? (
            <span>You got it in <b>{guesses.length}/6</b>!</span>
          ) : (
            <span>The word was <b>{answer}</b></span>
          )}
          <button type="button" className="wordle-share" onClick={share}>
            {shared ? 'Copied ✓' : 'Share 📋'}
          </button>
          {mode === 'practice' && (
            <button type="button" className="wordle-share secondary" onClick={newPractice}>New word ↻</button>
          )}
        </div>
      )}

      <div className="wordle-kb" aria-label="Keyboard">
        {[ROW1, ROW2, ROW3].map((row, i) => (
          <div key={i} className="wordle-kb-row">
            {row.map((k) => {
              const wide = k === 'ENTER' || k === 'BACK'
              const st = !wide ? keyStatus.get(k) : undefined
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onKey(k)}
                  className={`wordle-key ${wide ? 'wide' : ''} ${st ?? ''}`}
                  aria-label={k === 'BACK' ? 'Backspace' : k}
                >
                  {k === 'BACK' ? '⌫' : k === 'ENTER' ? '⏎' : k}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {showHelp && (
        <div className="wordle-overlay" onClick={() => setShowHelp(false)}>
          <div className="wordle-modal" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: dark ? '#14100d' : '#fff', color: dark ? '#ffe0c2' : '#644a40' }}>
            <h2>How to play</h2>
            <p>Guess the <b>5-letter English word</b> in 6 tries. Same word for everyone each day (UTC).</p>
            <div className="wordle-help-ex">
              <div className="wordle-tile correct">W</div>
              <div className="wordle-tile tbd">O</div>
              <div className="wordle-tile tbd">R</div>
              <div className="wordle-tile tbd">D</div>
              <div className="wordle-tile tbd">Y</div>
            </div>
            <p><b>W</b> is in the word and in the right spot.</p>
            <p>🟨 = right letter, wrong spot. ⬛ = not in the word.</p>
            <p>Daily wins build your 🔥 streak. Practice is unlimited.</p>
            <button type="button" className="wordle-share" onClick={() => setShowHelp(false)}>Play!</button>
          </div>
        </div>
      )}

      {showStats && (
        <div className="wordle-overlay" onClick={() => setShowStats(false)}>
          <div className="wordle-modal" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: dark ? '#14100d' : '#fff', color: dark ? '#ffe0c2' : '#644a40' }}>
            <button type="button" className="wordle-x" onClick={() => setShowStats(false)} aria-label="Close">✕</button>
            <h2>Statistics</h2>
            <div className="wordle-stat-row">
              <div><b>{stats.played}</b><span>Played</span></div>
              <div><b>{winPct}%</b><span>Win</span></div>
              <div><b>{stats.currentStreak}</b><span>🔥 Streak</span></div>
              <div><b>{stats.maxStreak}</b><span>Max</span></div>
            </div>
            <h3>Guess distribution</h3>
            <div className="wordle-dist">
              {stats.winsByGuess.map((n, i) => (
                <div key={i} className="wordle-dist-row">
                  <span>{i + 1}</span>
                  <div className="wordle-dist-bar">
                    <div
                      className="wordle-dist-fill"
                      style={{
                        width: `${Math.max(8, (n / maxWins) * 100)}%`,
                        backgroundColor: gameOver && won && guesses.length === i + 1 && mode === 'daily' ? '#6aaa64' : dark ? 'rgba(255,224,194,0.35)' : 'rgba(100,74,64,0.4)',
                      }}
                    >{n}</div>
                  </div>
                </div>
              ))}
            </div>
            {mode === 'daily' && gameOver && (
              <>
                <div className="wordle-next">
                  <div><span>Next word in</span><b>{countdown}</b></div>
                  <button type="button" className="wordle-share" onClick={share}>{shared ? 'Copied ✓' : 'Share 📋'}</button>
                </div>
              </>
            )}
            {mode === 'practice' && gameOver && (
              <button type="button" className="wordle-share" onClick={newPractice}>New word ↻</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
