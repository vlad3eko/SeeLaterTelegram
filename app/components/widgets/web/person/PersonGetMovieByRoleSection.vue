<template>

  <div v-if="awardMovies.length" class="w-full">
    <UiHorizontalScroller title="🏆Главные награды🏆" :items="awardMovies" v-slot="{item}">
        <CatalogCard :media="item" />
    </UiHorizontalScroller>
  </div>

  <CastNCrewPanel v-if="bestMoviesCast.length">
    <UiHorizontalScroller title="🎬Главные проекты🎬" :items="bestMoviesCast" v-slot="{item}">
        <CatalogCard :media="item"/>
    </UiHorizontalScroller>
  </CastNCrewPanel>

  <CastNCrewPanel v-for="section in convertCrewSection" :key="section.id">
    <UiHorizontalScroller :title="section.title" :items="section.items" v-slot="{item}">
        <CatalogCard :media="item"/>
    </UiHorizontalScroller>
  </CastNCrewPanel>

  <CastNCrewPanel v-if="convertPersonSection.length">
    <UiHorizontalScroller title="Фото" :items="convertPersonSection" v-slot="{item, index}">
        <NuxtImg @click="openGallery(index)" :src="`https://image.tmdb.org/t/p/w600_and_h900_face${item.file_path}`" class="cursor-pointer rounded-xl"/>
    </UiHorizontalScroller>
    <VueEasyLightbox
        :visible="visible"
        :imgs="images"
        :index="currentIndex"
        @hide="visible = false"
        :move-disabled="true"
        :zoom-disabled="true"
        :rotate-disabled="true"
        :loop="true"
    />
  </CastNCrewPanel>
</template>

<script lang="ts" setup>

import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";
import {useTmdbPerson} from "~/composables/person/useTmdbPerson";
import CastNCrewPanel from "~/components/ui/CastNCrewPanel.vue";
import VueEasyLightbox from 'vue-easy-lightbox'

const {
  convertCrewSection,
  awardMovies,
  bestMoviesCast,
  convertPersonSection,
} = useTmdbPerson()

console.log('convertCrewSection', convertCrewSection.value)
console.log('awardMovies', awardMovies.value)
console.log('bestMoviesCast', bestMoviesCast.value)
console.log('convertPersonSection', convertPersonSection.value)


const visible = ref(false)
const currentIndex = ref(0)

const images = computed(() => {
  return convertPersonSection.value.map(
      item => getImage(item.file_path)
  )
})

const openGallery = (index: number) => {
  currentIndex.value = index
  visible.value = true
}

const getImage = (path: string) => {
  return `https://image.tmdb.org/t/p/original${path}`
}

</script>

<style scoped>

</style>
