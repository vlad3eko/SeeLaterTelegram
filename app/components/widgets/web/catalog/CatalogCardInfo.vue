<template>
  <div
      v-if="props.showInfo"
      @mouseenter="loadInfo"
      @mouseleave="showInfo = false"
      class="flex justify-center absolute inset-x-0 top-0">

    <span
        class="material-symbols-outlined absolute
        md-16 pb-1 px-3 rounded-b-xl
        bg-panel/50 hover:bg-panel opacity-30 text-center hover:opacity-100">
      info
    </span>


    <div
        v-if="showInfo && movieInfo"
        @mouseenter="loadInfo"
        @mouseleave="showInfo = false"
        class="absolute left-full top-0 z-50 w-72 rounded-xl bg-panel p-4 shadow-lg will-change-transform">

      <p class="font-bold">
        {{ movieInfo.title }}
      </p>

      <p class="mt-2 text-sm line-clamp-5">
        {{ movieInfo.overview }}
      </p>

      <p class="mt-2">
        {{ movieInfo.type }}
      </p>

      <p class="mt-1 text-xs opacity-70">
        {{ movieInfo.genres }}
      </p>

    </div>

  </div>
</template>


<script lang="ts" setup>

import type {TmdbMovieDetails, TmdbMovieProps} from "~/types/tmdb.types";

const props = defineProps<TmdbMovieProps>()

const movieInfo = ref<{
  title: string
  overview: string
  type: string
  genres: string
} | null>(null)

const showInfo = ref(false)

const loadInfo = async () => {

  showInfo.value = true

  // уже загружали
  if (movieInfo.value) return

  const mediaId =
      props.media.tmdb_id ||
      props.media.id

  const mediaType =
      props.media.media_type

  if (!mediaId || !mediaType) {

    console.log('CatalogCardInfo: missing media data', props.media)
    return
  }

  try {
    const data =
        await $fetch<TmdbMovieDetails>(
            '/api/tmdb/media',
            {
              query:{
                id: mediaId,
                media: mediaType
              }
            }
        )

    if (!data) return

    movieInfo.value = {
      title:
          props.media.title ||
          props.media.name ||
          'Без названия',

      overview:
          data.overview ||
          'Описание отсутствует',

      type:
          mediaType === 'tv'
              ? 'Сериал'
              : 'Фильм',

      genres:
          data.genres
              ?.map(i => i.name)
              .join(', ') || 'Жанры отсутствуют'
    }

  } catch (error) {
    console.error('CatalogCardInfo error:', error)
  }
}

</script>
