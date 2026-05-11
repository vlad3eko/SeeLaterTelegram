<template>
  <p v-if="!card" class="message loading">загрузка данных..</p>

  <div v-if="card" class="container mx-auto my-10">
    <div class="my-10 flex gap-3 w-max">
      <UiButton @click="emit('updateList','created_at')">Date</UiButton>
      <UiButton @click="emit('updateList','title')">Title</UiButton>
      <UiButton @click="emit('updateList','rating')">Rating</UiButton>
    </div>

    <div class="smoothie-grid">
      <div v-for="smoothie in smoothies" :key="smoothie.id">
        <CatalogCard :card="smoothie" @delete="handleDelete"/>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import CatalogCard from "~/components/widgets/app/catalog/CatalogCard.vue";
import type {ISmoothie, SupabaseSortByType} from "~~/types/smoothie";


const emit = defineEmits<{
  updateList: [val: SupabaseSortByType]
}>()


interface ISmoothieCard {
  card: ISmoothie[]
}

const props = defineProps<ISmoothieCard>()

const smoothies = ref<ISmoothie[]>([])

watch(() => props.card,
    (newCard) => {
      smoothies.value = [...(newCard || [])]
    },
    {immediate: true}
)

const handleDelete = (id: number) => {
  smoothies.value = smoothies.value.filter(
      smoothie => smoothie.id !== id
  )
}

</script>

<style scoped>

</style>
