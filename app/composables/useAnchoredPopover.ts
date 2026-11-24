import type {InjectionKey, Ref} from "vue";

/** Связь вложенной панели с родительской (панель тайтла внутри панели человека). */
type PopoverParent = { level: number, hold: () => void, release: () => void }
const POPOVER_PARENT: InjectionKey<PopoverParent> = Symbol('anchored-popover-parent')

/*
 * Всплывающая панель у карточки (краткая информация о тайтле или человеке).
 * Мышь: открывается наведением (с задержкой openDelay), закрывается уходом курсора с карточки
 * и панели. Касание/клавиатура: открывается и закрывается нажатием, касанием мимо, прокруткой, Esc.
 * Одновременно открыта одна панель на каждом уровне. Панель рисуется через Teleport в body
 * с position: fixed — полки (overflow-hidden) её не обрезают.
 *
 * Вложенность: панель, созданная внутри другой панели (название в «Лучших работах» человека),
 * получает уровень +1 — открывается поверх родительской, не закрывая её; пока курсор над
 * вложенной панелью, родительская не закрывается; касание внутри вложенной не закрывает родительскую.
 */
export const useAnchoredPopover = (options: {
    /** Элемент, рядом с которым ставится панель (карточка). */
    anchor: () => HTMLElement | null | undefined
    /** Элементы, касание которых не закрывает панель (кнопка-триггер). */
    triggers?: Ref<HTMLElement | null>[]
    width?: number
    openDelay?: number
    onOpen?: () => void
}) => {
    const GAP = 8
    const width = options.width ?? 288

    const parent = inject(POPOVER_PARENT, null)
    const level = parent ? parent.level + 1 : 0

    const openId = useState<string | null>(`anchored-popover-open-${level}`, () => null)
    const instanceId = useId()
    const visible = computed(() => openId.value === instanceId)

    const panelRef = ref<HTMLElement | null>(null)
    const position = ref({top: 0, left: 0})
    const panelStyle = computed(() => ({
        top: `${position.value.top}px`,
        left: `${position.value.left}px`,
        width: `${Math.min(width, import.meta.client ? window.innerWidth - GAP * 2 : width)}px`,
        zIndex: 100 + level,
    }))

    // Как открыта: мышью (закрывается уходом курсора) или касанием/клавиатурой (закрывается нажатием).
    let openedBy: 'mouse' | 'tap' = 'tap'
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    let openTimer: ReturnType<typeof setTimeout> | undefined

    const clearTimers = () => {
        if (closeTimer) clearTimeout(closeTimer)
        if (openTimer) clearTimeout(openTimer)
        closeTimer = openTimer = undefined
    }

    /** Справа от карточки, если не помещается — слева, на узком экране — под верхом карточки по центру. */
    const place = () => {
        const card = options.anchor()
        if (!card) return
        const rect = card.getBoundingClientRect()
        const panelWidth = Math.min(width, window.innerWidth - GAP * 2)

        let left: number
        let top = rect.top
        if (rect.right + GAP + panelWidth <= window.innerWidth) left = rect.right + GAP
        else if (rect.left - GAP - panelWidth >= 0) left = rect.left - GAP - panelWidth
        else {
            left = Math.max(GAP, Math.min(window.innerWidth - panelWidth - GAP, rect.left + rect.width / 2 - panelWidth / 2))
            top = rect.top + 32
        }
        position.value = {top: Math.max(GAP, top), left}
    }

    const open = (by: 'mouse' | 'tap') => {
        clearTimers()
        openedBy = by
        place()
        openId.value = instanceId
        options.onOpen?.()
    }

    const close = () => {
        clearTimers()
        if (visible.value) openId.value = null
    }

    /** Не закрываться: курсор над вложенной панелью (вызывает дочерняя панель). */
    const hold = () => {
        if (closeTimer) clearTimeout(closeTimer)
        closeTimer = undefined
        parent?.hold()
    }
    /** Курсор ушёл с вложенной панели: закрыться, если он не вернулся сюда. */
    const release = () => {
        // Курсор всё ещё над этой панелью (ушёл с названия внутри неё) — закрываться не нужно.
        if (panelRef.value?.matches(':hover')) return
        if (visible.value && openedBy === 'mouse') {
            if (closeTimer) clearTimeout(closeTimer)
            closeTimer = setTimeout(close, 150)
        }
        parent?.release()
    }
    provide(POPOVER_PARENT, {level, hold, release})

    /** Наведение мышью (на касаниях браузер тоже шлёт pointerenter — их пропускаем). */
    const onPointerEnter = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return
        parent?.hold()
        if (closeTimer) clearTimeout(closeTimer)
        closeTimer = undefined
        if (visible.value) return
        if (openTimer) clearTimeout(openTimer)
        openTimer = setTimeout(() => open('mouse'), options.openDelay ?? 0)
    }

    // Небольшая задержка: курсор успевает перейти с карточки на панель.
    const onPointerLeave = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return
        if (openTimer) clearTimeout(openTimer)
        openTimer = undefined
        parent?.release()
        if (!visible.value || openedBy !== 'mouse') return
        if (closeTimer) clearTimeout(closeTimer)
        closeTimer = setTimeout(close, 150)
    }

    /** Нажатие на кнопку-триггер: переключает панель (открытую наведением мыши не закрывает — иначе мигнёт). */
    const toggle = () => {
        if (visible.value && openedBy === 'mouse') return
        if (visible.value) close()
        else open('tap')
    }

    const onDocumentPointerDown = (event: PointerEvent) => {
        const target = event.target as Node
        if (panelRef.value?.contains(target)) return
        // Касание внутри вложенной (более высокой) панели родительскую не закрывает.
        const nested = (target as Element).closest?.('[data-popover-level]')
        if (nested && Number(nested.getAttribute('data-popover-level')) > level) return
        if (options.triggers?.some(trigger => trigger.value?.contains(target))) return
        close()
    }
    const onKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') close()
    }

    const toggleListeners = (on: boolean) => {
        if (!import.meta.client) return
        const method = on ? 'addEventListener' : 'removeEventListener'
        document[method]('pointerdown', onDocumentPointerDown as EventListener, true)
        document[method]('keydown', onKeydown as EventListener)
        window[method]('scroll', close, true)
        window[method]('resize', close)
    }

    watch(visible, toggleListeners)

    // Карточка исчезла с открытой панелью (переход, смена подборки): слушатели снимаем явно —
    // watch после размонтирования уже не сработает.
    onBeforeUnmount(() => {
        close()
        toggleListeners(false)
    })

    return {visible, panelRef, panelStyle, panelLevel: level, onPointerEnter, onPointerLeave, toggle, close}
}
