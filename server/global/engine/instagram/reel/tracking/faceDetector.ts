import path from 'node:path'

/**
 * Детектор лиц YuNet (OpenCV Zoo, face_detection_yunet_2023mar.onnx, лицензия MIT)
 * через onnxruntime-node. Нужен только воркеру (слежение за лицом у нарезок):
 * пакет подключается динамически, поэтому бот на Vercel его не требует.
 *
 * Вход модели фиксированный: 1×3×640×640, BGR, значения 0–255 без нормализации.
 * Кадр вписывается в левый верхний угол квадрата, остальное — нули, поэтому
 * координаты рамок совпадают с пикселями кадра.
 */

export const FACE_INPUT_SIZE = 640

export type FaceBox = {
    x: number
    y: number
    w: number
    h: number
    score: number
}

const STRIDES = [8, 16, 32] as const
const SCORE_THRESHOLD = 0.6
const NMS_IOU = 0.3

/** Путь к модели: REEL_FACE_MODEL_PATH или файл рядом с кодом (в образе — /app/server/...). */
export const faceModelPath = (): string =>
    process.env.REEL_FACE_MODEL_PATH?.trim() ||
    path.join(process.cwd(), 'server', 'global', 'engine', 'instagram', 'reel', 'tracking', 'models', 'face_detection_yunet_2023mar.onnx')

// Минимальные типы onnxruntime-node: пакет стоит только в воркере, а этот файл
// проверяется и типами корневого проекта.
type Session = {
    readonly inputNames: readonly string[]
    run(feeds: Record<string, unknown>): Promise<Record<string, {data: unknown}>>
}
type OrtModule = {
    Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown
    InferenceSession: {
        create(modelPath: string, options?: Record<string, unknown>): Promise<Session>
    }
}

let detectorPromise: Promise<{ort: OrtModule, session: Session}> | undefined

const loadDetector = () => {
    detectorPromise ??= (async () => {
        // Имя в переменной: сборщики (Nitro, esbuild) не пытаются разрешить пакет заранее.
        const packageName = 'onnxruntime-node'
        const imported = await import(packageName)
        const ort = (imported.default ?? imported) as OrtModule
        const session = await ort.InferenceSession.create(faceModelPath(), {
            intraOpNumThreads: 2,
            graphOptimizationLevel: 'all'
        })
        return {ort, session}
    })()

    // Неудачная загрузка не должна залипать: следующий вызов попробует снова.
    detectorPromise.catch(() => {
        detectorPromise = undefined
    })

    return detectorPromise
}

const iou = (a: FaceBox, b: FaceBox) => {
    const x1 = Math.max(a.x, b.x)
    const y1 = Math.max(a.y, b.y)
    const x2 = Math.min(a.x + a.w, b.x + b.w)
    const y2 = Math.min(a.y + a.h, b.y + b.h)
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
    const union = a.w * a.h + b.w * b.h - inter
    return union > 0 ? inter / union : 0
}

const nms = (boxes: FaceBox[]): FaceBox[] => {
    const sorted = [...boxes].sort((a, b) => b.score - a.score)
    const kept: FaceBox[] = []
    for (const box of sorted) {
        if (kept.every(k => iou(k, box) < NMS_IOU)) kept.push(box)
    }
    return kept
}

/**
 * Лица в одном кадре BGR24 размера width×height (width и height не больше 640).
 * Возвращает рамки в пикселях кадра.
 */
export const detectFaces = async (
    frame: Buffer,
    width: number,
    height: number
): Promise<FaceBox[]> => {
    if (width > FACE_INPUT_SIZE || height > FACE_INPUT_SIZE) {
        throw new Error(`[FACE DETECT] Frame ${width}x${height} is larger than ${FACE_INPUT_SIZE}`)
    }

    const {ort, session} = await loadDetector()
    const size = FACE_INPUT_SIZE
    const plane = size * size
    const input = new Float32Array(3 * plane)

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const source = (y * width + x) * 3
            const target = y * size + x
            input[target] = frame[source]!             // B
            input[plane + target] = frame[source + 1]! // G
            input[2 * plane + target] = frame[source + 2]! // R
        }
    }

    const outputs = await session.run({
        [session.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, size, size])
    })

    const boxes: FaceBox[] = []

    for (const stride of STRIDES) {
        const cls = outputs[`cls_${stride}`]!.data as Float32Array
        const obj = outputs[`obj_${stride}`]!.data as Float32Array
        const bbox = outputs[`bbox_${stride}`]!.data as Float32Array
        const cols = size / stride
        const rows = size / stride

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const index = row * cols + col
                const clsScore = Math.min(1, Math.max(0, cls[index]!))
                const objScore = Math.min(1, Math.max(0, obj[index]!))
                const score = Math.sqrt(clsScore * objScore)
                if (score < SCORE_THRESHOLD) continue

                const cx = (col + bbox[index * 4]!) * stride
                const cy = (row + bbox[index * 4 + 1]!) * stride
                const w = Math.exp(bbox[index * 4 + 2]!) * stride
                const h = Math.exp(bbox[index * 4 + 3]!) * stride
                const box = {x: cx - w / 2, y: cy - h / 2, w, h, score}

                // Рамки, целиком лежащие в пустой (дополненной нулями) части входа, отбрасываем.
                if (box.x < width && box.y < height) boxes.push(box)
            }
        }
    }

    return nms(boxes)
}
