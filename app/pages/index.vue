<template>
  <CatalogList
      :movies="data?.results || []"
      :loading="loading"
      mode="tmdb"
  />
</template>

<script lang="ts" setup>
import CatalogList from "~/components/widgets/app/catalog/CatalogList.vue";
import type {TmdbResponse} from "~/types/tmdb.types";

const loading = ref(true)
const data = ref<TmdbResponse | null>(null)

onMounted(async () => {

  loading.value = true

  data.value = await $fetch('/api/tmdb/search', {
    query: {
      q: 'Боец'
    }
  })

  loading.value = false
})

</script>

<style scoped>

</style>
