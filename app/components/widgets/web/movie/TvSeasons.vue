<template>
  <div v-if="isTv && (seasons.length || nextEpisode)" class="w-full">

    <p class="text-[18px] md:text-[22px] p-3 font-semibold leading-tight">
      Сезоны<sup v-if="seasons.length" class="text-xs md:text-sm font-semibold text-muted-foreground">({{ seasons.length }})</sup>
    </p>
    <div class="border-b my-1 border-accent-foreground/20"/>

    <div class="flex flex-wrap gap-2 md:gap-3 p-3 text-[13px] md:text-[14px]">
      <span v-if="statusLabel" class="bg-shell rounded-xl px-3 py-2">{{ statusLabel }}</span>
      <span v-if="nextEpisode" class="bg-primary text-primary-foreground rounded-xl px-3 py-2 font-bold">
        Следующая серия: {{ nextEpisode }}
      </span>
      <span v-else-if="lastEpisode" class="bg-shell rounded-xl px-3 py-2">
        Последняя серия: {{ lastEpisode }}
      </span>
    </div>

    <!-- На телефоне 3 в ряд (постер на всю ширину занимал экран целиком), на ПК — сетка от 150px -->
    <div class="grid gap-2 md:gap-3 p-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
      <div v-for="season in seasons" :key="season.id"
           class="bg-shell rounded-xl overflow-hidden flex flex-col">
        <!-- Оценка на постере — как бейдж у карточек тайтлов -->
        <div class="relative">
          <NuxtImg v-if="season.poster_path"
                   :src="`https://image.tmdb.org/t/p/w342${season.poster_path}`"
                   :alt="season.name"
                   loading="lazy"
                   class="w-full aspect-[2/3] object-cover"/>
          <div v-else class="w-full aspect-[2/3] bg-panel"/>
          <span v-if="season.vote_average"
                class="absolute top-1.5 right-1.5 md:top-2 md:right-2 rounded-full bg-black/60 px-1.5 md:px-2.5 py-0.5 text-[10px] md:text-xs font-bold text-white backdrop-blur-sm">
            💎 {{ FormatRating(season.vote_average) }}
          </span>
        </div>
        <div class="p-2 md:p-3 flex flex-col gap-0.5 md:gap-1">
          <p class="font-bold text-[13px] md:text-[15px] leading-tight line-clamp-2">{{ season.name }}</p>
          <p class="text-muted-foreground text-[11px] md:text-[13px]">
            <span v-if="season.episode_count">{{ episodesLabel(season.episode_count) }}</span>
            <span v-if="season.air_date"> · {{ season.air_date.slice(0, 4) }}</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import {dateConvert} from "~/utils/convert/dateConvert";

const {data} = useMovieDetails()

const item = computed<any>(() => data.value)

const isTv = computed(() => item.value?.media_type === 'tv')

// «Спецвыпуски» (сезон 0) — в конец, остальные по номеру.
const seasons = computed<any[]>(() =>
    [...(item.value?.seasons || [])]
        .filter((season: any) => season.episode_count > 0)
        .sort((a: any, b: any) => (a.season_number || 999) - (b.season_number || 999)))

const STATUS: Record<string, string> = {
  'Returning Series': '🟢 Продолжается',
  'In Production': '🎬 В производстве',
  'Planned': '🗓 Запланирован',
  'Ended': '⚪ Завершён',
  'Canceled': '⛔ Закрыт',
  'Pilot': '🎬 Пилот',
}

const statusLabel = computed(() => STATUS[item.value?.status] || '')

const episodeLabel = (episode: any) => {
  if (!episode) return ''
  const code = `S${String(episode.season_number).padStart(2, '0')}E${String(episode.episode_number).padStart(2, '0')}`
  return episode.air_date ? `${dateConvert(episode.air_date)} (${code})` : code
}

const nextEpisode = computed(() => episodeLabel(item.value?.next_episode_to_air))
const lastEpisode = computed(() => episodeLabel(item.value?.last_episode_to_air))

const episodesLabel = (count: number) => {
  const mod10 = count % 10
  const mod100 = count % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'серия'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'серии'
          : 'серий'
  return `${count} ${word}`
}

</script>
