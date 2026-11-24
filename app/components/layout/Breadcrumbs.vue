<template>
  <!--
    Хлебные крошки: история переходов (до 5), последняя — текущая страница.
    Клик по крошке возвращает к ней и обрезает цепочку (как курсор в истории), новой крошки нет.
    Телефон: видны последние 3, всё умещается по ширине — текущая страница в приоритете,
    остальные сжимаются с многоточием (без прокрутки вбок).
    Высота зарезервирована и на сервере (крошки берутся из sessionStorage только в браузере).
  -->
  <!-- div, не nav: глобальный стиль nav в smoothies.css (фон, отступы) перебивает утилиты -->
  <div role="navigation" aria-label="Путь по сайту"
       class="h-10 border-t border-accent-foreground/10 bg-accent/90 backdrop-blur px-3 text-[13px] md:text-[14px]">
    <ol class="flex h-full min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap md:justify-center">
      <li v-for="(crumb, index) in crumbs" :key="`${index}-${crumb.path}`"
          class="items-center gap-1"
          :class="[
            index < crumbs.length - MOBILE_CRUMBS ? 'hidden md:flex' : 'flex',
            index === crumbs.length - 1 ? 'shrink-0 max-w-[60%] md:max-w-none' : 'min-w-0 shrink',
          ]">
        <span v-if="index > 0" aria-hidden="true"
              class="shrink-0 opacity-40"
              :class="{'hidden md:inline': index === crumbs.length - MOBILE_CRUMBS}">›</span>
        <span v-if="index === crumbs.length - 1"
              aria-current="page"
              :title="crumb.label"
              class="block min-w-0 truncate font-semibold md:max-w-[24rem]">
          {{ crumb.label }}
        </span>
        <!-- a, а не NuxtLink: переход ведём сами — сначала обрезаем цепочку, потом идём -->
        <a v-else
           :href="crumb.path"
           :title="crumb.label"
           @click="goTo($event, index, crumb.path)"
           class="block min-w-0 truncate opacity-70 transition hover:text-primary hover:opacity-100 md:max-w-[22rem]">
          {{ crumb.label }}
        </a>
      </li>
    </ol>
  </div>
</template>

<script lang="ts" setup>

import {isNavigationFailure} from "vue-router";
import {MOBILE_CRUMBS} from "~/composables/useBreadcrumbs";

const route = useRoute()
const router = useRouter()
const {crumbs, restore, visit, jumpTo} = useBreadcrumbs()

// Без хэша: прокрутка к якорю на той же странице — не новый переход.
const currentPath = () => route.fullPath.split('#')[0] || '/'

// Переход кнопками браузера «Назад»/«Вперёд» (popstate приходит раньше смены маршрута).
let historyNavigation = false
const onPopState = () => {
  historyNavigation = true
}

onMounted(() => {
  restore()
  visit(currentPath())
  window.addEventListener('popstate', onPopState)
  watch(currentPath, path => {
    visit(path, historyNavigation)
    historyNavigation = false
  })
})
onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))

const goTo = async (event: MouseEvent, index: number, path: string) => {
  // Ctrl/Shift/средняя кнопка — новая вкладка/окно: здесь ничего не меняем.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const undo = jumpTo(index)
  try {
    const failure = await router.push(path)
    if (isNavigationFailure(failure)) undo()
  } catch {
    undo()
  }
}

</script>
