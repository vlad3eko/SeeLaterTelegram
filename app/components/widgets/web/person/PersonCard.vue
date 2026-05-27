<template>
  <NuxtLink :to="formatLink"
            class="relative block min-h-60 shrink-0 overflow-hidden rounded-xl cursor-pointer group">

    <NuxtImg
        :src="imageCheck(props.item)"
        class="absolute inset-0 w-full h-full  object-cover
    transition duration-500 group-hover:scale-105"/>
    <div
        class="absolute inset-0
               bg-gradient-to-t
               from-black/80
               via-black/20
               to-transparent"/>
    <div class="relative">

      <span
          class="absolute text-sm top-2 right-3 bg  bg-panel/80 p-1 px-2 rounded-xl">
      {{formatRating}}
    </span>

    </div>
    <p
        class="absolute bottom-3 left-1/2 -translate-x-1/2
               w-full px-2
               text-center text-sm text-white font-medium
               line-clamp-2">
      {{ item.name }}
    </p>
  </NuxtLink>
</template>

<script lang="ts" setup>
import type {TmdbPerson} from "~/types/tmdb.person.types";
import {createSlug} from "~/utils/createSlug";

interface Props {
  item: TmdbPerson
}

const formatRating = computed(() => {
  return FormatRating(props.item.popularity)
})

const props = defineProps<Props>()

const formatLink = computed<string>(() => {
  return `/person/${createSlug(props.item.id, props.item.name)}`
})
</script>
