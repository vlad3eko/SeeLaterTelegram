<template>
  <NuxtImg :src="imageCheck(data)"
           class="absolute inset-0 w-full h-full object-cover select-none"/>

  <div class="absolute inset-0
               bg-gradient-to-b
               lg:bg-gradient-to-r
               from-accent
               via-accent/70
               to-accent/30
               backdrop-blur-md"/>

  <div class="relative z-10 px-4 md:px-8 py-10 md:py-20">
    <Loader v-if="pending"/>
    <Transition v-if="!pending && data" name="fade" mode="out-in">
      <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 lg:gap-10">

        <MovieHero variant="movie"/>

        <div class="flex flex-col gap-6 overflow-hidden">

          <div class="grid grid-cols-2 gap-9 max-2xl:grid-cols-1">
            <MoviePlayer/>
            <div>
              <MovieDescription/>
              <MovieMeta/>
            </div>
          </div>
          <MovieGetRoleByMovieSection/>
        </div>

      </div>
    </Transition>
  </div>
</template>
<script lang="ts" setup>

import Loader from "~/composables/Loader.vue";
import MovieHero from "~/components/widgets/web/movie/MovieHero.vue";
import MoviePlayer from "~/components/widgets/web/movie/MoviePlayer.vue";
import MovieMeta from "~/components/widgets/web/movie/MovieMeta.vue";
import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import MovieGetRoleByMovieSection from "~/components/widgets/web/movie/MovieGetRoleByMovieSection.vue";
import MovieDescription from "~/components/widgets/web/movie/MovieDescription.vue";

const {
  pending,
  data,
} = useMovieDetails()

</script>

<style scoped>

</style>

