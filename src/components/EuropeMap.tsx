import { useI18n } from '../i18n'

// Schematic only: approximate positions, no claim that members live in these cities.
const CITIES: [string, number, number][] = [
  ['Lisboa', 40, 325], ['Madrid', 98, 302], ['Paris', 173, 184], ['Amsterdam', 205, 136], ['Berlin', 310, 135], ['Praha', 322, 168],
  ['Wien', 347, 194], ['Roma', 299, 281], ['Budapest', 372, 203], ['Stockholm', 367, 41], ['Tallinn', 450, 40], ['Riga', 443, 74], ['Vilnius', 458, 105],
]
const HUB = { x: 405, y: 139 } // Warsaw — default meeting time zone

export function EuropeMap() {
  const { t } = useI18n()
  return (
    <figure style={{ margin: 0 }}>
      <svg className="europe" viewBox="0 0 600 380" role="img" aria-label={t('lang_map_note')}>
        {[150, 100, 52].map((r, i) => <ellipse key={r} cx={HUB.x - 40} cy={HUB.y + 70} rx={r * 2.1} ry={r * 1.5} fill="none" stroke="#d6cdbc" strokeWidth={i === 0 ? 1 : 0.8} />)}
        {CITIES.map(([n, x, y]) => <path key={n} className="link" d={`M${x},${y} Q${(x + HUB.x) / 2},${Math.min(y, HUB.y) - 40} ${HUB.x},${HUB.y}`} />)}
        {CITIES.map(([n, x, y]) => (
          <g key={n}>
            <circle className="city" cx={x} cy={y} r={5} />
            <text x={x + 9} y={y + 4}>{n}</text>
          </g>
        ))}
        <ellipse className="center" cx={HUB.x} cy={HUB.y} rx={11} ry={8} />
        <text x={HUB.x + 15} y={HUB.y + 4} style={{ fontWeight: 800 }}>Warszawa</text>
      </svg>
      <figcaption className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t('lang_map_note')}</figcaption>
    </figure>
  )
}
