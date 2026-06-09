<template>
  <Loader v-if="props.loading"/>

  <Transition name="fade" mode="out-in">
    <section v-if="!props.loading" class="smoothie-grid">
      <div v-for="media in filteredMovies" :key="media.id" class="smoothie-card">
        <CatalogCard @click.right="rightClick" :media="media"/>
      </div>
    </section>
  </Transition>
</template>

<script lang="ts" setup>

import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";
import Loader from "~/composables/Loader.vue";
import type {TmdbMoviesProps} from "~/types/tmdb.types";

const props = defineProps<TmdbMoviesProps>()

const rightClick = computed(() => {
  console.log('click')
})


const filteredMovies = computed(() => {

  return props.media.filter(media => {
    console.log('media', media.overview)
        const description =
            'overview' in media
                ? media.overview
                : media.description
        const releaseDate =
            'release_date' in media
                ? media.release_date
                : media.first_air_date
        const voteCount =
            media.vote_count >= 10
        /*TODO передалть БД добавить условия voteCount*/
        return releaseDate && media.poster_path && description && voteCount
      }
  )
})

console.log('filteredMovies', filteredMovies)

</script>

<style scoped>

</style>
