<template>
  <!--TODO добавить ссылку-->
  <NuxtLink class="h-50 md:h-max md:w-40 flex relative cursor-pointer shrink-0">
    <NuxtImg :src="`https://image.tmdb.org/t/p/w300/`+person.profile_path"
             class="h-full w-full rounded-md select-none"/>
    <span class="material-symbols-outlined absolute top-1 right-1 md-16 color select-none">
       info
    </span>
    <div class="absolute inset-0 rounded-md
               bg-gradient-to-t
               from-black/60
               via-white/1
               to-white/5"/>
    <p class="text-center text-white w-full px-1
              absolute bottom-5 left-1/2 -translate-x-1/2">
      {{ person.name }}
    </p>
  </NuxtLink>
</template>

<script lang="ts" setup>


import type {TmdbPerson} from "~/types/tmdb.person.types";

interface Props {
  person: TmdbPerson
}

defineProps<Props>()

</script>

<style scoped>

</style>
