<template>

  <h1 class="text-2xl md:text-4xl font-bold">
    {{ title }}
  </h1>

  <div class="border-b border-accent-foreground/20"/>
    <div class="relative">
  <ClientOnly>
      <swiper-container ref="swiperRef" :init="false"
                        class="overflow-hidden relative ">
        <swiper-slide v-for="item in items"
                      :id="item.id"
                      class="w-max md:h-max md:w-40 h-50">
          <component :is="component" :item="item"/>
        </swiper-slide>
      </swiper-container>
  </ClientOnly>
    </div>

  <!-- TODO разобрать что это и как использовать -->
  <!--{{ credits.cast[0].known_for_department }}-->
  <!--{{ credits.cast[0].character }}-->
  <!--{{ credits.cast[0].order }}-->
</template>

<script lang="ts" setup>

interface BaseItem {
  id: string
}

// MARKER поставил заглушку any[] ругается родительский [slug]
interface HorizontalScrollItem {
  title: string
  items?: BaseItem[] | any[]
  component: Component
}

defineProps<HorizontalScrollItem>()

const swiperRef = ref<null>(null)

const swiper = useSwiper(swiperRef, {
  effect: 'slide',
  loop: true,

  // autoplay: {
  //   delay: 2000,
  //   disableOnInteraction: false
  // },
  //
  // freeMode: true,
  // speed: 20000,

  slidesPerView: "auto",
  spaceBetween: 9
})

</script>

<style scoped>

</style>
