
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

  <div class="relative z-10 px-3 md:px-8 py-6 md:py-20 min-h-screen">
    <Loader v-if="pending"/>
    <Transition v-if="!pending && data" name="fade" mode="out-in">
      <!-- minmax(0,1fr): колонка не растягивается под ширину слайдеров -->
      <div class="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-8 lg:gap-10">

        <MovieHero variant="movie"/>

        <div class="flex flex-col gap-6 overflow-hidden min-w-0">

          <div class="w-full 2xl:max-w-5xl">
            <MoviePlayer/>
          </div>

          <!--
            О тайтле: название, описание, под ним люди, под ними факты (страна, жанры, тип…) в строку.
          -->
          <!-- div, не section: глобальный стиль section в main.css (container, my-10, min-h-50vh) -->
          <div>
            <h1 class="text-[24px] md:text-[30px] font-semibold leading-tight mb-4 md:mb-5">
              {{ mediaTitleConvert(data) }}
            </h1>
            <MovieDescription/>
            <div class="mt-6 flex flex-col gap-6">
              <div class="min-w-0">
                <!-- Люди строками через запятую, с карточкой по наведению -->
                <MovieGetRoleByMovieSection/>
              </div>
              <div class="min-w-0">
                <MovieMeta/>
              </div>
            </div>
          </div>
          <TvSeasons/>
          <!-- Франшиза: все части коллекции TMDB (только у фильмов), невышедшие первыми с пометкой «Скоро» -->
          <MediaShelf v-if="collectionId" title="🧩 Франшиза" kind="collection" media="movie"
                      :id="collectionId" mark-upcoming/>
          <MediaShelf title="👍 Рекомендуем посмотреть" kind="recommendations" :media="shelfMedia" :id="shelfId"/>
          <MediaShelf title="🎞 Похожие" kind="similar" :media="shelfMedia" :id="shelfId"/>
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
import {imageCheck} from "~/utils/imageCheck";
import MediaShelf from "~/components/widgets/web/shelf/MediaShelf.vue";
import TvSeasons from "~/components/widgets/web/movie/TvSeasons.vue";
import {mediaTitleConvert} from "~/utils/convert/mediaConvert";

const {
  pending,
  data,
} = useMovieDetails()

const route = useRoute()
const shelfMedia = computed(() => route.params.media === 'tv' ? 'tv' : 'movie')
const collectionId = computed(() => Number((data.value as any)?.belongs_to_collection?.id) || 0)
const shelfId = computed(() => Number(String(route.params.slug).split('-')[0]) || 0)

// Мета-теги страницы тайтла (вкладка, превью ссылки в Telegram и соцсетях).
const seoTitle = computed(() => {
  const item: any = data.value
  if (!item) return ''
  const name = item.title || item.name || ''
  const year = String(item.release_date || item.first_air_date || '').slice(0, 4)
  const kind = item.media_type === 'tv' ? 'сериал' : 'фильм'
  return year ? `${name} (${kind}, ${year})` : name
})
const seoDescription = computed(() => {
  const text = String((data.value as any)?.overview || '').replace(/\s+/g, ' ').trim()
  return text.length > 200 ? `${text.slice(0, 197)}…` : text
})
const seoImage = computed(() => {
  const item: any = data.value
  const path = item?.backdrop_path || item?.poster_path
  return path ? `https://image.tmdb.org/t/p/w1280${path}` : undefined
})

useSeoMeta({
  title: seoTitle,
  ogTitle: seoTitle,
  description: seoDescription,
  ogDescription: seoDescription,
  ogImage: seoImage,
  twitterImage: seoImage,
  ogType: 'video.movie',
})

</script>

<style scoped>

</style>

