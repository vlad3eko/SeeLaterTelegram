
<template>
  <!-- Сворачиваемый блок (collapsible): заголовок — кнопка, справа стикер «Свернуть / Развернуть» -->
  <button v-if="props.collapsible"
          type="button"
          @click="collapsed = !collapsed"
          :aria-expanded="!collapsed"
          class="group w-full text-left p-3 font-semibold flex items-center gap-3 cursor-pointer">
    <!-- Размер — на тексте: глобальные стили кнопок перебивают унаследованный -->
    <!-- Число — надстрочно в той же строке: при переносе длинного заголовка не отрывается от него -->
    <span class="min-w-0 text-[18px] md:text-[22px] font-semibold leading-tight">
      {{ title }}<sup v-if="props.items?.length && props.showTitle" class="text-xs md:text-sm font-semibold text-muted-foreground">({{props.items.length}})</sup>
    </span>
    <span class="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-shell/70 px-3 py-1 text-xs font-semibold
                 text-muted-foreground transition group-hover:bg-panel group-hover:text-accent-foreground">
      <span class="material-symbols-outlined md-16 transition-transform duration-300"
            :class="{'-rotate-90': collapsed}">expand_more</span>
      {{ collapsed ? 'Развернуть' : 'Свернуть' }}
    </span>
  </button>
  <!-- Заголовки блоков: 18/22px (rem на сайте = 12px, поэтому в пикселях) -->
  <p v-else class="text-[18px] md:text-[22px] p-3 font-semibold leading-tight">
    {{ title }}<sup v-if="props.items?.length && props.showTitle" class="text-xs md:text-sm font-semibold text-muted-foreground">({{props.items.length}})</sup>
  </p>

  <div class="border-b my-1 border-accent-foreground/20"/>
  <!-- Сворачивание через высоту (grid 0fr/1fr): слайдер не пересоздаётся и не теряет размеры -->
  <div class="grid transition-[grid-template-rows] duration-300 ease-out"
       :class="collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'"
       :inert="collapsed || undefined">
    <div class="min-h-0 overflow-hidden">
    <div class="relative p-3">
  <ClientOnly>
      <swiper-container ref="swiperRef" :init="false"
                        class="overflow-hidden relative">
        <swiper-slide v-for="(item, index) in props.items"
                      :id="item.id"
                      class="w-50 md:h-full md:w-53">
          <slot :item="item" :index="index"/>
        </swiper-slide>
      </swiper-container>
  </ClientOnly>
    </div>
    </div>
  </div>

  <!-- TODO разобрать что это и как использовать -->
  <!--{{ credits.cast[0].known_for_department }}-->
  <!--{{ credits.cast[0].character }}-->
  <!--{{ credits.cast[0].order }}-->
</template>

<script lang="ts" setup>

// TODO поставил заглушку any[] ругается родительский [slug]
interface HorizontalScrollItem {
  title?: string
  items?: any[]
  showTitle?: boolean
  // Блок можно свернуть нажатием на заголовок; defaultCollapsed — свёрнут при открытии страницы.
  collapsible?: boolean
  defaultCollapsed?: boolean
}

const props = withDefaults(defineProps<HorizontalScrollItem>(), {
  showTitle: true,
  collapsible: false,
  defaultCollapsed: false,
})

const collapsed = ref(props.collapsible && props.defaultCollapsed)

const swiperRef = ref<null>(null)

// Прокрутка по кругу — только для длинных полок: на коротких (2 продюсера) Swiper не может
// замкнуть круг, ругается в консоли и прокручивается рывками.
const LOOP_MIN_SLIDES = 10

const swiper = useSwiper(swiperRef, {
  effect: 'slide',
  loop: (props.items?.length ?? 0) >= LOOP_MIN_SLIDES,

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
