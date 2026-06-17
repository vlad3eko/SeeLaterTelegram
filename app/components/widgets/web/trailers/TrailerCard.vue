<template>
  <div class="relative"
       @click.prevent="handleSelect(props.item.key)">
    <iframe v-if="props.item.key"
            class="w-full aspect-video md:h-[150px]"
            :src="`https://www.youtube.com/embed/${props.item.key}`"
            allowfullscreen/>
    <span class="absolute top-0 right-0 h-full opacity-0 w-full cursor-pointer">
    {{ props.item.name }}
    </span>
  </div>
</template>

<script lang="ts" setup>

import type {TmdbTrailer} from "~/types/tmdb.types";

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
