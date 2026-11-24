<template>
  <!--
    Шапка и хлебные крошки прилипают к верху одним блоком (sticky): при прокрутке шапка
    тянет крошки за собой. Высоту блока пишем в --site-chrome-h — по ней липкие элементы страниц
    (постер тайтла, фото человека) встают под шапку, а не под неё прячутся.
  -->
  <div ref="chromeRef" class="sticky top-0 z-50 shadow-sm">
    <Nav/>
    <Breadcrumbs/>
  </div>
  <div class="relative">
    <slot/>
  </div>
</template>
<script lang="ts" setup>

import Nav from "~/components/layout/Nav.vue";
import Breadcrumbs from "~/components/layout/Breadcrumbs.vue";

const chromeRef = ref<HTMLElement | null>(null)

let observer: ResizeObserver | undefined
onMounted(() => {
  if (!chromeRef.value) return
  // Шапка на телефоне переносится в две строки — высота меняется с шириной.
  observer = new ResizeObserver(([entry]) => {
    const height = Math.round(entry!.target.getBoundingClientRect().height)
    document.documentElement.style.setProperty('--site-chrome-h', `${height}px`)
  })
  observer.observe(chromeRef.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style>
/* Якоря и прокрутка к элементам не уезжают под липкую шапку */
html {
  scroll-padding-top: var(--site-chrome-h, 0px);
}
</style>
