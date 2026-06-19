<template>
  <div
       @click.prevent="handleSelect(props.item.key)">
    <div class="relative">
      <img
          :src="`https://img.youtube.com/vi/${props.item.key}/mqdefault.jpg`"
          class="w-full aspect-video object-cover"
          alt=""
      >
      <span class="absolute top-0 right-0 bg-card rounded-bl-xl px-3 py-1 uppercase">{{props.item.iso_639_1}}</span>
      <span class="absolute bottom-0 right-0 bg-card rounded-tl-xl px-3 py-1 uppercase">{{dateIsoConvert(props.item.published_at)}}</span>
    </div>
    <span class="absolute top-0 right-0 h-full opacity-0 w-full cursor-pointer">
    {{ props.item.name }}
    </span>
  </div>
</template>

<script lang="ts" setup>

import type {TmdbTrailer} from "~/types/tmdb.types";
import {dateIsoConvert} from "~/utils/convert/dateIsoConvert";

interface Props {
  item: TmdbTrailer
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [string]
}>()

const handleSelect = (key: string) => {
  emit('select', key)
}

</script>
