<template>
  <div v-if="trailer" class="overflow-hidden rounded-2xl bg-shell shadow-2xl ">
    <div class="relative md:h-[450px]">
      <Loader v-if="!trailerL" class="absolute left-1/2 top-1/2 w-10 -translate-x-1/2 -translate-y-1/2"/>
      <iframe class="w-full h-full aspect-video"
              :src="selectTrailer"
              allowfullscreen/>
    </div>

    <LazyUiHorizontalScroller v-if="trailers?.length" :items="trailers" v-slot="{item}" title="Трейлеры">
      <TrailerCard :item="item" @select="trailerL($event)"/>
    </LazyUiHorizontalScroller>

    <LazyUiHorizontalScroller v-if="mediaAbout?.length" :items="mediaAbout" v-slot="{item}" title="За кадром">
      <TrailerCard :item="item" @select="trailerL($event)"/>
    </LazyUiHorizontalScroller>

  </div>
</template>

<script lang="ts" setup>
import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import TrailerCard from "~/components/widgets/web/trailers/TrailerCard.vue";
import Loader from "~/composables/Loader.vue";

const {
  data,
  trailer,
} = useMovieDetails()

const selectTrailer = ref(`https://www.youtube.com/embed/${trailer.value?.key}?autoplay=1&rel=0&modestbranding=1`)

const trailerL = (key: string) => {
  const basic = key || trailer.value?.key

  return selectTrailer.value = `https://www.youtube.com/embed/${basic}?autoplay=1&rel=0&modestbranding=1`
}

const trailers = computed(() => {

  return data?.value?.trailers.filter(
      item => {
        const name = item.name.toLowerCase()

        if (
            name.includes('трейлер') ||
            name.includes('trailer')
        ) {
          return item.key
        }
      }
  )
})

const mediaAbout = computed(() => {

  return data?.value?.trailers.filter(
      item => {
        const name = item.name.toLowerCase()

        if (
            !name.includes('трейлер') &&
            !name.includes('trailer')
        ) {
          return item.key
        }
      }
  )
})

</script>

<style scoped>

</style>
