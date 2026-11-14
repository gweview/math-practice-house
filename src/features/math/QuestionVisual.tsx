import { useId } from 'react';
import type { QuestionContent } from '../../core/types';
import { CUBE_NET_PATTERNS } from '../../domain/geometry/cube-net';

// Math.PI below is used only to convert SVG clock/geometry angles to radians;
// worksheet answers and geometry solvers use the explicit curriculum constant.

function NumberLineVisual({ content, answer }: { content: Extract<QuestionContent, { kind: 'numberLine' }>; answer?: number | string }) {
  const left = 34;
  const width = 452;
  const pointX = (index: number) => left + index * width / Math.max(1, content.values.length - 1);
  return <svg className="question-visual number-line-visual" viewBox="0 0 520 86" role="img" aria-label={`从 ${content.start} 到 ${content.end} 的数轴`}>
    <line x1="22" y1="38" x2="500" y2="38" />
    <path d="M500 38l-10-6v12z" />
    {content.values.map((value, index) => <g key={`${value}-${index}`}>
      <line x1={pointX(index)} y1="28" x2={pointX(index)} y2="49" />
      {index === content.blankIndex
        ? <g><rect x={pointX(index) - 20} y="55" width="40" height="23" rx="4" /><text x={pointX(index)} y="72">{answer ?? '?'}</text></g>
        : <text x={pointX(index)} y="72">{value}</text>}
    </g>)}
  </svg>;
}

function ClockVisual({ content }: { content: Extract<QuestionContent, { kind: 'clock' }> }) {
  const center = 80;
  const minuteAngle = content.minute * 6 * Math.PI / 180;
  const hourAngle = (content.hour % 12 * 30 + content.minute / 2) * Math.PI / 180;
  const end = (angle: number, length: number) => ({ x: center + Math.sin(angle) * length, y: center - Math.cos(angle) * length });
  const minute = end(minuteAngle, 53);
  const hour = end(hourAngle, 37);
  return <svg className="question-visual clock-visual" viewBox="0 0 160 160" role="img" aria-label="模拟钟面">
    <circle cx={center} cy={center} r="69" />
    {Array.from({ length: 12 }, (_, index) => {
      const angle = index * 30 * Math.PI / 180;
      const outer = end(angle, 63);
      const inner = end(angle, index % 3 === 0 ? 53 : 57);
      return <line key={index} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
    })}
    {[12, 3, 6, 9].map((value, index) => <text key={value} x={[80, 133, 80, 27][index]} y={[28, 85, 142, 85][index]}>{value}</text>)}
    <line className="clock-hour" x1={center} y1={center} x2={hour.x} y2={hour.y} />
    <line className="clock-minute" x1={center} y1={center} x2={minute.x} y2={minute.y} />
    <circle className="clock-pin" cx={center} cy={center} r="4" />
  </svg>;
}

function FractionVisual({ content }: { content: Extract<QuestionContent, { kind: 'fractionVisual' }> }) {
  const width = 240 / content.denominator;
  return <svg className="question-visual fraction-visual" viewBox="0 0 280 82" role="img" aria-label={`等分为${content.denominator}份的分数图`}>{Array.from({ length: content.denominator }, (_, index) => <rect key={index} x={20 + index * width} y="20" width={width} height="40" className={index < content.shaded ? 'shaded' : ''} />)}</svg>;
}

function PictographVisual({ content }: { content: Extract<QuestionContent, { kind: 'pictograph' }> }) {
  return <svg className="question-visual pictograph-visual" viewBox="0 0 520 160" role="img" aria-label="物品图形统计">{content.labels.map((label, row) => <g key={label}><text textAnchor="start" x="8" y={34 + row * 48}>{label}</text>{Array.from({ length: content.counts[row] }, (_, index) => <text key={index} x={70 + ((index * 37 + row * 19) % 420)} y={25 + row * 48 + ((index * 23) % 28)}>{content.symbols?.[row] ?? content.symbol}</text>)}</g>)}{content.options && <text textAnchor="start" x="8" y="145">可选：{content.options.join('、')}</text>}</svg>;
}

