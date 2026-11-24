
<template>
  <!-- Описание: на телефоне обрезано до нескольких строк, «Полное описание» раскрывает -->
  <div v-if="data?.overview" class="flex flex-col gap-2">
    <p ref="textRef"
       class="text-[15px] md:text-[16px] leading-relaxed text-accent-foreground/90"
       :class="{'line-clamp-6': !expanded}">
      {{ data.overview }}
    </p>
    <button v-if="clamped || expanded"
            type="button"
            @click="expanded = !expanded"
            class="self-end text-[14px] text-muted-foreground hover:text-accent-foreground cursor-pointer">
      {{ expanded ? 'Свернуть' : 'Полное описание' }}
    </button>
  </div>
</template>

<script lang="ts" setup>

import {useMovieDetails} from "~/composables/movie/useMovieDetails";

const {
  data,
} = useMovieDetails()

const textRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
// Кнопка нужна, только если текст действительно не поместился в 6 строк (на ПК обычно помещается).
const clamped = ref(false)

const measure = () => {
  const el = textRef.value
  clamped.value = !!el && el.scrollHeight > el.clientHeight + 1
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))
watch(() => data.value?.overview, () => {
  expanded.value = false
  nextTick(measure)
})

</script>
