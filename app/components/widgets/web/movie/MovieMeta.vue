
<template>
  <!--
    Факты о тайтле: подпись серым над значением, значения текстом через запятую.
    Жанр, страна и тип — ссылки на каталог (подборка жанра, фильмы и сериалы страны, все фильмы/сериалы).
  -->
  <!-- В строку с переносом: факты стоят под людьми и не тянут длинную колонку -->
  <dl class="flex flex-wrap gap-x-10 gap-y-4">
    <div v-if="countries.length">
      <dt :class="labelClass">{{ countries.length > 1 ? 'Страны' : 'Страна' }}</dt>
      <dd :class="valueClass">
        <template v-for="(country, index) in countries" :key="country.code">
          <NuxtLink :to="{path: '/', query: {country: country.code, media: 'all', name: country.name}}"
                    :title="`Фильмы и сериалы: ${country.name}`"
                    :class="linkClass">{{ country.name }}</NuxtLink><span v-if="index < countries.length - 1">, </span>
        </template>
      </dd>
    </div>

    <div v-if="data?.genres?.length">
      <dt :class="labelClass">{{ data.genres.length > 1 ? 'Жанры' : 'Жанр' }}</dt>
      <dd :class="valueClass">
        <template v-for="(genre, index) in data.genres" :key="genre.id">
          <NuxtLink :to="{path: '/', query: {genre: genre.id, media: mediaKind, name: genre.name}}"
                    :title="`Все: ${genre.name}`"
                    :class="linkClass">{{ capitalize(genre.name) }}</NuxtLink><span v-if="index < data.genres.length - 1">, </span>
        </template>
      </dd>
    </div>

    <div>
      <dt :class="labelClass">Тип</dt>
      <dd :class="valueClass">
        <NuxtLink :to="{path: '/', query: {media: mediaKind}}"
                  :title="mediaKind === 'tv' ? 'Все сериалы' : 'Все фильмы'"
                  :class="linkClass">{{ capitalize(mediaTypeConvert(data?.media_type)) }}</NuxtLink>
      </dd>
    </div>

    <div>
      <dt :class="labelClass">Дата выхода</dt>
      <dd :class="valueClass">{{ mediaReleaseConvert(data) }}</dd>
    </div>

    <div v-if="duration">
      <dt :class="labelClass">{{ mediaKind === 'tv' ? 'Сезоны / серии' : 'Продолжительность' }}</dt>
      <dd :class="valueClass">{{ duration }}</dd>
    </div>
  </dl>
</template>

<script lang="ts" setup>

import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import {mediaDurationConvert, mediaReleaseConvert, mediaTypeConvert} from "~/utils/convert/mediaConvert";

const {
  data,
} = useMovieDetails()

// Общий стиль строк блока описания (тот же — у людей в MovieGetRoleByMovieSection).
const labelClass = 'text-[14px] text-muted-foreground mb-0.5'
// [&_a]/[&_span]: глобальное * {font-size:12px} в main.css задаёт размер каждой ссылке — наследуем от строки
const valueClass = 'text-[15px] md:text-[16px] leading-relaxed text-accent-foreground [&_a]:text-[length:inherit] [&_span]:text-[length:inherit]'
const linkClass = 'hover:text-primary transition underline'

const mediaKind = computed(() => data.value?.media_type === 'tv' ? 'tv' : 'movie')

const capitalize = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1) : value

const duration = computed(() => {
  const value = String(mediaDurationConvert(data.value) || '').trim()
  return value && value !== '0' ? value : ''
})

// TMDB отдаёт названия стран по-английски даже при language=ru-RU — берём русское по коду ISO.
const regionNames = new Intl.DisplayNames(['ru'], {type: 'region'})
const countries = computed(() => (data.value?.production_countries || []).map((country: any) => {
  const code = String(country.iso_3166_1 || '')
  let name = country.name
  try {
    name = (code && regionNames.of(code)) || country.name
  } catch {
    // неизвестный код — остаётся название TMDB
  }
  return {code, name}
}))

</script>
