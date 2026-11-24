<template>
  <!--
    Имя человека со всплывающей краткой карточкой: фото, профессии, роль в этом тайтле, лучшие работы.
    ПК — карточка по наведению (с задержкой), клик ведёт на страницу персоны.
    Телефон — нажатие на имя открывает карточку, переход — кнопкой «Подробнее» в ней.
  -->
  <NuxtLink
      ref="linkComponent"
      :to="personLink"
      :aria-expanded="visible"
      @pointerdown="rememberPointer"
      @pointerenter="onPointerEnter"
      @pointerleave="onPointerLeave"
      @click.capture="onClick"
      class="transition hover:text-primary"
      :class="{'text-primary': visible}">
    <slot>{{ props.item.name }}</slot>
  </NuxtLink>

  <Teleport to="body">
    <div
        v-if="visible"
        ref="panelRef"
        role="dialog"
        :aria-label="props.item.name"
        :style="panelStyle"
        :data-popover-level="panelLevel"
        @pointerenter="onPointerEnter"
        @pointerleave="onPointerLeave"
        class="fixed rounded-2xl bg-panel p-3 shadow-2xl text-accent-foreground">

      <div class="flex gap-3">
        <NuxtImg :src="imageCheck(props.item)"
                 :alt="props.item.name"
                 class="w-28 h-40 shrink-0 rounded-xl object-cover bg-shell"/>

        <div class="min-w-0 flex flex-col gap-1">
          <!-- rem на сайте = 12px (глобальное правило в main.css), поэтому размеры крупнее обычного -->
          <p class="text-2xl font-bold leading-tight">{{ props.item.name }}</p>
          <p v-if="departments" class="text-base text-muted-foreground">{{ departments }}</p>
          <p v-if="role" class="text-base">
            <span class="text-muted-foreground">Роль:</span> {{ role }}
          </p>
          <NuxtLink :to="personLink"
                    class="mt-auto w-max rounded-lg bg-shell px-4 py-2 text-base font-bold hover:bg-primary hover:text-primary-foreground transition">
            Подробнее
          </NuxtLink>
        </div>
      </div>

      <p class="mt-3 text-base leading-snug line-clamp-3">
        <template v-if="info">
          <!-- Каждое название — со своей панелью «кратко о тайтле» поверх этой -->
          <span class="font-bold">Лучшие работы:</span>
          <template v-if="info.best.length">
            {{ ' ' }}<template v-for="(work, index) in info.best" :key="`${work.media_type}-${work.id}`">
              <MediaInfoLink :media="work"/><span v-if="index < info.best.length - 1">, </span>
            </template>
          </template>
          <template v-else> нет данных</template>
        </template>
        <span v-else-if="failed" class="text-muted-foreground">Не удалось загрузить</span>
        <span v-else class="text-muted-foreground">Загрузка…</span>
      </p>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>

import {tmdbFetch} from "#server/utils/api/tmdbFetch";
import MediaInfoLink from "~/components/widgets/web/catalog/MediaInfoLink.vue";
import {createSlug} from "~/utils/createSlug";
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";

const props = defineProps<{
  item: { id: number, name: string, profile_path?: string | null, character?: string, known_for_department?: string }
}>()

const BEST_WORKS = 6
// Случайные технические участия (саундтрек, «благодарности») не называем профессией — кроме основной.
const MINOR_DEPARTMENTS = new Set(['Звук', 'Съёмочная группа', 'Осветитель'])

const linkComponent = ref<any>(null)
const linkRef = computed<HTMLElement | null>(() => linkComponent.value?.$el ?? null)
// Чем нажали последним: на касании (телефон) нажатие на имя открывает карточку, а не страницу.
let lastPointer = 'mouse'
const rememberPointer = (event: PointerEvent) => {
  lastPointer = event.pointerType
}

type BestWork = { id: number, media_type: string, title?: string, name?: string }
const info = ref<{ departments: string[], best: BestWork[] } | null>(null)
const failed = ref(false)

// TMDB: «Production» — это продюсеры; остальное переводит общий словарь профессий.
const departmentName = (department: string) =>
    department === 'Production' ? 'Продюсер' : convertTranslateKnowForDepartment(department)

const loadInfo = async () => {
  if (info.value || !props.item.id) return
  failed.value = false
  try {
    const data: any = await tmdbFetch('/api/tmdb/person', {query: {id: props.item.id}})
    const cast: any[] = data?.combined_credits?.cast || []
    const crew: any[] = data?.combined_credits?.crew || []

    // Профессии: основная первой, затем по числу работ в каждой.
    const counts = new Map<string, number>()
    if (cast.length) counts.set('Актёр', cast.length)
    for (const credit of crew) {
      const name = departmentName(credit.department)
      if (name) counts.set(name, (counts.get(name) || 0) + 1)
    }
    const main = departmentName(data?.known_for_department || '')
    const departments = [...counts.entries()]
        .sort((a, b) => (b[0] === main ? 1 : 0) - (a[0] === main ? 1 : 0) || b[1] - a[1])
        .filter(([name]) => name === main || !MINOR_DEPARTMENTS.has(name))
        .map(([name]) => name)
        .slice(0, 3)

    // Лучшие работы: самые обсуждаемые тайтлы (по числу голосов), без повторов фильм/сериал.
    const seen = new Set<string>()
    const best = [...cast, ...crew]
        .filter(credit => credit.vote_count && (credit.title || credit.name))
        .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
        .filter(credit => {
          const key = `${credit.media_type}-${credit.id}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .slice(0, BEST_WORKS)
        .filter(credit => credit.media_type === 'movie' || credit.media_type === 'tv')
        .map(credit => ({id: credit.id, media_type: credit.media_type, title: credit.title, name: credit.name}))

    info.value = {departments, best}
  } catch (error) {
    failed.value = true
    console.error('PersonInfoPopover error:', error)
  }
}

const {visible, panelRef, panelStyle, panelLevel, onPointerEnter, onPointerLeave, toggle} = useAnchoredPopover({
  anchor: () => linkRef.value,
  triggers: [linkRef],
  width: 380,
  openDelay: 350,
  onOpen: loadInfo,
})

// До загрузки — основная профессия из списка людей тайтла (если TMDB её отдал).
const departments = computed(() =>
    info.value?.departments.join(', ') || convertTranslateKnowForDepartment(props.item.known_for_department || ''))

const role = computed(() => (props.item.character || '').trim())

const personLink = computed(() => `/person/${createSlug(props.item.id, props.item.name)}`)

// capture: срабатывает раньше перехода RouterLink — на касании переход отменяется.
const onClick = (event: MouseEvent) => {
  if (lastPointer === 'mouse') return
  event.preventDefault()
  toggle()
}

</script>
