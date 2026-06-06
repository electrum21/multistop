import React from 'react'

type Props = {
  theme: 'light' | 'dark'
  setTheme: (t: 'light' | 'dark') => void
}

export default function ThemeToggle({ theme, setTheme }: Props) {
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
      <button onClick={() => setTheme('light')} className={theme === 'light' ? 'bg-white rounded-md px-2 py-1 shadow-sm' : 'px-2 py-1 opacity-40'} aria-label="Light mode">
        <i className="fa-solid fa-sun text-amber-400 text-sm" />
      </button>
      <button onClick={() => setTheme('dark')} className={theme === 'dark' ? 'bg-white dark:bg-gray-700 rounded-md px-2 py-1 shadow-sm' : 'px-2 py-1 opacity-40'} aria-label="Dark mode">
        <i className="fa-solid fa-moon text-indigo-400 text-sm" />
      </button>
    </div>
  )
}
