<template>

  <div v-if="awardMovies.length > 0" class="w-full">
    <UiHorizontalScroller title="🏆Главные награды🏆" :items="awardMovies">
      <template #default="{ item }">
        <CatalogCard :movie="item"/>
      </template>
    </UiHorizontalScroller>
  </div>

  <CastNCrewPanel>
    <UiHorizontalScroller title="🎬Главные проекты🎬" :items="bestMoviesCast">
      <template #default="{item}">
        <CatalogCard :movie="item" :mode="'tmdb'"/>
      </template>
    </UiHorizontalScroller>
    <span v-if="bestMoviesCast.length === 0" class="text-error flex justify-center items-center pb-6">Список фильмов отсутствует...</span>
  </CastNCrewPanel>

  <CastNCrewPanel v-for="section in convertCrewSection" :key="section.id">
    <UiHorizontalScroller :title="section.title" :items="section.items">
      <template #default="{item}">
        <CatalogCard :movie="item" :mode="'tmdb'"/>
      </template>
    </UiHorizontalScroller>
  </CastNCrewPanel>

  <CastNCrewPanel>
    <UiHorizontalScroller title="Фото" :items="convertPersonSection">
      <template #default="{item}">
        <NuxtImg :src="`https://image.tmdb.org/t/p/w600_and_h900_face${item.file_path}`"/>
      </template>
    </UiHorizontalScroller>
  </CastNCrewPanel>
</template>

<script lang="ts" setup>

import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";
import {useTmdbPerson} from "~/composables/person/useTmdbPerson";
import CastNCrewPanel from "~/components/ui/CastNCrewPanel.vue";

const {
  convertCrewSection,
  awardMovies,
  bestMoviesCast,
  convertPersonSection,
} = useTmdbPerson()
</script>

<style scoped>

</style>
