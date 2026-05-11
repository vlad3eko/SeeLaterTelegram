<template>
  <div v-if="props.card"
       class="smoothie-card wrap-anywhere border-b border-accent/30 shadow-xl/10 relative cursor-pointer">
    <h2 class="italic">{{ props.card.title }}</h2>
    <p>{{ props.card.method }}</p>
    <div class="rating">
      {{ props.card.rating }}
    </div>

    <div class="flex justify-end">
      <NuxtLink :to="'/update/' + props.card.id">
        <span class="material-symbols-outlined">edit</span>
      </NuxtLink>
      <span @click="deleteCard(props.card.id)"
            class="material-symbols-outlined select-none">delete</span>
    </div>
  </div>
</template>

<script lang="ts" setup>

import type {ISmoothieCard} from "~~/types/smoothie";

const props = defineProps<ISmoothieCard>()
const emit = defineEmits<{
  delete: [id: number]
}>()

const supabase = useSupabaseClient()

const deleteCard = async (id: number) => {
  const {error} = await supabase
      .from('smoothies')
      .delete()
      .eq('id', id)

  if (error) console.log('Ошибка CatalogCard', error)

  emit('delete', id)
}


</script>

<style scoped>

</style>
