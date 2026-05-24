<template>
  <Loader v-if="pending"/>
  <div v-if="!pending && data" class="container mx-auto px-4 py-16">

    <div class="grid xl:grid-cols-[300px_1fr] gap-10">

      <!-- SIDEBAR -->
      <div class="sticky top-5 h-max">

        <div class="bg-shell rounded-3xl overflow-hidden shadow-2xl">

          <NuxtImg
              :src="imageCheck(data, 'profile_path')"
              class="w-full object-cover"
          />

          <div class="p-6 flex flex-col gap-5">

            <div>
              <h2 class="text-3xl font-bold">
                {{ data?.name }}
              </h2>

              <p class="text-zinc-400">
                {{ convertTranslateKnowForDepartment(data?.known_for_department) }}
              </p>
            </div>

            <div class="flex flex-col gap-3">

              <div class="bg-panel rounded-xl p-4">
                Дата рождения: {{ dateConvert(data?.birthday) }}
                <span v-if="data?.deathday">- {{ dateConvert(data.deathday) }}</span>
              </div>

              <div class="bg-panel rounded-xl p-4">
                Рейтинг популярости: {{ data?.popularity }}
              </div>

              <div class="bg-panel rounded-xl p-4">
                Место рождения: {{ data?.place_of_birth }}
              </div>

              <div v-if="data?.homepage" class="bg-panel rounded-xl p-4">
                Личная страница:
                <NuxtLink :to="data?.homepage" target="_blank">{{ data?.homepage }}</NuxtLink>
              </div>

            </div>

          </div>

        </div>

      </div>

      <!-- CONTENT -->
      <div class="flex flex-wrap gap-6 overflow-hidden">

        <div class="bg-shell rounded-3xl p-8 md:col-span-2 w-full">

          <h2 class="text-4xl font-bold mb-6">
            Биография
          </h2>

          <p v-if="data?.biography" class="leading-8  whitespace-pre-line">
            {{ data?.biography }}
          </p>

          <p v-else class="leading-8  whitespace-pre-line">
            Биография временно отсутствует..
          </p>

        </div>

        <div class="bg-shell rounded-3xl p-3 w-full">
          <UiHorizontalScroller title="🏆Главные награды🏆" :items="data.combined_credits.cast">
            <template #default="{item}">
              <CatalogCard :movie="item" :mode="'tmdb'"/>
            </template>
          </UiHorizontalScroller>
        </div>

        <div class="bg-shell rounded-3xl  w-full">
          <UiHorizontalScroller title="🎬Главные проекты🎬" :items="bestMoviesCast">
            <template #default="{item}">
              <CatalogCard :movie="item" :mode="'tmdb'"/>
            </template>
          </UiHorizontalScroller>
          <span v-if="bestMoviesCast.length === 0" class="text-error flex justify-center items-center pb-6">Список фильмов отсутствует...</span>
        </div>

        <div class="bg-shell rounded-3xl p-3 w-full">
          <UiHorizontalScroller title="Директор" :items="isDirector">
            <template #default="{item}">
              <CatalogCard :movie="item" :mode="'tmdb'"/>
            </template>
          </UiHorizontalScroller>
        </div>

        <div class="bg-shell rounded-3xl p-3 w-full">
          <UiHorizontalScroller title="Сценарист" :items="isProducer">
            <template #default="{item}">
              <CatalogCard :movie="item" :mode="'tmdb'"/>
            </template>
          </UiHorizontalScroller>
        </div>

        <div class="bg-shell rounded-3xl p-3 w-full">
          <UiHorizontalScroller title="Режиссёр" :items="isWriter">
            <template #default="{item}">
              <CatalogCard :movie="item" :mode="'tmdb'"/>
            </template>
          </UiHorizontalScroller>
        </div>

        <div class="bg-shell rounded-3xl p-3 w-full">
          <UiHorizontalScroller title="Фото" :items="data?.images?.profiles">
            <template #default="{item}">
              <PersonCard :item="item"/>
            </template>
          </UiHorizontalScroller>
        </div>

      </div>

    </div>
  </div>
</template>

<script lang="ts" setup>
import {useTmdbPerson} from "~/components/composables/useTmdbPerson";
import Loader from "~/components/composables/Loader.vue";
import {imageCheck} from "~/utils/imageCheck";
import {dateConvert} from "~/utils/convert/dateConvert";
import {convertTranslateKnowForDepartment} from "~/utils/convert/translateKnowForDepartment";
import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";
import PersonCard from "~/components/widgets/web/person/PersonCard.vue";

const {
  data,
  pending,
  bestMoviesCast,
  isDirector,
  isProducer,
  isWriter,
} = useTmdbPerson()

</script>

<style scoped>

</style>
