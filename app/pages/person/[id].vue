<template>
  <Loader v-if="pending"/>
  <div v-if="!pending && data" class=" px-4 py-16 mx-10">

    <div class="grid md:grid-cols-[300px_1fr] gap-10">

      <!-- SIDEBAR -->
      <div class="md:sticky top-5 h-max">

        <div class="bg-shell rounded-3xl overflow-hidden shadow-2xl">

          <NuxtImg
              :src="imageCheck(data)"
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

              <div v-if="convertPersonLinkWebsite" class="bg-panel rounded-xl p-4">
                Личная страница:
                <NuxtLink :to="convertPersonLinkWebsite" target="_blank">{{ convertPersonLinkWebsite }}</NuxtLink>
              </div>

            </div>

          </div>

        </div>

      </div>

      <!-- CONTENT -->
      <Transition v-if="!pending && data" name="fade" mode="out-in">
        <div class="flex flex-wrap gap-6 overflow-hidden">

          <div class="bg-shell rounded-3xl p-8 md:col-span-2 w-full">

            <h2 class="text-4xl font-bold mb-6">
              Биография
            </h2>

            <p v-if="data?.biography" class="leading-8  whitespace-pre-line">
              {{ data?.biography }}
            </p>

            <p v-else class="leading-8  whitespace-pre-line text-error">
              Биография временно отсутствует..
            </p>

          </div>

          <PersonGetMovieByRoleSection/>

        </div>
      </Transition>

    </div>
  </div>
</template>

<script lang="ts" setup>
import {useTmdbPerson} from "~/composables/person/useTmdbPerson";
import Loader from "~/composables/Loader.vue";
import {imageCheck} from "~/utils/imageCheck";
import {dateConvert} from "~/utils/convert/dateConvert";
import {convertTranslateKnowForDepartment} from "~/utils/convert/translateKnowForDepartment";
import PersonGetMovieByRoleSection from "~/components/widgets/web/person/PersonGetMovieByRoleSection.vue";

const {
  data,
  pending,
  convertPersonLinkWebsite,
} = useTmdbPerson()

</script>

<style scoped>

</style>