function MultiPartVisual({ content, answer }: { content: Extract<QuestionContent, { kind: 'multiPart' }>; answer?: number | string }) {
  return <ol className="question-multipart">{content.parts.map((part, index) => <li key={index}>{part.prompt} {answer !== undefined ? part.answer : '□'}</li>)}</ol>;
}

function GeometryVisual({ content, answer }: { content: Extract<QuestionContent, { kind: 'geometry' }>; answer?: number | string }) {
  const labels = content.labels ?? [];
  const variant = content.dimensions?.[0] ?? 0;
  if (content.shape === 'line') return <svg className="question-visual geometry-visual" viewBox="0 0 360 120" role="img" aria-label="线段射线直线示意图">
    {labels.includes('起点') ? <><path d="M55 100V35H260" /><path d="M250 28l12 7-12 7M48 45l7-12 7 12" /><text x="62" y="112">起点</text><text x="265" y="40">东</text><text x="60" y="28">北</text></> : (() => { const type = content.dimensions?.[0] ?? 0; const end = Math.min(300, 150 + (content.dimensions?.[1] ?? 10) * 8); return type === 0 ? <><line x1="40" y1="55" x2={end} y2="55" /><circle cx="40" cy="55" r="5" fill="white" /><circle cx={end} cy="55" r="5" fill="white" /></> : type === 1 ? <><line x1="40" y1="55" x2={end} y2="55" /><circle cx="40" cy="55" r="5" fill="white" /><path d={`M${end} 48l12 7-12 7`} /></> : <><line x1="40" y1="55" x2={end} y2="55" /><path d="M40 48l-12 7 12 7" /><path d={`M${end} 48l12 7-12 7`} /></>; })()}
    {labels.map((label, index) => <text key={`${label}-${index}`} x={50 + index * 70} y="92">{label}</text>)}
  </svg>;
  if (content.shape === 'symmetry') {
    const name = labels[0] ?? '';
    const shape = name.includes('正方形') ? <rect x="90" y="20" width="90" height="90" />
      : name.includes('长方形') ? <rect x="72" y="30" width="136" height="70" />
      : name.includes('等边') ? <path d="M140 15L82 115h116z" />
      : <path d="M72 108L128 22 202 96z" />;
    const axes = answer !== undefined ? Number(answer) : 0;
    const axisLines = name.includes('正方形') ? [[140, 10, 140, 120], [82, 65, 198, 65], [90, 15, 190, 115], [190, 15, 90, 115]]
      : name.includes('长方形') ? [[140, 18, 140, 112], [65, 65, 215, 65]]
      : name.includes('等边') ? [[140, 10, 140, 120], [82, 115, 182, 65], [198, 115, 98, 65]] : [];
    return <svg className="question-visual geometry-visual" viewBox="0 0 300 130" role="img" aria-label="对称图形示意图">{shape}{axisLines.slice(0, axes).map((line, i) => <line key={i} className="guide" x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} />)}</svg>;
  }
  if (content.shape === 'quadrilateral') { const subtype = content.dimensions?.[0] ?? 3; const path = subtype === 2 ? 'M55 100L85 25h135l-30 75z' : 'M55 100L85 25h135l30 75z'; return <svg className="question-visual geometry-visual" viewBox="0 0 300 130" role="img" aria-label="四边形示意图"><path d={path} /></svg>; }
  if (content.shape === 'net') {
    const unit = Math.min(30, 12 + (content.dimensions?.[1] ?? 2) * 2); const x = 35; const y = 8;
    const pattern = content.netPattern ?? 'cross';
    const cells = CUBE_NET_PATTERNS[pattern as keyof typeof CUBE_NET_PATTERNS] ?? CUBE_NET_PATTERNS.cross;
    const minX = Math.min(...cells.map(([cx]) => cx)); const minY = Math.min(...cells.map(([, cy]) => cy));
    return <svg className="question-visual geometry-visual" viewBox="0 0 300 150" role="img" aria-label="正方体展开图"><g>{cells.map(([cx, cy], index) => <rect key={index} x={x + (cx - minX) * unit} y={y + (cy - minY) * unit} width={unit} height={unit} />)}</g></svg>;
  }
  if (content.shape === 'grid') { const rows = content.dimensions?.[0] ?? 2; const columns = content.dimensions?.[1] ?? rows; const unit = Math.min(22, 100 / Math.max(rows, columns)); return <svg className="question-visual geometry-visual" viewBox="0 0 320 140" role="img" aria-label="网格数图形示意图"><g transform="translate(50 15)">{Array.from({ length: columns + 1 }, (_, i) => <line key={`v${i}`} className="guide" x1={i * unit} y1="0" x2={i * unit} y2={rows * unit} />)}{Array.from({ length: rows + 1 }, (_, i) => <line key={`h${i}`} className="guide" x1="0" y1={i * unit} x2={columns * unit} y2={i * unit} />)}</g><text x="180" y="75">网格</text></svg>; }
  if (content.shape === 'composite') {
    const dimensions = content.dimensions ?? [];
    if (dimensions.length >= 3 && (dimensions[1] === 0 || dimensions[1] === 1)) return <svg className="question-visual geometry-visual" viewBox="0 0 360 140" role="img" aria-label="图形运动前后示意图"><path d="M35 95V55h25v15h20v25z" /><path d="M90 74h55" /><path d="M135 67l12 7-12 7" /><g transform={`translate(${dimensions[1] === 0 ? Math.min(180, dimensions[0] * 8) : 0} 0) rotate(${dimensions[1] === 1 ? dimensions[0] : 0} 240 74)`}><path d="M200 95V55h25v15h20v25z" /></g><text x="30" y="120">前</text><text x="230" y="120">后</text></svg>;
    if (dimensions.length >= 4) { const [length, width, cutLength, cutWidth] = dimensions; const sx = 180 / length; const sy = 90 / width; const x0 = 30; const y0 = 15; const x1 = x0 + length * sx; const y1 = y0 + width * sy; const cutX = x1 - cutLength * sx; const cutY = y0 + cutWidth * sy; return <svg className="question-visual geometry-visual" viewBox="0 0 320 140" role="img" aria-label="组合图形缺口示意图"><path d={`M${x0} ${y0}H${cutX}V${cutY}H${x1}V${y1}H${x0}Z`} fill="none" /><text x="35" y="130">长 {length}</text><text x="210" y="130">宽 {width}</text><text x="180" y="35">缺口 {cutLength}×{cutWidth}</text></svg>; }
    return <svg className="question-visual geometry-visual" viewBox="0 0 320 140" role="img" aria-label="组合图形示意图"><path d="M40 20h180v40h60v60H40z" /></svg>;
  }
  if (content.shape === 'cylinder') return <svg className="question-visual geometry-visual" viewBox="0 0 300 140" role="img" aria-label="立体图形示意图"><ellipse cx="105" cy="25" rx="55" ry="15" /><path d="M50 25v80M160 25v80" /><ellipse cx="105" cy="105" rx="55" ry="15" /><text x="185" y="70">r={content.dimensions?.[0] ?? ''}, h={content.dimensions?.[1] ?? ''}</text></svg>;
  if (content.shape === 'sector') { const angle = content.dimensions?.[1] ?? 90; const cx = 90; const cy = 75; const radius = 55; const end = -Math.PI / 2 + angle * Math.PI / 180; const x = cx + radius * Math.cos(end); const y = cy + radius * Math.sin(end); const large = angle > 180 ? 1 : 0; return <svg className="question-visual geometry-visual" viewBox="0 0 300 140" role="img" aria-label="扇形示意图"><path d={`M${cx} ${cy}L${cx} ${cy - radius}A${radius} ${radius} 0 ${large} 1 ${x} ${y}Z`} /><text x="170" y="72">圆心角</text></svg>; }
  if (content.shape === 'cube') return <svg className="question-visual geometry-visual" viewBox="0 0 300 140" role="img" aria-label="立体图形示意图"><path d="M72 48l38-25h92l38 25v68l-38 20h-92l-38-20zM72 48h92l38-25M164 48v88M202 23v68l-38 25" /></svg>;
  if (content.shape === 'circle') return <svg className="question-visual geometry-visual" viewBox="0 0 280 130" role="img" aria-label="几何图形示意图">
    <circle cx="120" cy="64" r={40 + variant % 18} /><line x1="120" y1="64" x2={160 + variant % 18} y2="64" /><circle cx="120" cy="64" r="2.5" />
    <text x="137" y="57">{labels[0] ?? 'r'}</text>
  </svg>;
  if (content.shape === 'cuboid') return <svg className="question-visual geometry-visual" viewBox="0 0 300 140" role="img" aria-label="立体图形示意图">
    <path d="M54 45h150v70H54zM54 45l34-25h150l-34 25M204 45l34-25v70l-34 25M54 115l34-25h150" />
    <text x="117" y="133">{labels[0] ?? '长'}</text><text x="220" y="116">{labels[1] ?? '宽'}</text><text x="38" y="83">{labels[2] ?? '高'}</text>
  </svg>;
  if (content.shape === 'angle') {
    const angle = content.angle ?? 60;
    const radians = -angle * Math.PI / 180;
    const x = 80 + Math.cos(radians) * 80;
    const y = 105 + Math.sin(radians) * 80;
    return <svg className="question-visual geometry-visual" viewBox="0 0 260 130" role="img" aria-label="角的示意图">
      <line x1="80" y1="105" x2="205" y2="105" /><line x1="80" y1="105" x2={x} y2={y} />
      <path d={`M110 105 A30 30 0 0 0 ${80 + Math.cos(radians) * 30} ${105 + Math.sin(radians) * 30}`} />
    </svg>;
  }
  if (content.shape === 'triangle' || content.shape === 'trapezoid') { const subtype = content.dimensions?.[0]; const trianglePath = subtype === 1 ? 'M55 105L55 25h150z' : subtype === 0 ? 'M75 105L145 18l70 87z' : 'M45 110L145 20l105 90z'; return <svg className="question-visual geometry-visual" viewBox="0 0 300 130" role="img" aria-label="多边形示意图">
    <g transform={`rotate(${variant % 12 - 6} 145 70)`}><path d={content.shape === 'trapezoid' ? 'M45 110L85 25h115l50 85z' : trianglePath} /><line className="guide" x1="145" y1={content.shape === 'trapezoid' ? 25 : 20} x2="145" y2="110" /></g>
    {labels.map((label, index) => <text key={label} x={[120, 175, 151][index] ?? 120} y={[127, 127, 70][index] ?? 70}>{label}</text>)}
  </svg>; }
  const square = content.shape === 'square';
  const squareSize = square ? 70 + variant % 30 : 0;
  return <svg className="question-visual geometry-visual" viewBox="0 0 300 130" role="img" aria-label="平面图形示意图">
    <rect x={square ? 145 - squareSize / 2 : 48} y={square ? 65 - squareSize / 2 : 20} width={square ? squareSize : 120 + variant % 80} height={square ? squareSize : 60 + variant % 50} />
    <text x="135" y="127">{labels[0] ?? ''}</text><text x={square ? 199 : 246} y="70">{labels[1] ?? ''}</text>
  </svg>;
}

