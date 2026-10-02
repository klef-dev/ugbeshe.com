import { useEffect, useState } from 'react'
import ParticleWord from './components/ParticleWord'
import WordleGame from './components/WordleGame'

type Theme = 'light' | 'dark'

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem('ugbeshe-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable — fall through */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [view, setView] = useState<'home' | 'game'>('home')
  const dark = theme === 'dark'

  useEffect(() => {
    try {
      localStorage.setItem('ugbeshe-theme', theme)
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.body.style.backgroundColor = theme === 'dark' ? '#000000' : '#ffffff'
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  if (view === 'game') {
    return (
      <main
        className="stage-fill"
        style={{
          backgroundColor: dark ? '#000000' : '#ffffff',
          color: dark ? '#ffe0c2' : '#644a40',
        }}
      >
        <WordleGame theme={theme} onExit={() => setView('home')} onToggleTheme={toggle} />
      </main>
    )
  }

  return (
    <main
      className="stage-fill"
      style={{
        backgroundColor: dark ? '#000000' : '#ffffff',
        color: dark ? '#ffe0c2' : '#644a40',
        transition: 'background-color 0.4s ease, color 0.4s ease',
      }}
    >
      <div className="stage-absolute">
        <ParticleWord theme={theme} />
      </div>
      <div className="home-cta">
        <p className="home-tag">English 5-letter • new word every day</p>
        <button
          type="button"
          onClick={() => setView('game')}
          className="home-play"
          style={{
            backgroundColor: dark ? '#ffe0c2' : '#644a40',
            color: dark ? '#000000' : '#ffffff',
          }}
        >
          Play Daily Word →
        </button>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`theme-btn ${dark ? 'theme-btn-dark' : 'theme-btn-light'}`}
      >
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
    </main>
  )
}
