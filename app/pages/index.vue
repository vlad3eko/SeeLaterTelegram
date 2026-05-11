<template>
  <section>
    <CatalogList :card="smoothies || []" @updateList="sortByFunc"/>
  </section>
</template>

<script lang="ts" setup>

import CatalogList from "~/components/widgets/app/catalog/CatalogList.vue";
import type {SupabaseSortByType} from "~~/types/smoothie";

const supabase = useSupabaseClient()

const smoothies = ref(null)

const sortBy = ref<SupabaseSortByType>('created_at')

const sortByFunc = async (val: SupabaseSortByType) => {
  sortBy.value = val
  await getSmoothies()
}

async function getSmoothies() {
  const {data, error} = await supabase
      .from('smoothies')
      .select()
      .order(sortBy.value, {ascending: false})

  if (error) {
    console.log('Ошибка: ', error.message)
    return
  }
  smoothies.value = data
}

onMounted(() => {
  getSmoothies()
})

</script>

<style scoped>

</style>
