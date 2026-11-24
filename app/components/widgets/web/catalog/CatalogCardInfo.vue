<template>
  <!--
    Кнопка «i» на постере и панель с краткой информацией.
    Мышь: панель по наведению. Касание (телефон): по нажатию на «i» — переход по ссылке карточки
    не срабатывает, повторное нажатие или касание мимо панели закрывает её.
    Панель вынесена в body (Teleport): полки обрезают всё, что выходит за их край.
  -->
  <div v-if="props.showInfo" class="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
    <span
        ref="iconRef"
        role="button"
        tabindex="0"
        aria-label="Краткая информация"
        :aria-expanded="visible"
        @pointerenter="onPointerEnter"
        @pointerleave="onPointerLeave"
        @click.prevent.stop="toggle"
        @keydown.enter.prevent.stop="toggle"
        class="material-symbols-outlined pointer-events-auto cursor-pointer select-none
               md-16 pb-1 px-3 rounded-b-xl text-center transition
               bg-panel/50 hover:bg-panel opacity-60 md:opacity-30 hover:opacity-100"
        :class="{'!opacity-100 !bg-panel': visible}">
      info
    </span>
  </div>

  <Teleport to="body">
    <div
        v-if="visible"
        ref="panelRef"
        role="dialog"
        :style="panelStyle"
        :data-popover-level="panelLevel"
        @pointerenter="onPointerEnter"
        @pointerleave="onPointerLeave"
        class="fixed rounded-xl bg-panel p-4 shadow-lg text-accent-foreground">

      <MediaBriefContent :brief="brief" :failed="failed"/>
    </div>
  </Teleport>
</template>


<script lang="ts" setup>

import type {TmdbMovieProps} from "~/types/tmdb.types";
import MediaBriefContent from "~/components/widgets/web/catalog/MediaBriefContent.vue";

const props = defineProps<TmdbMovieProps>()

const iconRef = ref<HTMLElement | null>(null)

const {brief, failed, load} = useMediaBrief(() => props.media)

// Общая механика панели: наведение мышью, нажатие на «i» на телефоне, одна открытая панель на странице.
const {visible, panelRef, panelStyle, panelLevel, onPointerEnter, onPointerLeave, toggle} = useAnchoredPopover({
  anchor: () => (iconRef.value?.closest('a') ?? iconRef.value?.parentElement) as HTMLElement | null,
  triggers: [iconRef],
  onOpen: load,
})

</script>
