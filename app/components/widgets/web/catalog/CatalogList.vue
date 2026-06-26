<template>
  <Loader v-if="props.loading"/>

  <Transition name="fade" mode="out-in">
    <section v-if="!props.loading" class="media-grid">
      <div v-for="media in props.media" :key="media.id" class="media-card">
        <CatalogCard :media="media" :show-info="props.showInfo"/>
      </div>
    </section>
  </Transition>
</template>

<script lang="ts" setup>

import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";
import Loader from "~/composables/Loader.vue";
import type {TmdbMoviesProps} from "~/types/tmdb.types";

const props = defineProps<TmdbMoviesProps>()

</script>

<style scoped>

</style>
