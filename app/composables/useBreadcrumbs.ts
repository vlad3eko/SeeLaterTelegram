/*
 * Хлебные крошки — история переходов по сайту, а не иерархия разделов:
 * каждая открытая страница добавляет крошку в конец («Главная › Фильм › Актёр › Главная › …»).
 * Не больше MAX_CRUMBS: новая крошка выталкивает самую первую. Повторное открытие той же
 * страницы подряд (обновление, переход на себя) крошку не добавляет.
 *
 * Возврат — как курсор в истории, без новой крошки: клик по крошке обрезает цепочку до неё
 * (jumpTo), кнопка «Назад» браузера убирает последнюю крошку (visit с back).
 * На телефоне показываются последние MOBILE_CRUMBS — остальные хранятся и видны после возврата.
 * Хранится в sessionStorage — переживает обновление страницы, на новой вкладке начинается заново.
 */

export type Crumb = { path: string, label: string }

export const MAX_CRUMBS = 5
export const MOBILE_CRUMBS = 3
const STORAGE_KEY = 'kinomanov-breadcrumbs'

/** Название по адресу — пока страница не сообщила своё (название фильма, имя актёра). */
const fallbackLabel = (path: string) => {
    const clean = path.split(/[?#]/)[0] || '/'
    if (clean === '/') return 'Главная'
    if (clean.startsWith('/bookmarks')) return 'Сохранённые'
    if (clean.startsWith('/privacy')) return 'Политика конфиденциальности'
    if (clean.startsWith('/login')) return 'Вход'
    if (clean.startsWith('/person/')) return 'Персона'
    if (clean.startsWith('/tv/')) return 'Сериал'
    if (clean.startsWith('/movie/')) return 'Фильм'
    return 'Страница'
}

export const useBreadcrumbs = () => {
    const crumbs = useState<Crumb[]>('breadcrumbs', () => [])
    // Названия, которые страницы сообщили раньше, чем их крошка появилась в списке.
    const labels = useState<Record<string, string>>('breadcrumb-labels', () => ({}))

    const save = () => {
        if (!import.meta.client) return
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(crumbs.value))
        } catch {
            // приватный режим / переполнение — крошки просто не переживут обновление
        }
    }

    const restore = () => {
        if (!import.meta.client) return
        try {
            const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
            if (Array.isArray(saved)) {
                crumbs.value = saved
                    .filter(crumb => typeof crumb?.path === 'string' && typeof crumb?.label === 'string')
                    .slice(-MAX_CRUMBS)
            }
        } catch {
            crumbs.value = []
        }
    }

    const visit = (path: string, back = false) => {
        const list = crumbs.value
        if (list[list.length - 1]?.path === path) return
        // «Назад» браузера на предыдущую крошку — убираем текущую, а не добавляем новую.
        if (back && list[list.length - 2]?.path === path) {
            crumbs.value = list.slice(0, -1)
            save()
            return
        }
        crumbs.value = [...list, {path, label: labels.value[path] || fallbackLabel(path)}].slice(-MAX_CRUMBS)
        save()
    }

    /**
     * Клик по крошке: цепочка обрезается до неё ДО перехода — тогда visit видит её последней
     * и новую не добавляет. Возвращает откат на случай, если переход не состоялся.
     */
    const jumpTo = (index: number) => {
        const before = crumbs.value
        if (index < 0 || index >= before.length - 1) return () => {}
        crumbs.value = before.slice(0, index + 1)
        save()
        return () => {
            crumbs.value = before
            save()
        }
    }

    /** Страница сообщает своё название: обновляет её крошку (последнюю с этим адресом). */
    const setLabel = (path: string, label: string) => {
        if (!label) return
        labels.value[path] = label
        const list = crumbs.value
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i]!.path !== path) continue
            if (list[i]!.label !== label) {
                crumbs.value = list.map((crumb, index) => index === i ? {...crumb, label} : crumb)
                save()
            }
            return
        }
    }

    return {crumbs, restore, visit, jumpTo, setLabel}
}

/** Название текущей страницы для её крошки (вызывается на странице). */
export const useCrumbLabel = (label: () => string | undefined | null) => {
    const route = useRoute()
    const {setLabel} = useBreadcrumbs()
    if (!import.meta.client) return
    watch([() => route.fullPath.split('#')[0] || '/', label], ([path, value]) => {
        if (value) setLabel(path, value)
    }, {immediate: true})
}
