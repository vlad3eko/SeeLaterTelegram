
<template>
  <!--
    Карточка тайтла: самодостаточна — одинаково выглядит в сетке, на полках и на странице персоны.
    Слои: постер (2:3) → градиент снизу → бейджи и подпись (z-10, над градиентом).
  -->
  <NuxtLink
      v-if="props.media"
      :to="formatLink"
      class="group relative block w-full rounded-xl">

    <!-- Постер обрезается по скруглению; карточка — нет (подсказка info выходит вправо) -->
    <div class="relative overflow-hidden rounded-xl bg-shell">
      <NuxtImg :src="computedImagesSrc"
               :alt="formatTitle"
               loading="lazy"
               class="block w-full aspect-[2/3] object-cover transition duration-500 group-hover:scale-105"/>

      <!-- Градиент: сверху лёгкий (под бейджи), снизу плотный (под название) -->
      <div class="pointer-events-none absolute inset-0
                  bg-gradient-to-t from-black/90 via-black/25 via-45% to-black/30"/>
    </div>

    <!--  Info    -->
    <CatalogCardInfo :media="props.media" :show-info="props.showInfo"/>
    <!--  Info    -->

    <!-- Бейджи -->
    <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2">
      <!-- «Скоро»: невышедший тайтл (франшиза). Приглушённо, без ярких эффектов. -->
      <span v-if="isUpcoming"
            class="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur-sm">
        Скоро
      </span>
      <span v-else-if="media.vote_count"
            class="rounded-full px-2.5 py-0.5 text-xs font-bold backdrop-blur-sm"
            :class="statusClass">
        {{ media.vote_count }}
      </span>
      <span v-else/>
      <span v-if="formatRating"
            class="rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
        💎 {{ formatRating }}
      </span>
    </div>

    <!-- Подпись -->
    <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 text-center text-white">
      <p class="font-bold leading-tight line-clamp-2 drop-shadow">
        {{ formatTitle }}
      </p>
      <span v-if="formatDate" class="mt-0.5 block text-sm font-bold text-white/80">
        {{ formatDate }}
      </span>
    </div>

  </NuxtLink>
</template>

<script lang="ts" setup>

import {FormatRating, FormatDate} from "~/utils/formatMoviesData";
import type {TmdbMovieProps} from "~/types/tmdb.types";
import {createSlug} from "~/utils/createSlug";
import CatalogCardInfo from "~/components/widgets/web/catalog/CatalogCardInfo.vue";

// showInfo по умолчанию включён: «i» с краткой информацией есть на всех постерах (полки, персона, каталог).
const props = withDefaults(defineProps<{
  media:any,
  showInfo?:boolean,
  mode?:string,
  // Пометить невышедший тайтл бейджем «Скоро» (блок «Франшиза»).
  markUpcoming?:boolean
}>(), {showInfo: true})

const title = computed(() => {
  return 'title' in props.media
      ? props.media.title
      : props.media.name
})

const date = computed(() => {
  return 'release_date' in props.media
      ? props.media.release_date
      : props.media.first_air_date
})

const isUpcoming = computed(() => {
  if (!props.markUpcoming) return false
  const value = String(date.value || '')
  return !value || value > new Date().toISOString().slice(0, 10)
})

const computedImagesSrc = computed(() => {

  const errorImage = '/assets/errorImageMovie/errorImage.jpg'

  const image = props.media.poster_path || props.media.backdrop_path

  if (!image) return errorImage

  return image ? `https://image.tmdb.org/t/p/w600_and_h900_face/${image}` : errorImage

})
const statusClass = computed<string>(() => {

  if (props.mode === 'tmdb') {
    return 'bg-black/60 text-white'
  }

  switch (props.media.status) {

    case 'planned':
      return 'bg-button text-accent border border-button-border'

    case 'watching':
      return 'bg-primary text-primary-foreground'

    case 'watched':
      return 'bg-focus text-white'

    default:
      return 'bg-black/60 text-white'
  }
})

const rating = computed(() => {
  return props.media.vote_average ? props.media.vote_average : props.media.vote_count
})

const formatTitle = computed(() => {
  return title.value
})

const formatDate = computed(() => {

  return FormatDate(date.value)
})

const formatRating = computed(() => {
  return rating.value ? FormatRating(rating.value) : ''
})

const formatLink = computed(() => {

  const type = props.media.media_type
  const id = props.media.tmdb_id || props.media.id

  const slug = createSlug(id, title.value)

  return `/${type}/${slug}`
})

</script>

<style scoped>

</style>
