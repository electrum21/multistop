import React from 'react'

type Tab = 'plan' | 'timeline' | 'favourites'

type Props = {
  tab: Tab
  setTab: (t: Tab) => void
  setSheetFull: (v: boolean) => void
}

export default function TabBar({ tab, setTab, setSheetFull }: Props) {
  const items = [
    { id: 'plan' as Tab, label: 'Plan', icon: 'fa-regular fa-map' },
    { id: 'timeline' as Tab, label: 'Timeline', icon: 'fa-regular fa-clock' },
    { id: 'favourites' as Tab, label: 'Saved', icon: 'fa-regular fa-bookmark' },
  ]

  return (
    <div className="font-identity flex px-5 pt-3 pb-0 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
      {items.map(({ id, label, icon }) => (
        <button key={id} onClick={() => { setTab(id); setSheetFull(true) }}
          className={['flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-t-md border-b-2 transition-colors',
            tab === id ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
          ].join(' ')}>
          <i className={icon} />
          {label}
        </button>
      ))}
    </div>
  )
}
