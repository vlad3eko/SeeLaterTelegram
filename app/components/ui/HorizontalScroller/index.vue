<template>
  <p class="text-2xl md:text-4xl p-3 font-bold flex items-start">
    {{ title }}
    <span v-if="items?.length" class="text-xl">({{items.length}})</span>
  </p>

  <div class="border-b my-1 border-accent-foreground/20"/>
    <div class="relative p-3">
  <ClientOnly>
      <swiper-container ref="swiperRef" :init="false"
                        class="overflow-hidden relative">
        <swiper-slide v-for="(item, index) in items"
                      :id="item.id"
                      class="w-50 md:h-full  md:w-53">
          <slot :item="item" :index="index"/>
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

// TODO поставил заглушку any[] ругается родительский [slug]
interface HorizontalScrollItem {
  title?: string
  items?: any[]
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
