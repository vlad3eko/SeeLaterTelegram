<template>
  <div v-if="fetchData">
    <SmoothiesCreate :card="fetchData" mode="update"/>
  </div>
  <p v-if="!fetchData" class="message text-center loading">загрузка данных..</p>
</template>

<script lang="ts" setup>


import type {ISmoothie} from "~~/types/smoothie";
import SmoothiesCreate from "~/components/layout/SmoothiesCreate.vue";

const id = Number(useRoute().params.id)
const supabase = useSupabaseClient()
const fetchData = ref<ISmoothie | null>(null)

const fetch = async (id: number) => {
  const {data, error} = await supabase
      .from('smoothies')
      .select()
      .eq('id', id)
      .single()

  if (error) {
    await navigateTo('/')
  } else if (data) {
      fetchData.value = data
    }
}

onMounted(() => {
  fetch(id)
})
</script>

<style scoped>

</style>
