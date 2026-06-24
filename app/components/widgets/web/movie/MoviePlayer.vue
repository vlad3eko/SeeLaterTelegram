<template>
  <div v-if="trailer" class="overflow-hidden rounded-2xl bg-shell shadow-2xl ">
    <div class="relative md:h-[450px]">
      <Loader v-if="!trailerL" class="absolute left-1/2 top-1/2 w-10 -translate-x-1/2 -translate-y-1/2"/>
      <iframe class="w-full h-full aspect-video"
              :src="selectTrailer"
              allowfullscreen/>
    </div>

    <LazyUiHorizontalScroller v-if="groupedTrailers.trailersSort?.length" :items="groupedTrailers.trailersSort"
                              v-slot="{item}" title="Трейлеры">
      <TrailerCard :item="item" @select="trailerL($event)"/>
    </LazyUiHorizontalScroller>

    <LazyUiHorizontalScroller v-if="groupedTrailers.mediaAbout?.length" :items="groupedTrailers.mediaAbout"
                              v-slot="{item}" title="За кадром">
      <TrailerCard :item="item" @select="trailerL($event)"/>
    </LazyUiHorizontalScroller>

  </div>
</template>

<script lang="ts" setup>
import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import TrailerCard from "~/components/widgets/web/trailers/TrailerCard.vue";
import Loader from "~/composables/Loader.vue";
import type {TmdbTrailer} from "~/types/tmdb.types";

const {
  data,
  trailer,
} = useMovieDetails()

const groupedTrailers = computed(() => {

  const trailersSort: TmdbTrailer[] = []
  const mediaAbout: TmdbTrailer[] = []

  data.value?.trailers.filter(
      item => {
        const name = item.name.toLowerCase()

        if (
            name.includes('трейлер') ||
            name.includes('trailer')
        ) {
          trailersSort.push(item)
        } else {
          mediaAbout.push(item)
        }
      }
  )

  trailersSort.sort(
      (a, b) =>
          new Date(b.published_at).getTime() -
          new Date(a.published_at).getTime()
  )

  return {
    trailersSort,
    mediaAbout
  }
})

const selectedKey = ref('')

const defaultTrailerKey = computed(
    () =>
        groupedTrailers.value.trailersSort[0]?.key ||
        trailer.value?.key ||
        ''
)

const selectTrailer = computed(
    () =>
        `https://www.youtube.com/embed/${
            selectedKey.value || defaultTrailerKey.value
        }?rel=0&modestbranding=1`
)

const trailerL = (key: string) => {
  selectedKey.value = key
}

</script>

<style scoped>

</style>
