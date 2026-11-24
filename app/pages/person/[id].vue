
<template>
  <Loader v-if="pending"/>
  <div v-if="!pending && data" class="px-3 md:px-8 lg:px-14 py-6 md:py-16">

    <!-- minmax(0,1fr): колонка не растягивается под ширину слайдеров (на телефоне страница уезжала вбок) -->
    <div class="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-6 md:gap-10">

      <!-- SIDEBAR -->
      <div class="md:sticky top-[calc(var(--site-chrome-h,0px)+1.25rem)] h-max">

        <div class="bg-shell rounded-3xl overflow-hidden shadow-2xl mx-auto max-w-[300px] ">

          <NuxtImg
              :src="imageCheck(data)"
              class="w-full object-cover max-md:max-h-[300px]"
          />

          <div class="p-4 md:p-6 flex flex-col gap-5">

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
                Популярность на TMDB: {{ FormatRating(data?.popularity) }}
              </div>

              <div class="bg-panel rounded-xl p-4">
                Место рождения: {{ data?.place_of_birth }}
              </div>

              <div v-if="socialLinks.length" class="bg-panel rounded-xl p-4 flex flex-wrap gap-2">
                <a v-for="link in socialLinks" :key="link.label"
                   :href="link.url" target="_blank" rel="noopener noreferrer"
                   class="px-3 py-1 rounded-lg bg-shell hover:bg-primary hover:text-primary-foreground transition text-sm font-bold">
                  {{ link.label }}
                </a>
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
        <div class="flex flex-wrap gap-6 overflow-hidden min-w-0">

          <div v-if="data?.biography" class="bg-shell rounded-3xl p-5 md:p-8 md:col-span-2 w-full">

            <h2 class="text-[18px] md:text-[22px] font-semibold mb-3 md:mb-4">
              Биография
            </h2>

            <p class="leading-7 md:leading-8 whitespace-pre-line break-words">
              {{ data?.biography }}
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
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import PersonGetMovieByRoleSection from "~/components/widgets/web/person/PersonGetMovieByRoleSection.vue";

const {
  data,
  pending,
  convertPersonLinkWebsite,
} = useTmdbPerson()

// Внешние профили из TMDB external_ids (приходят вместе с персоной).
const socialLinks = computed(() => {
  const ids: Record<string, string | null | undefined> = (data.value as any)?.external_ids || {}
  const links = [
    {label: 'IMDb', id: ids.imdb_id, url: (v: string) => `https://www.imdb.com/name/${v}/`},
    {label: 'Instagram', id: ids.instagram_id, url: (v: string) => `https://www.instagram.com/${v}/`},
    {label: 'X (Twitter)', id: ids.twitter_id, url: (v: string) => `https://x.com/${v}`},
    {label: 'TikTok', id: ids.tiktok_id, url: (v: string) => `https://www.tiktok.com/@${v}`},
    {label: 'YouTube', id: ids.youtube_id, url: (v: string) => `https://www.youtube.com/@${v}`},
    {label: 'Facebook', id: ids.facebook_id, url: (v: string) => `https://www.facebook.com/${v}`},
    {label: 'Wikidata', id: ids.wikidata_id, url: (v: string) => `https://www.wikidata.org/wiki/${v}`},
  ]
  return links
      .filter(link => typeof link.id === 'string' && /^[\w.@-]+$/.test(link.id))
      .map(link => ({label: link.label, url: link.url(link.id as string)}))
})

const seoTitle = computed(() => data.value?.name || '')
const seoDescription = computed(() => {
  const text = String(data.value?.biography || '').replace(/\s+/g, ' ').trim()
  return text.length > 200 ? `${text.slice(0, 197)}…` : text
})
const seoImage = computed(() =>
    data.value?.profile_path ? `https://image.tmdb.org/t/p/w780${data.value.profile_path}` : undefined)

useCrumbLabel(() => seoTitle.value)

useSeoMeta({
  title: seoTitle,
  ogTitle: seoTitle,
  description: seoDescription,
  ogDescription: seoDescription,
  ogImage: seoImage,
  ogType: 'profile',
})


</script>

<style scoped>

</style>