function TableVisual({ content, answer }: { content: Extract<QuestionContent, { kind: 'table' }>; answer?: number | string }) {
  return <div className="question-table-wrap"><table className="question-table">
    <thead><tr>{content.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
    <tbody>{content.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}>{cell === '□' && answer !== undefined ? answer : cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

function ChartVisual({ content }: { content: Extract<QuestionContent, { kind: 'chart' }> }) {
  const instanceId = useId().replace(/:/g, '');
  if (content.chartType === 'pie') {
    const total = content.values.reduce((sum, value) => sum + value, 0) || 1;
    let angle = -Math.PI / 2;
    const center = 85; const radius = 58;
    const point = (a: number) => [center + radius * Math.cos(a), center + radius * Math.sin(a)];
    const prefix = `pie-${instanceId}-${content.values.join('-')}`;
    return <svg className="question-visual chart-visual" viewBox="0 0 520 160" role="img" aria-label="扇形统计图">
      <defs>{content.values.map((_, index) => <pattern key={index} id={`${prefix}-${index}`} width="8" height="8" patternUnits="userSpaceOnUse"><path d={['M0 0L8 8M-2 6L2 10M6-2L10 2','M-2 2L2-2M0 8L8 0M6 10L10 6','M4 0v8M0 4h8','M0 0h8v8h-8z'][index % 4]} /></pattern>)}</defs>
      <circle cx={center} cy={center} r={radius} />
      {content.values.map((value, index) => { const next = angle + value / total * Math.PI * 2; const [x1, y1] = point(angle); const [x2, y2] = point(next); const large = next - angle > Math.PI ? 1 : 0; const d = `M${center} ${center}L${x1} ${y1}A${radius} ${radius} 0 ${large} 1 ${x2} ${y2}Z`; angle = next; return <path key={content.labels[index]} d={d} fill={`url(#${prefix}-${index})`} />; })}
      {content.labels.map((label, index) => <g key={label}><rect x="180" y={18 + index * 30} width="18" height="18" fill={`url(#${prefix}-${index})`} /><text textAnchor="start" x="207" y={32 + index * 30}>{label}</text></g>)}
    </svg>;
  }
  const series = content.series && content.series.length > 0 ? content.series : [{ label: '', values: content.values }];
  const seriesPrefix = `series-${instanceId}-${content.values.join('-')}-${series.map(item => item.values.join('-')).join('_')}`;
  const max = Math.max(...series.flatMap(item => item.values), 1);
  const baseline = 105;
  const chartHeight = 78;
  const x = (index: number) => 54 + index * (410 / Math.max(1, content.values.length - 1));
  const y = (value: number) => baseline - value / max * chartHeight;
  const points = content.values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  return <svg className="question-visual chart-visual" viewBox="0 0 520 140" role="img" aria-label={`${content.chartType === 'bar' ? '条形' : '折线'}统计图`}>
    <defs><pattern id={`${seriesPrefix}-a`} width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0L8 8" /></pattern><pattern id={`${seriesPrefix}-b`} width="8" height="8" patternUnits="userSpaceOnUse"><path d="M4 0v8" /></pattern></defs><line x1="35" y1="15" x2="35" y2={baseline} /><line x1="35" y1={baseline} x2="500" y2={baseline} />
    {content.chartType === 'bar'
      ? series.map((item, seriesIndex) => item.values.map((value, index) => <g key={`${item.label}-${content.labels[index]}`}><rect fill={`url(#${seriesPrefix}-${seriesIndex % 2 ? 'b' : 'a'})`} x={x(index) - 20 + seriesIndex * (series.length > 1 ? 22 : 0)} y={y(value)} width={series.length > 1 ? 18 : 36} height={baseline - y(value)} /><text x={x(index) - 11 + seriesIndex * (series.length > 1 ? 22 : 0)} y={y(value) - 5}>{value}</text></g>))
      : <><polyline points={points} />{content.values.map((value, index) => <g key={content.labels[index]}><circle cx={x(index)} cy={y(value)} r="4" /><text x={x(index)} y={y(value) - 7}>{value}</text></g>)}</>}
    {content.labels.map((label, index) => <text key={label} x={x(index)} y="126">{label}</text>)}
    {series.length > 1 && series.map((item, index) => <g key={item.label}><rect fill={`url(#${seriesPrefix}-${index % 2 ? 'b' : 'a'})`} x={385} y={7 + index * 18} width="12" height="12" /><text textAnchor="start" x={402} y={18 + index * 18}>{item.label}</text></g>)}
    {content.unit && <text className="chart-unit" x="12" y="14">{content.unit}</text>}
  </svg>;
}

export default function QuestionVisual({ content, answer }: { content: QuestionContent; answer?: number | string }) {
  switch (content.kind) {
    case 'numberLine': return <NumberLineVisual content={content} answer={answer} />;
    case 'clock': return <ClockVisual content={content} />;
    case 'fractionVisual': return <FractionVisual content={content} />;
    case 'multiPart': return <MultiPartVisual content={content} answer={answer} />;
    case 'pictograph': return <PictographVisual content={content} />;
    case 'geometry': return <GeometryVisual content={content} answer={answer} />;
    case 'table': return <TableVisual content={content} answer={answer} />;
    case 'chart': return <ChartVisual content={content} />;
  }
}
