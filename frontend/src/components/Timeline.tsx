// Timeline component — no default React import required with new JSX transform

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
  departureStop?: string
  arrivalStop?: string
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

interface HighlightedStep { leg: number; stepIndex: number }

interface Props {
  result: RouteResult
  selectedOptions: number[]
  onSelectOption: (legIndex: number, optionIndex: number) => void
  highlightedLeg: number | null
  onHighlightLeg: (legIndex: number | null) => void
  highlightedStep: HighlightedStep | null
  onHighlightStep: (step: HighlightedStep | null) => void
  onSave?: () => void
}

function modeIcon(mode: string, line?: string): JSX.Element {
  const effective = (line && line !== 'Sentosa Express') ? normaliseMode(mode, line) : mode
  switch (effective?.toUpperCase()) {
    case 'SUBWAY': return <i className="fa-solid fa-train-subway dark:text-white" />
    case 'BUS': return <i className="fa-solid fa-bus dark:text-white" />
    case 'WALK': return <i className="fa-solid fa-person-walking dark:text-white" />
    case 'TRAM': return <i className="fa-solid fa-train-tram dark:text-white" />
    case 'FERRY': return <i className="fa-solid fa-ferry dark:text-white" />
    default: return <i className="fa-solid fa-bus dark:text-white" />
  }
}

function modeLabel(mode: string, line?: string) {
  if (mode?.toUpperCase() === 'TRAM' && line === 'Sentosa Express') return 'Monorail'
  const effective = normaliseMode(mode, line)
  switch (effective?.toUpperCase()) {
    case 'SUBWAY': return 'Train'
    case 'BUS': return 'Bus'
    case 'WALK': return 'Walk'
    case 'TRAM': return 'Tram'
    case 'FERRY': return 'Ferry'
    default: return mode ?? 'Transit'
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

function fixInstruction(instruction: string, line?: string): string {
  let text = instruction
  if (line === 'Sentosa Express') {
    text = text.replace(/\bTram\b/gi, 'Monorail')
  } else if (line && LRT_LINES.has(line.toUpperCase())) {
    text = text.replace(/\bTram\b/gi, 'Train')
  }
  text = text.replace(/\bSubway\b/gi, 'Train')
  return text
}


// MRT line colours (official LTA palette)
const MRT_LINES: Record<string, { bg: string; text: string; label: string }> = {
  'Sentosa Express': { bg: '#F5A623', text: '#fff', label: 'Sentosa Express' },
  EW:  { bg: '#009645', text: '#fff', label: 'EWL' },
  CG:  { bg: '#009645', text: '#fff', label: 'EWL' },
  NS:  { bg: '#D42E12', text: '#fff', label: 'NSL' },
  NE:  { bg: '#9900AA', text: '#fff', label: 'NEL' },
  CC:  { bg: '#FA9E0D', text: '#fff', label: 'CCL' },
  CE:  { bg: '#FA9E0D', text: '#fff', label: 'CCL' },
  DT:  { bg: '#005EC4', text: '#fff', label: 'DTL' },
  TE:  { bg: '#9D5B25', text: '#fff', label: 'TEL' },
  JS:  { bg: '#0099AA', text: '#fff', label: 'JSL' },
  JW:  { bg: '#0099AA', text: '#fff', label: 'JSL' },
  BP:  { bg: '#748477', text: '#fff', label: 'BPLRT' },
  PG:  { bg: '#748477', text: '#fff', label: 'PGLRT' },
  SK:  { bg: '#748477', text: '#fff', label: 'SKLRT' },
}

function MrtPill({ line }: { line: string }) {
  // Check full string first (e.g. "Sentosa Express"), then extract MRT code prefix
  const cfg = MRT_LINES[line] ?? MRT_LINES[line.trim().split(/[^A-Z]/)[0]]
  if (!cfg) return <span className="font-medium text-gray-600 dark:text-gray-400">{line}</span>
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-bold leading-none"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  )
}

// Bus operator colour config
// SBS Transit (SBST) → purple, Go-Ahead Singapore (GAS) → yellow, Tower Transit (TTS) → green, SMRT → red
const BUS_OPERATOR_STYLES: Record<string, { bg: string; text: string }> = {
  SBST: { bg: '#7C3AED', text: '#fff' },  // purple
  GAS:  { bg: '#D97706', text: '#fff' },  // yellow/amber
  TTS:  { bg: '#16A34A', text: '#fff' },  // green
  SMRT: { bg: '#DC2626', text: '#fff' },  // red
}

// Build a Map from service number → operator using the imported JSON
import busServicesData from '../../../bus-services.json'

const BUS_SERVICE_OPERATOR: Map<string, string> = new Map()
;(busServicesData as Array<{ ServiceNo: string; Operator: string }>).forEach(({ ServiceNo, Operator }) => {
  if (!BUS_SERVICE_OPERATOR.has(ServiceNo)) {
    BUS_SERVICE_OPERATOR.set(ServiceNo, Operator)
  }
})

function BusPill({ serviceNo }: { serviceNo: string }) {
  const operator = BUS_SERVICE_OPERATOR.get(serviceNo)
  const style = operator ? BUS_OPERATOR_STYLES[operator] : undefined
  if (!style) {
    // Fallback: plain styled badge
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-xs font-bold leading-none bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200">
        {serviceNo}
      </span>
    )
  }
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-bold leading-none"
      style={{ background: style.bg, color: style.text }}
    >
      {serviceNo}
    </span>
  )
}

