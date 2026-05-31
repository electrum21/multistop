const LEG_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

// Singapore LRT lines reported as TRAM by Google — treat them as SUBWAY
const LRT_LINES = new Set(['PG', 'SK', 'BP', 'STC', 'CGL'])
function normaliseMode(mode: string, line?: string): string {
  if (mode?.toUpperCase() === 'TRAM' && line && LRT_LINES.has(line.toUpperCase())) return 'SUBWAY'
  return mode
}

interface StepDetail {
  instruction: string
  mode: string
  line: string
  durationSeconds: number
  polyline?: { lat: number; lng: number }[]
}

interface LegData {
  legIndex: number
  from: string
  to: string
  departureTime: string
  arrivalTime: string
  durationMinutes: number
  mode: string
  line: string
  steps: StepDetail[]
  alternatives?: LegData[]
}

interface StopData {
  name: string
  arrivalTime: string | null
  departureTime: string | null
  stay: number
}

interface RouteResult {
  departureTime: string
  arrivalTime: string
  totalDurationMinutes: number
  legs: LegData[]
  stops: StopData[]
}

interface Props {
  result: RouteResult
  selectedOptions: number[]
  onSelectOption: (legIndex: number, optionIndex: number) => void
  highlightedLeg: number | null
  onHighlightLeg: (legIndex: number | null) => void
}

function modeIcon(mode: string) {
  switch (mode?.toUpperCase()) {
    case 'SUBWAY': return '🚇'
    case 'BUS': return '🚌'
    case 'WALK': return '🚶'
    case 'TRAM': return '🚊'
    case 'FERRY': return '⛴️'
    default: return '🚌'
  }
}

function modeLabel(mode: string) {
  switch (mode?.toUpperCase()) {
    case 'SUBWAY': return 'Train'
    case 'BUS': return 'Bus'
    case 'WALK': return 'Walk'
    case 'TRAM': return 'Tram'
    case 'FERRY': return 'Ferry'
    default: return mode ?? 'Transit'
  }
}

