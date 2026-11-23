import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildFollowCommands,
    followMargins,
    followSelectFilter,
    followZoom,
    mirrorExtendFilter,
    planFollowWindow,
    type SegmentAnalysis,
} from '../../engine/instagram/reel/tracking/framing'

const picture = {x: 0, y: 0, w: 1920, h: 1080}
const base = {w: 1350, h: 1080}

const analysis = (faces: Array<{x: number, y: number, h: number} | null>, shots?: number[]): SegmentAnalysis => ({
    times: faces.map((_, i) => i / 6),
    shots: shots ?? faces.map(() => 0),
    shotStarts: [0, ...[...new Set(shots ?? [])].slice(1).map(shot => (shots!.indexOf(shot)) / 6)],
    softStarts: [false, ...[...new Set(shots ?? [])].slice(1).map(() => false)],
    faceCenters: faces.map(face => face?.x ?? null),
    faceBoxes: faces,
    logos: faces.map(() => null),
    stats: {frames: faces.length, shots: 1, shotsFromColorOnly: 0, framesWithFaces: 0, framesWithLogo: 0},
})

test('слежение: лицо в центре окна по X и на 45 % высоты по Y, окно меньше картинки в 1,2 раза', () => {
    const plan = planFollowWindow(analysis(Array(12).fill({x: 0.3, y: 0.4, h: 0.3})), picture, base, {zoom: 1.2})
    assert.ok(plan.feasible)
    const box = plan.boxes[0]!
    assert.equal(box.w, 1126)
    assert.equal(box.h, 900)
    assert.ok(Math.abs(box.x + box.w / 2 - 0.3 * 1920) <= 2)
    assert.ok(Math.abs(box.y + box.h * 0.45 - 0.4 * 1080) <= 2)
})

test('слежение: камера идёт за головой (без запаздывания на секунду), дрожь детектора гасится', () => {
    // Голова за секунду уходит вправо на 20 % картинки.
    const faces = Array.from({length: 18}, (_, i) => ({x: 0.4 + Math.min(1, Math.max(0, (i - 6) / 6)) * 0.2, y: 0.45, h: 0.3}))
    const plan = planFollowWindow(analysis(faces), picture, base, {zoom: 1.2})
    assert.ok(plan.feasible)
    const centers = plan.boxes.map(box => (box.x + box.w / 2) / 1920)
    assert.ok(Math.abs(centers[3]! - 0.4) < 0.01)
    assert.ok(Math.abs(centers[9]! - 0.5) < 0.03, String(centers[9]))
    assert.ok(Math.abs(centers[15]! - 0.6) < 0.01)
    // Лицо стоит, детектор дрожит на 1 % — окно не двигается.
    const still = planFollowWindow(analysis(Array.from({length: 12}, (_, i) => ({x: 0.5 + (i % 2) * 0.01, y: 0.4, h: 0.3}))), picture, base)
    assert.ok(still.feasible)
    assert.equal(new Set(still.boxes.map(box => box.x)).size, 1)
})

test('слежение: у края кадра окно выходит за картинку не больше чем на 20 % — там отражение', () => {
    const plan = planFollowWindow(analysis(Array(12).fill({x: 0.02, y: 0.05, h: 0.2})), picture, base, {zoom: 1.2})
    assert.ok(plan.feasible)
    const box = plan.boxes[0]!
    assert.ok(box.x >= -1124 * 0.2 - 2 && box.x < 0)
    assert.ok(box.y >= -900 * 0.2 - 2 && box.y < 0)
    const margin = followMargins(plan.boxes, picture)
    assert.ok(margin.x >= -box.x && margin.y >= -box.y)
})

