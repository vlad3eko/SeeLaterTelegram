<template>
  <!--TODO маленькая страница при загрузке -->
    <NuxtImg :src="imageCheck(data)"
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

          <MovieHero variant="movie"/>

          <div class="flex flex-col gap-6 overflow-hidden">

            <MoviePlayer/>
            <MovieDescription/>
            <MovieMeta/>

            <div>
              <UiHorizontalScroller title="Актёрский состав" :items="castConverter || []">
                <template #default="{item}">
                  <PersonCard :item="item"/>
                </template>
              </UiHorizontalScroller>
            </div>
            <div>
              <UiHorizontalScroller title="Директор" :items="isDirector">
                <template #default="{item}">
                  <PersonCard :item="item"/>
                </template>
              </UiHorizontalScroller>
            </div>
            <div>
              <UiHorizontalScroller title="Режиссёр" :items="isProducer">
                <template #default="{item}">
                  <PersonCard :item="item"/>
                </template>
              </UiHorizontalScroller>
            </div>
            <div>
              <UiHorizontalScroller title="Ассистент Режиссёра" :items="isExecutiveProducer">
                <template #default="{item}">
                  <PersonCard :item="item"/>
                </template>
              </UiHorizontalScroller>
            </div>
            <div>
              <UiHorizontalScroller title="Сценарист" :items="isWriter">
                <template #default="{item}">
                  <PersonCard :item="item"/>
                </template>
              </UiHorizontalScroller>
            </div>
          </div>
        </div>
      </Transition>
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
  pending,
  data,
  castConverter,
  isDirector,
  isProducer,
  isExecutiveProducer,
  isWriter,
} = useMovieDetails()

</script>

<style scoped>

</style>

