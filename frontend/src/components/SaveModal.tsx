import React from 'react'

type Props = {
  open: boolean
  onClose: () => void
  label: string
  setLabel: (s: string) => void
  onConfirm: () => void
}

export default function SaveModal({ open, onClose, label, setLabel, onConfirm }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-4">
        <h2 className="font-identity text-base font-medium dark:text-gray-100">Save trip</h2>
        <input
          autoFocus
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onClose() }}
          placeholder="Trip name"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-gray-700 transition-colors"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-sm rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