test('слежение: план без лица — окно шире (титры целиком), отражение сверху и снизу ≤ 30 %', () => {
    const plan = planFollowWindow(analysis(Array(12).fill(null)), picture, base, {zoom: 1.2})
    assert.ok(plan.feasible)
    assert.equal(plan.fitShots, 1)
    const box = plan.boxes[0]!
    assert.ok(box.w > base.w)
    assert.ok((box.h - 1080) / box.h <= 0.3 + 1e-3)
    assert.ok(Math.abs(box.w / box.h - 1.25) < 0.01)
    // С логотипом канала — прежнее окно, логотип не показываем.
    const withLogo = planFollowWindow(analysis(Array(12).fill(null)), picture, base, {minLeft: 300})
    assert.ok(withLogo.feasible)
    assert.equal(withLogo.boxes[0]!.w, base.w)
    assert.ok(withLogo.boxes[0]!.x >= 300)
})

test('слежение: приближение из env в пределах 1–1,6', () => {
    assert.equal(followZoom({} as NodeJS.ProcessEnv), 1.2)
    assert.equal(followZoom({REEL_TRACK_ZOOM: '1.35'} as NodeJS.ProcessEnv), 1.35)
    assert.equal(followZoom({REEL_TRACK_ZOOM: '3'} as NodeJS.ProcessEnv), 1.2)
})

test('отражение: цепочка ffmpeg — поля, зеркало, размытая маска один раз, линейный выход', () => {
    const chain = mirrorExtendFilter({w: 1920, h: 1080}, {x: 224, y: 180}, '30')
    assert.match(chain, /^pad=2368:1440:224:180,fillborders=left=224:right=224:top=180:bottom=180:mode=mirror,/)
    assert.match(chain, /trim=end_frame=1,geq=.*loop=loop=-1:size=1\[mirrorMask\]/)
    assert.ok(chain.endsWith('overlay=shortest=1:format=auto,'))
})

test('слежение: размер окна не меняется на лету — ветка на размер, выбор streamselect', () => {
    // План с лицом (0–1 с), затем план без лица (1–2 с): два размера окна.
    const faces = [...Array(6).fill({x: 0.5, y: 0.4, h: 0.3}), ...Array(6).fill(null)]
    const shots = [...Array(6).fill(0), ...Array(6).fill(1)]
    const frames = analysis(faces, shots)
    const plan = planFollowWindow(frames, picture, base, {zoom: 1.2})
    assert.ok(plan.feasible)
    const margin = followMargins(plan.boxes, picture)
    const canvas = {w: 1920 + 2 * margin.x, h: 1080 + 2 * margin.y}
    const commands = buildFollowCommands(frames, plan.boxes, margin, canvas, 24, 2)
    assert.equal(commands.sizes.length, 2)
    assert.equal(commands.first.size, 0)
    assert.ok(commands.lines.every(line => !/ (w|h) /.test(line)), 'команд w/h быть не должно')
    const switchLine = commands.lines.find(line => line.includes('streamselect@pick map 1'))
    assert.ok(switchLine)
    assert.ok(Math.abs(Number(switchLine!.split(' ')[0]) - 1) < 0.01, switchLine)
    // Окно ветки не выходит за расширенную картинку.
    for (const line of commands.lines) for (const [, index, key, value] of line.matchAll(/crop@track(\d) (x|y) (-?\d+)/g)) {
        const size = commands.sizes[Number(index)]!
        assert.ok(Number(value) >= 0 && Number(value) <= (key === 'x' ? canvas.w - size.w : canvas.h - size.h), line)
    }
    const graph = followSelectFilter(commands, 'scale=1080:864')
    assert.match(graph, /^split=2\[followIn0\]\[followIn1\];\[followIn0\]crop@track0=1126:900:/)
    assert.ok(graph.endsWith('[followOut0][followOut1]streamselect@pick=inputs=2:map=0'))
    // Один размер — без split.
    const still = analysis(Array(12).fill({x: 0.5, y: 0.4, h: 0.3}))
    const stillPlan = planFollowWindow(still, picture, base)
    assert.ok(stillPlan.feasible)
    const single = buildFollowCommands(still, stillPlan.boxes, {x: 0, y: 0}, picture, 24, 2)
    assert.match(followSelectFilter(single, 'scale=1080:864'), /^crop@track0=\d+:\d+:\d+:\d+,scale=1080:864$/)
})
