/**
 * «Вид» финального ролика (решение владельца 20.11.2026, образец — нарезка «На цепи»): эффект
 * ИИ-улучшения качества и плёнки поверх clean, до субтитров и хука (буквы остаются чистыми).
 *
 * Параметры подобраны по замерам образца на настоящем clean:
 *   hqdn3d      шумодав до резкости: кожа гладкая, резкость не вытаскивает блоки сжатия YouTube
 *   unsharp ×2  «увеличенная детализация»: чёткие пряди и края с лёгким ореолом
 *   curves      подъём теней и средних тонов (в образце тёмные сцены светлее: яркость 70–86 из 255)
 *               и тил-оранж кривыми каналов: холодные тени, тёплые света
 *   eq          насыщенность
 *   vignette    лёгкая, у образца края темнее центра примерно на 10%
 *   зерно       монохромное, мелкое, меняется каждый кадр; рождается в 2/3 размера кадра и
 *               растягивается — так размер зерна совпадает с образцом. Режим overlay: сильнее в
 *               средних тонах, слабее на светлой коже и в глубоких тенях (в образце зерно на фоне).
 *
 * Финал рендерится однопоточно (-filter_threads 1), поэтому только быстрые фильтры: cas,
 * colorbalance и смешивание по формуле (blend c0_expr) были в 10–150 раз медленнее, 40-секундный
 * ролик собирался 219 с против 12 с без эффектов. Сейчас эффекты добавляют ~0,6 с на секунду ролика.
 *
 * Настройки (переменные окружения, все необязательные):
 *   REEL_LOOK        off — без эффектов
 *   REEL_LOOK_GRAIN  сила зерна 0–30, по умолчанию 7 (0 — без зерна)
 */

const isOff = (value: string | undefined) =>
    ['off', '0', 'false', 'no'].includes((value ?? '').trim().toLowerCase())

export const DEFAULT_GRAIN = 7

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)

/**
 * Части filter_complex: из [input] получается [output]. Пустой массив — эффект выключен
 * (вызывающий оставляет прежнюю метку).
 */
export const buildLookFilters = (
    {input, output, width, height, frameRate}: {input: string, output: string, width: number, height: number, frameRate: string},
    env: NodeJS.ProcessEnv = process.env
): string[] => {
    if (isOff(env.REEL_LOOK)) return []

    const rawGrain = Number(env.REEL_LOOK_GRAIN)
    const grain = env.REEL_LOOK_GRAIN?.trim() && Number.isFinite(rawGrain) && rawGrain >= 0 && rawGrain <= 30
        ? rawGrain
        : DEFAULT_GRAIN

    const look =
        'hqdn3d=5:3:6:6,' +
        'unsharp=7:7:1.1:5:5:0,' +
        'unsharp=3:3:0.6:3:3:0,' +
        "curves=master='0/0 0.05/0.08 0.18/0.29 0.45/0.6 0.75/0.86 1/1'" +
        ":r='0/0 0.25/0.235 0.75/0.775 1/1':g='0/0 0.5/0.49 1/1':b='0/0 0.25/0.275 0.75/0.725 1/1'," +
        'eq=saturation=1.2,' +
        'vignette=angle=PI/10'

    if (!grain) return [`[${input}]${look}[${output}]`]

    return [
        `[${input}]${look}[${output}Base]`,
        // Серый слой 128 + шум: в режиме overlay серый 128 кадр не меняет.
        `color=c=black:s=${even(width * 2 / 3)}x${even(height * 2 / 3)}:r=${frameRate},` +
        `lutyuv=y=128:u=128:v=128,noise=c0s=${grain}:c0f=t,scale=${width}:${height}:flags=bicubic[${output}Grain]`,
        // Зерно только в яркость; цвет кадра не трогается.
        `[${output}Base][${output}Grain]blend=c0_mode=overlay:c1_mode=normal:c2_mode=normal:shortest=1` +
        `[${output}]`
    ]
}
