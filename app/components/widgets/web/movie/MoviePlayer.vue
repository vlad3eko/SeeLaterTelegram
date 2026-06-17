<template>
  <div v-if="trailer" class="overflow-hidden rounded-2xl bg-shell shadow-2xl ">
    <div class="relative">
      <Loader v-if="!trailerL" class="absolute left-1/2 top-1/2 w-10 -translate-x-1/2 -translate-y-1/2"/>
      <iframe class="w-full aspect-video md:h-[450px]"
              :src="selectTrailer"
              allowfullscreen/>
    </div>
    <LazyUiHorizontalScroller :items="data?.trailers" v-slot="{item}" title="Больше видео">
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

const selectTrailer = ref(`https://www.youtube.com/embed/${trailer.value?.key}?autoplay=1`)

const trailerL = (key: string) => {
  const basic = key || trailer.value?.key

  return selectTrailer.value = `https://www.youtube.com/embed/${basic}?autoplay=1`
}

</script>

<style scoped>

</style>
