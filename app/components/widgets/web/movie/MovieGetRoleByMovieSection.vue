<template>
    <div>
      <UiHorizontalScroller title="Актёрский состав" :items="castConverter || []" v-slot="{item}">
          <PersonCard :item="item"/>
      </UiHorizontalScroller>
    </div>

    <CastNCrewPanel v-for="section in convertCrewSection" :key="section.id">
      <UiHorizontalScroller :title="section.title" :items="section.items" v-slot="{item}">
          <PersonCard :item="item" :mode="'tmdb'"/>
      </UiHorizontalScroller>
    </CastNCrewPanel>
</template>

<script lang="ts" setup>

import PersonCard from "~/components/widgets/web/person/PersonCard.vue";
import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import CastNCrewPanel from "~/components/ui/CastNCrewPanel.vue";

const {
  castConverter,
  convertCrewSection,
} = useMovieDetails()
</script>

<style scoped>

</style>
