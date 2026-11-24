<template>
  <!--
    Название тайтла со всплывающей краткой информацией (как «i» на постере).
    ПК — панель по наведению, клик ведёт на страницу тайтла. Телефон — нажатие открывает панель,
    переход — кнопкой «Подробнее». Внутри другой панели (лучшие работы человека) открывается поверх неё.
  -->
  <NuxtLink
      ref="linkComponent"
      :to="mediaLink"
      :aria-expanded="visible"
      @pointerdown="rememberPointer"
      @pointerenter="onPointerEnter"
      @pointerleave="onPointerLeave"
      @click.capture="onClick"
      class="transition hover:text-primary underline decoration-dotted decoration-1 underline-offset-2"
      :class="{'text-primary': visible}">
    <slot>{{ title }}</slot>
  </NuxtLink>

  <Teleport to="body">
    <div
        v-if="visible"
        ref="panelRef"
        role="dialog"
        :aria-label="title"
        :style="panelStyle"
        :data-popover-level="panelLevel"
        @pointerenter="onPointerEnter"
        @pointerleave="onPointerLeave"
        class="fixed rounded-xl bg-panel p-4 shadow-2xl ring-1 ring-accent-foreground/10 text-accent-foreground">
      <MediaBriefContent :brief="brief" :failed="failed"/>
      <NuxtLink :to="mediaLink"
                class="mt-3 inline-block rounded-lg bg-shell px-4 py-2 text-sm font-bold hover:bg-primary hover:text-primary-foreground transition">
        Подробнее
      </NuxtLink>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>

import {createSlug} from "~/utils/createSlug";
import MediaBriefContent from "~/components/widgets/web/catalog/MediaBriefContent.vue";

const props = defineProps<{
  media: { id: number, media_type: string, title?: string, name?: string }
}>()

const title = computed(() => props.media.title || props.media.name || '')
const mediaLink = computed(() => `/${props.media.media_type}/${createSlug(props.media.id, title.value)}`)

const linkComponent = ref<any>(null)
const linkRef = computed<HTMLElement | null>(() => linkComponent.value?.$el ?? null)

// Чем нажали последним: на касании (телефон) нажатие открывает панель, а не страницу.
let lastPointer = 'mouse'
const rememberPointer = (event: PointerEvent) => {
  lastPointer = event.pointerType
}

const {brief, failed, load} = useMediaBrief(() => props.media)

const {visible, panelRef, panelStyle, panelLevel, onPointerEnter, onPointerLeave, toggle} = useAnchoredPopover({
  anchor: () => linkRef.value,
  triggers: [linkRef],
  openDelay: 250,
  onOpen: load,
})

// capture: срабатывает раньше перехода RouterLink — на касании переход отменяется.
const onClick = (event: MouseEvent) => {
  if (lastPointer === 'mouse') return
  event.preventDefault()
  toggle()
}

</script>
