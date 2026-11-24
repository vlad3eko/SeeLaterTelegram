<template>
  <div v-if="items.length" class="w-full">
    <UiHorizontalScroller :title="props.title" :items="items" :show-title="false" v-slot="{item}">
      <CatalogCard :media="item" :mark-upcoming="props.markUpcoming"/>
    </UiHorizontalScroller>
  </div>
</template>

<script lang="ts" setup>

import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";

// Полка тайтлов из /api/tmdb/list (trending, upcoming, recommendations, similar…).
const props = defineProps<{
  title: string
  kind: string
  media: 'movie' | 'tv' | 'all'
  id?: number | string
  limit?: number
  markUpcoming?: boolean
}>()

const {data} = useAsyncData<{ results: any[] }>(
    `shelf-${props.kind}-${props.media}-${props.id || 0}`,
    () => $fetch('/api/tmdb/list', {
      query: {kind: props.kind, media: props.media, id: props.id}
    }),
    {lazy: true, default: () => ({results: []})}
)

// Без постера карточка выглядит пустой — такие на полке не показываем.
const items = computed(() =>
    (data.value?.results || [])
        .filter((item: any) => item.poster_path)
        .slice(0, props.limit || 20))

</script>
