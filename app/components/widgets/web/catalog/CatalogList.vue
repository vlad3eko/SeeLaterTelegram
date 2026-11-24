<template>
  <Transition name="fade" mode="out-in">
    <section class="media-grid">

      <div v-for="media in props.media"
          :key="`${media.media_type}-${media.tmdb_id || media.id}`"
          class="media-card relative">

        <CatalogCard
            :media="media"
            :show-info="props.showInfo"/>

        <button v-if="props.removable"
                type="button"
                title="Убрать из сохранённых"
                aria-label="Убрать из сохранённых"
                @click.stop.prevent="emit('remove', media)"
                class="material-symbols-outlined absolute bottom-16 right-2 z-20
                       bg-panel/80 hover:bg-panel rounded-full p-1 text-error cursor-pointer
                       hover:scale-110 transition">
          delete
        </button>
      </div>

    </section>
  </Transition>

  <Loader v-if="props.loading"/>
</template>

<script lang="ts" setup>

import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";
import Loader from "~/composables/Loader.vue";
import type {TmdbMoviesProps} from "~/types/tmdb.types";

const props = defineProps<TmdbMoviesProps & { removable?: boolean }>()

const emit = defineEmits<{
  remove: [media: any]
}>()

</script>

<style scoped>

</style>