function LegSteps({
  steps,
  legIndex,
  highlightedStep,
  onHighlightStep,
}: {
  steps: StepDetail[]
  legIndex: number
  highlightedStep: HighlightedStep | null
  onHighlightStep: (s: HighlightedStep | null) => void
}) {
  if (!steps || steps.length === 0) return null
  return (
    <div className="mt-2 mb-1 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700">
      {steps.map((step, i) => {
        const effectiveMode = normaliseMode(step.mode, step.line)
        const isHighlighted = highlightedStep?.leg === legIndex && highlightedStep?.stepIndex === i
        const hasPolyline = step.polyline && step.polyline.length > 0
        return (
          <div
            key={i}
            className="flex items-start gap-2.5 px-3 py-2 text-xs border-b border-gray-50 dark:border-gray-700 last:border-b-0 bg-white dark:bg-gray-800 transition-colors"
            style={
              isHighlighted
                ? { background: 'rgba(37,99,235,0.08)', outline: '1.5px solid rgba(37,99,235,0.25)' }
                : undefined
            }
            onMouseEnter={() => hasPolyline && onHighlightStep({ leg: legIndex, stepIndex: i })}
            onMouseLeave={() => hasPolyline && onHighlightStep(null)}
            onClick={() => hasPolyline && (isHighlighted ? onHighlightStep(null) : onHighlightStep({ leg: legIndex, stepIndex: i }))}
          >
            <div className="flex-shrink-0 w-5 text-center leading-snug mt-0.5">
              <span>{modeIcon(effectiveMode)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-gray-700 dark:text-gray-200 leading-snug">{fixInstruction(step.instruction, step.line)}</div>
              {step.line && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  {(effectiveMode?.toUpperCase() === 'SUBWAY' || step.line === 'Sentosa Express')
                    ? <MrtPill line={step.line} />
                    : effectiveMode?.toUpperCase() === 'BUS'
                      ? <BusPill serviceNo={step.line} />
                      : <span className="text-gray-400 dark:text-gray-500">Line: <span className="font-medium text-gray-600 dark:text-gray-400">{step.line}</span></span>
                  }
                </div>
              )}
              {step.departureStop && step.arrivalStop && (
                <div className="text-gray-400 dark:text-gray-400 mt-0.5 space-y-0.5">
                  {(() => {
                    const isSubway = effectiveMode?.toUpperCase() === 'SUBWAY'
                    const suffix = isSubway ? ' Stn' : ''
                    return (
                      <>
                        <div>Board: <span className="font-medium text-gray-700 dark:text-gray-200">{step.departureStop}{suffix}</span></div>
                        <div>Alight: <span className="font-medium text-gray-700 dark:text-gray-200">{step.arrivalStop}{suffix}</span></div>
                      </>
                    )
                  })()}
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
      {top3.map(({ alt, originalIndex }) => {
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

function StopCircle({ number, color}: { number: number; color: string; isLast?: boolean }) {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center font-bold flex-shrink-0 z-10 text-white"
      style={{ background: color, fontSize: '13px' }}
    >
      {number}
    </div>
  )
}

function ViewSegmentButton({ color, highlighted, onEnter, onLeave }: {
  color: string
  highlighted: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  return (
    <button
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => highlighted ? onLeave() : onEnter()}
      className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all border mt-0.5"
      style={
        highlighted
          ? { background: color, color: '#fff', borderColor: color, boxShadow: `0 0 8px ${color}80` }
          : { background: 'transparent', color: '#9CA3AF', borderColor: '#E5E7EB' }
      }
    >
      <i className="fa-regular fa-eye text-xs dark:text-white" />
      <span>View Segment</span>
    </button>
  )
}

export function Timeline({ result, selectedOptions, onSelectOption, highlightedLeg, onHighlightLeg, highlightedStep, onHighlightStep, onSave }: Props) {
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
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex flex-1 gap-2 text-center">
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
        {onSave && (
          <button
            onClick={onSave}
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
          >
            <i className="fa-regular fa-bookmark" />
            Save
          </button>
        )}
      </div>

      {/* Timeline scroll area */}
      <div className="flex-1 overflow-y-auto px-5 pt-4">
        <div className="relative">
          {legs.map((leg, i) => {
            const color = '#2563EB'
            const nextColor = '#2563EB'
            const active = activeLeg(leg, i)
            const midStop = stops[i + 1]
            const hasStay = midStop && midStop.stay > 0 && i < legs.length - 1
            const selIdx = selectedOptions[i] ?? 0
            const stopNum = i + 1  // departure stop number for this leg

            const prevHasStay = i > 0 && stops[i] && stops[i].stay > 0

            return (
              <div key={i}>

                {/* ── Departure stop: [N] time / name — skip if already shown as stay-block departure ── */}
                {!prevHasStay && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <StopCircle number={stopNum} color={color} />
                    <div className="w-px flex-1 min-h-[8px]" style={{ width: '0.5px', background: `${color}30` }} />
                  </div>
                  <div className="pb-1 flex-1 min-w-0 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">{active.departureTime}</div>
                      <div className="text-sm font-medium mt-0.5 truncate dark:text-gray-100">{active.from}</div>
                    </div>
                    <ViewSegmentButton
                      color={color}
                      highlighted={highlightedLeg === i}
                      onEnter={() => onHighlightLeg(i)}
                      onLeave={() => onHighlightLeg(null)}
                    />
                  </div>
                </div>
                )}

                {/* ── Leg content (indented, no circle) ── */}
                <div className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-7 flex-shrink-0" />
                    <div className="w-px flex-1 min-h-[24px]" style={{ width: '0.5px', background: `${color}30` }} />
                  </div>
                  <div className="pb-1 flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="flex items-center gap-2 mt-0.5 flex-1 min-w-0">
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {(() => {
                            const transitSteps = active.steps?.filter(s => s.mode !== 'WALK' && s.line) ?? []
                            const lineLabel = transitSteps.length > 0
                              ? transitSteps.map(s => s.line).join(' + ')
                              : active.line
                            return `${modeLabel(normaliseMode(active.mode, active.line), active.line)} · ${lineLabel} → ${active.to}`
                          })()}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                          style={{ background: `${color}15`, color }}
                        >
                          {formatMinutes(active.durationMinutes)}
                        </span>
                      </div>
                    </div>

                    <OptionPicker
                      leg={leg}
                      selectedIndex={selIdx}
                      color={color}
                      onSelect={(idx) => onSelectOption(i, idx)}
                    />

                    {active.steps && active.steps.length > 0 && (
                      <LegSteps
                        steps={active.steps}
                        legIndex={i}
                        highlightedStep={highlightedStep}
                        onHighlightStep={onHighlightStep}
                      />
                    )}

                    <div className="flex items-center gap-1.5 mt-1.5 mb-2">
                      <div className="h-px flex-1" style={{ background: `${color}20` }} />
                      <span className="text-xs text-gray-400 dark:text-gray-500">{active.arrivalTime}</span>
                    </div>
                  </div>
                </div>

                {/* ── Arrival at mid-stop: [N+1] arrivalTime / name ── */}
                {hasStay && (
                  <>
                    {/* Arrival row */}
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <StopCircle number={stopNum + 1} color={nextColor} />
                        <div className="w-px flex-1 min-h-[8px] bg-gray-200 dark:bg-gray-700" style={{ width: '0.5px' }} />
                      </div>
                      <div className="pb-1 flex-1 min-w-0">
                        <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">{active.arrivalTime}</div>
                        <div className="text-sm font-medium mt-0.5 truncate dark:text-gray-100">{active.to}</div>
                      </div>
                    </div>

                    {/* Stay block */}
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-7 flex-shrink-0" />
                        <div className="w-px flex-1 min-h-[24px] bg-gray-200 dark:bg-gray-700" style={{ width: '0.5px' }} />
                      </div>
                      <div className="flex-1 min-w-0 mb-2">
                        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                          <div className="text-xs text-gray-400 dark:text-gray-500 font-medium"><i className="fa-regular fa-clock mr-1 dark:text-white" />Staying {midStop.stay} min</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            {active.arrivalTime} → {legs[i + 1] ? activeLeg(legs[i + 1], i + 1).departureTime : ''}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Departure row — same stop, same number, but departure time */}
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <StopCircle number={stopNum + 1} color={nextColor} />
                        <div className="w-px flex-1 min-h-[8px]" style={{ width: '0.5px', background: `${nextColor}30` }} />
                      </div>
                      <div className="pb-1 flex-1 min-w-0 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                            {legs[i + 1] ? activeLeg(legs[i + 1], i + 1).departureTime : ''}
                          </div>
                          <div className="text-sm font-medium mt-0.5 truncate dark:text-gray-100">{active.to}</div>
                        </div>
                        {legs[i + 1] && (
                          <ViewSegmentButton
                            color={nextColor}
                            highlighted={highlightedLeg === i + 1}
                            onEnter={() => onHighlightLeg(i + 1)}
                            onLeave={() => onHighlightLeg(null)}
                          />
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {/* ── Final destination ── */}
          <div className="flex gap-3 mt-1">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-bold flex-shrink-0 z-10 text-white"
                style={{ background: '#3B82F6', fontSize: '13px' }}
              >
                {stops.length}
              </div>
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