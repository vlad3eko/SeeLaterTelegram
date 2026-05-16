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
const trailer = ref(null)

onMounted(async () => {

  loading.value = true

  data.value = await $fetch('/api/tmdb/search', {
    query: {
      q: 'Побег'
    }
  })

  loading.value = false
})

</script>

<style scoped>

</style>
