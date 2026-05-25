<template>
  <NuxtLink :to="formatLink"
            class="relative block w-full h-60 shrink-0 overflow-hidden rounded-xl cursor-pointer group">

    <NuxtImg
        :src="imageCheck(props.item)"
        class="absolute inset-0 w-full h-full object-cover
    transition duration-500 group-hover:scale-105"/>
    <div
        class="absolute inset-0
               bg-gradient-to-t
               from-black/80
               via-black/20
               to-transparent"/>
    <span
        class="material-symbols-outlined
               absolute top-2 right-2
               transition select-none md-16">
        info
    </span>
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


const props = defineProps<Props>()

const formatLink = computed<string>(() => {
  return `/person/${createSlug(props.item.id, props.item.name)}`
})
</script>
