<template>
  <section class="page create">
    <form @submit.prevent="handleSubmit">
      <label for="title">Title: </label>
      <input
          type="text"
          id="title"
          v-model="form.title"/>
      <p v-if="!form.title" class="message error">{{ errorMessage }}</p>

      <label for="method">Method: </label>
      <textarea
          id="method"
          v-model="form.method"/>
      <p v-if="!form.method" class="message error">{{ errorMessage }}</p>

      <label for="rating">Rating: </label>
      <input
          type="number"
          id="rating"
          v-model="form.rating"/>
      <p v-if="form.rating === null" class="message error">{{ errorMessage }}</p>

      <UiButton>{{ buttonText }}</UiButton>
      <p v-if="successMessage" class="message text-green-700">{{ successMessage }}</p>
      <p v-if="successRedirect" class="message text-green-700">{{ successRedirect }}</p>

    </form>

  </section>
</template>

<script setup lang="ts">

import type {ISmoothie} from "~~/types/smoothie";

export type ISmoothiesMode = 'create' | 'update'

export interface ISmoothieCreate {
  mode: ISmoothiesMode
  card?: Pick<ISmoothie, 'id' | 'title' | 'method' | 'rating'>
}

const props = defineProps<ISmoothieCreate>()

const supabase = useSupabaseClient()


const errorMessage = ref<string>('')
const successMessage = ref<string>('')
const successRedirect = ref<string>('')

const form = reactive({
  title: props.card?.title || '',
  method: props.card?.method || '',
  rating: props.card?.rating || null
})

const payload = computed(() => ({
  title: form.title,
  method: form.method,
  rating: form.rating,
}))

const buttonText = computed(() => {
  return props.mode === 'create'
      ? 'Создать карточку'
      : 'Редактироать карточку'
})

const handleSubmit = async () => {
  if (
      !form.title.trim() ||
      !form.method.trim() ||
      form.rating === null)
  {
    errorMessage.value = 'Заполните пустое поле'
    return
  }
  errorMessage.value = ''

  let response

  if (props.mode === 'create') {
    response = await supabase
        .from('smoothies')
        .insert(payload.value)
        .select()
  } else if (props.mode === 'update' && props.card?.id) {
    response = await supabase
        .from('smoothies')
        .update(payload.value)
        .eq('id', props.card.id)
        .select()
  }

  if (!response) return

  const {data, error} = response

  if (error) {
    console.log('Ошибка create', error)
    return
  }

  if (data) {

    form.title = ''
    form.method = ''
    form.rating = null
    successMessage.value = `Данные успешно отправлены`
  }
}
</script>

<style scoped>

</style>