function stepModeColor(mode: string) {
  switch (mode?.toUpperCase()) {
    case 'SUBWAY': return { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' }
    case 'BUS': return { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' }
    case 'WALK': return { bg: '#F9FAFB', text: '#6B7280', border: '#E5E7EB' }
    case 'TRAM': return { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' }
    case 'FERRY': return { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' }
    default: return { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' }
  }
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function LegSteps({ steps }: { steps: StepDetail[] }) {
  if (!steps || steps.length === 0) return null
  return (
    <div className="mt-2 mb-1 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700">
      {steps.map((step, i) => {
        const effectiveMode = normaliseMode(step.mode, step.line)
        const colors = stepModeColor(effectiveMode)
        return (
          <div
            key={i}
            className="flex items-start gap-2.5 px-3 py-2 text-xs border-b border-gray-50 dark:border-gray-700 last:border-b-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            <div
              className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <span>{modeIcon(effectiveMode)}</span>
              <span>{modeLabel(effectiveMode)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-gray-700 dark:text-gray-300 leading-snug">{step.instruction}</div>
              {step.line && (
                <div className="text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                  Line: <span className="font-medium text-gray-600 dark:text-gray-400">{step.line}</span>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 text-gray-400 dark:text-gray-500 font-medium tabular-nums whitespace-nowrap">
              {formatDuration(step.durationSeconds)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OptionPicker({
  leg, selectedIndex, color, onSelect,
}: {
  leg: LegData
  selectedIndex: number
  color: string
  onSelect: (i: number) => void
}) {
  const alts = leg.alternatives
  if (!alts || alts.length <= 1) return null

  // Deduplicate by lines + departure time
  const seen = new Set<string>()
  const unique = alts.reduce<{ alt: LegData; originalIndex: number }[]>((acc, alt, i) => {
    const transitSteps = alt.steps?.filter(s => s.mode !== 'WALK' && s.line) ?? []
    const key = transitSteps.map(s => s.line).join('+') + alt.departureTime
    if (!seen.has(key)) { seen.add(key); acc.push({ alt, originalIndex: i }) }
    return acc
  }, [])

  if (unique.length <= 1) return null

  const top3 = unique
    .sort((a, b) => a.alt.durationMinutes - b.alt.durationMinutes)
    .slice(0, 3)

  return (
    <div className="flex gap-1 mt-2 flex-wrap">
      {top3.map(({ alt, originalIndex }, i) => {
        const isSelected = originalIndex === selectedIndex
        const transitSteps = alt.steps?.filter(s => s.mode !== 'WALK' && s.line) ?? []
        const lines = transitSteps.length > 0
          ? transitSteps.map(s => s.line).join(' + ')
          : formatMinutes(alt.durationMinutes)

        return (
          <button
            key={originalIndex}
            onClick={() => onSelect(originalIndex)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all border"
            style={isSelected
              ? { background: color, color: '#fff', borderColor: color }
              : { background: 'transparent', color: '#6B7280', borderColor: '#E5E7EB' }
            }
          >
            <span>{lines}</span>
            <span className="opacity-70">· {alt.departureTime} · {formatMinutes(alt.durationMinutes)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Timeline({ result, selectedOptions, onSelectOption, highlightedLeg, onHighlightLeg }: Props) {
  const { legs, stops, totalDurationMinutes, arrivalTime } = result

  const activeLeg = (leg: LegData, i: number): LegData => {
    const sel = selectedOptions[i] ?? 0
    return sel === 0 ? leg : (leg.alternatives?.[sel] ?? leg)
  }

  const walkMin = legs.reduce((s, leg, i) => {
    const l = activeLeg(leg, i)
    if (!l.steps) return s
    return s + l.steps
      .filter(st => st.mode?.toUpperCase() === 'WALK')
      .reduce((ws, st) => ws + Math.round(st.durationSeconds / 60), 0)
  }, 0)

  const stayMin = stops.slice(1, -1).reduce((s, st) => s + (st.stay ?? 0), 0)
  const transitMin = legs.reduce((s, leg, i) => s + activeLeg(leg, i).durationMinutes, 0) - walkMin

  return (
    <div className="flex flex-col h-full">
      {/* Summary strip */}
      <div className="flex gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 text-center flex-shrink-0">
        {[
          { val: formatMinutes(totalDurationMinutes), label: 'Total' },
          { val: formatMinutes(transitMin), label: 'Transit' },
          { val: formatMinutes(walkMin), label: 'Walking' },
          { val: formatMinutes(stayMin), label: 'Layovers' },
        ].map(({ val, label }) => (
          <div key={label} className="flex-1">
            <div className="text-base font-medium leading-tight dark:text-gray-100">{val}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Timeline scroll area */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="relative">
          {legs.map((leg, i) => {
            const color = LEG_COLORS[i % LEG_COLORS.length]
            const active = activeLeg(leg, i)
            const midStop = stops[i + 1]
            const hasStay = midStop && midStop.stay > 0 && i < legs.length - 1
            const selIdx = selectedOptions[i] ?? 0

            return (
              <div key={i}>
                <div className="flex gap-3 relative">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 z-10 relative"
                      style={{ background: `${color}18`, border: `1.5px solid ${color}55` }}
                    >
                      {modeIcon(normaliseMode(active.mode, active.line))}
                      <span
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ background: color, fontSize: '9px', lineHeight: 1 }}
                      >
                        {i + 1}
                      </span>
                    </div>
                    <div className="w-px flex-1 min-h-[24px]" style={{ background: `${color}30` }} />
                  </div>
                  <div className="pb-1 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">{active.departureTime}</div>
                        <div className="text-sm font-medium mt-0.5 truncate dark:text-gray-100">{active.from}</div>
                      </div>
                      <button
                        onMouseEnter={() => onHighlightLeg(i)}
                        onMouseLeave={() => onHighlightLeg(null)}
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all border mt-0.5"
                        style={
                          highlightedLeg === i
                            ? { background: color, color: '#fff', borderColor: color, boxShadow: `0 0 8px ${color}80` }
                            : { background: 'transparent', color: '#9CA3AF', borderColor: '#E5E7EB' }
                        }
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        <span>View Segment</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {modeLabel(normaliseMode(active.mode, active.line))}{active.line ? ` · ${active.line}` : ''} → {active.to}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                        style={{ background: `${color}15`, color }}
                      >
                        {formatMinutes(active.durationMinutes)}
                      </span>
                    </div>

                    <OptionPicker
                      leg={leg}
                      selectedIndex={selIdx}
                      color={color}
                      onSelect={(idx) => onSelectOption(i, idx)}
                    />

                    {active.steps && active.steps.length > 0 && (
                      <LegSteps steps={active.steps} />
                    )}

                    <div className="flex items-center gap-1.5 mt-1.5 mb-3">
                      <div className="h-px flex-1" style={{ background: `${color}20` }} />
                      <span className="text-xs text-gray-400 dark:text-gray-500">{active.arrivalTime}</span>
                    </div>
                  </div>
                </div>

                {hasStay && (
                  <div className="flex gap-3 relative">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 z-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        📍
                      </div>
                      <div className="w-px flex-1 min-h-[24px] bg-gray-100 dark:bg-gray-700" />
                    </div>
                    <div className="pb-3 flex-1 min-w-0">
                      <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">{active.arrivalTime}</div>
                      <div className="text-sm font-medium mt-0.5 truncate dark:text-gray-100">{active.to}</div>
                      <div className="mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">⏱ Staying {midStop.stay} min</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          {active.arrivalTime} → {legs[i + 1] ? activeLeg(legs[i + 1], i + 1).departureTime : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Final arrival */}
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400">
              {stops.length}
            </div>
            <div className="pb-2 flex-1 min-w-0">
              <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">{arrivalTime}</div>
              <div className="text-sm font-medium mt-0.5 truncate dark:text-gray-100">
                {stops[stops.length - 1]?.name}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Arrived at destination</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}