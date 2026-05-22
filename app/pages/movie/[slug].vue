<template>
  <!--TODO маленькая страница при загрузке -->
  <div class="relative min-h-screen">

    <NuxtImg :src="image"
             class="absolute inset-0 w-full h-full object-cover select-none"/>

    <div class="absolute inset-0
               bg-gradient-to-b
               lg:bg-gradient-to-r
               from-accent
               via-accent/70
               to-accent/30
               backdrop-blur-md"/>

    <div class="relative z-10 container mx-auto px-4 md:px-8 py-10 md:py-20">
      <Loader v-if="pending"/>
      <Transition v-if="!pending && data" name="fade" mode="out-in">
        <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 lg:gap-10">

          <MovieHero/>

          <div class="flex flex-col gap-6 overflow-hidden">

            <MoviePlayer/>
            <MovieDescription/>
            <MovieMeta/>

            <UiHorizontalScroller title="Актёрский состав">
              <PersonCard
                  v-for="cast in castConverter"
                  :id="cast.id"
                  :person="cast"/>
            </UiHorizontalScroller>
            <UiHorizontalScroller title="Режиссёр">
              <PersonCard
                  v-for="cast in crewConverter"
                  :id="cast.id"
                  :person="cast"/>
            </UiHorizontalScroller>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
<script lang="ts" setup>

import Loader from "~/components/composables/Loader.vue";
import MovieHero from "~/components/widgets/web/movie/MovieHero.vue";
import MoviePlayer from "~/components/widgets/web/movie/MoviePlayer.vue";
import MovieDescription from "~/components/widgets/web/movie/MovieDescription.vue";
import MovieMeta from "~/components/widgets/web/movie/MovieMeta.vue";
import {useMovieDetails} from "~/components/composables/movie/useMovieDetails";
import PersonCard from "~/components/widgets/web/person/PersonCard.vue";

const {
  image,
  pending,
  data,
  castConverter,
  crewConverter,
} = useMovieDetails()

</script>

<style scoped>

</style>

