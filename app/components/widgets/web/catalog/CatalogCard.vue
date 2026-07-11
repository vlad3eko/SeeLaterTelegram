<template>
  <NuxtLink
      v-if="props.media"
      :to="formatLink"
      class="relative rounded-xl">

    <div class="relative w-full flex flex-col">
      <NuxtImg :src="computedImagesSrc" class="h-full object-cover w-full"/>
      <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none"/>


      <!--  Info    -->
      <CatalogCardInfo :media="props.media" :show-info="props.showInfo"/>
      <!--  Info    -->

      <div>
        <div v-if="media.vote_count"
             class="ml-1 absolute top-3 left-0 bg-accent/80 text-accent-foreground px-3 py-1 rounded-full text-sm font-bold"
             :class="statusClass">
          {{ media.vote_count }}
        </div>
        <div
            v-if="rating"
            class="rating mr-1 right-0">
          💎 {{ formatRating }}
        </div>
      </div>

      <div
          class="ml-1 absolute bottom-3 text-accent-foreground px-3 py-1 w-full font-bold text-center">
        <p class="font-bold">
          {{ formatTitle }}
        </p>
        <span v-if="date"
              class=" text-info mt-1">
            {{ formatDate }}
          </span>
      </div>

    </div>

  </NuxtLink>
</template>

<script lang="ts" setup>

import {FormatRating, FormatDate} from "~/utils/formatMoviesData";
import type {TmdbMovieProps} from "~/types/tmdb.types";
import {createSlug} from "~/utils/createSlug";
import CatalogCardInfo from "~/components/widgets/web/catalog/CatalogCardInfo.vue";

const props = defineProps<TmdbMovieProps>()

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

const computedImagesSrc = computed(() => {

  const errorImage = '/assets/errorImageMovie/errorImage.jpg'

  const image = props.media.poster_path || props.media.backdrop_path

  if (!image) return errorImage

  return image ? `https://image.tmdb.org/t/p/w600_and_h900_face/${image}` : errorImage

})
const statusClass = computed<string>(() => {

  if (props.mode === 'tmdb') {
    return ''
  }

  switch (props.media.status) {

    case 'planned':
      return 'bg-button text-accent border border-button-border'

    case 'watching':
      return 'bg-primary text-primary-foreground'

    case 'watched':
      return 'bg-focus text-white'

    default:
      return 'bg-panel text-info'
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
