<template>
  <!--
    Люди тайтла строками через запятую: актёры, продюсеры, директор, сценаристы.
    Имя — ссылка на персону со всплывающей краткой карточкой (наведение на ПК, нажатие на телефоне).
    Длинный список показывает первые VISIBLE_LIMIT имён и кнопку «ещё N».
  -->
  <!-- Стиль строк — как у фактов в MovieMeta: подпись серым над значением -->
  <dl v-if="groups.length" class="flex flex-col gap-4">
    <div v-for="group in groups" :key="group.key">
      <dt class="text-[14px] text-muted-foreground mb-0.5">{{ group.label }}</dt>
      <!-- [&_a]/[&_span]: глобальное * {font-size:12px} задаёт размер каждой ссылке — наследуем от строки -->
      <dd class="underline text-[15px] md:text-[16px] leading-relaxed text-accent-foreground [&_a]:text-[length:inherit] [&_span]:text-[length:inherit]">
        <template v-for="(person, index) in visibleOf(group)" :key="`${group.key}-${person.id}`">
          <PersonInfoPopover :item="person"/><span v-if="index < visibleOf(group).length - 1">, </span>
        </template>
        <button v-if="group.people.length > VISIBLE_LIMIT"
                type="button"
                @click="toggle(group.key)"
                class="ml-2 text-[14px] text-muted-foreground hover:text-accent-foreground cursor-pointer">
          {{ expanded[group.key] ? 'свернуть' : `ещё ${group.people.length - VISIBLE_LIMIT}` }}
        </button>
      </dd>
    </div>
  </dl>
</template>

<script lang="ts" setup>

import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import PersonInfoPopover from "~/components/widgets/web/person/PersonInfoPopover.vue";

const VISIBLE_LIMIT = 12

// Подпись группы: одна персона — единственное число, несколько — множественное.
const PLURAL: Record<string, string> = {
  'Продюсер': 'Продюсеры',
  'Директор': 'Директора',
  'Сценарист': 'Сценаристы',
  'Исполнительный продюсер': 'Исполнительные продюсеры',
}

const {
  castConverter,
  convertCrewSection,
} = useMovieDetails()

type Group = { key: string, label: string, people: any[] }

const groups = computed<Group[]>(() => {
  const result: Group[] = []
  const cast = castConverter.value || []
  if (cast.length) result.push({key: 'cast', label: cast.length > 1 ? 'Актёры' : 'Актёр', people: cast})
  for (const section of convertCrewSection.value || []) {
    // Один человек может быть указан на одной должности дважды (разные кредиты) — без повторов.
    const seen = new Set<number>()
    const people = section.items.filter((person: any) => !seen.has(person.id) && seen.add(person.id))
    result.push({
      key: `crew-${section.id}`,
      label: people.length > 1 ? (PLURAL[section.title] || section.title) : section.title,
      people,
    })
  }
  return result
})

const expanded = reactive<Record<string, boolean>>({})
const toggle = (key: string) => {
  expanded[key] = !expanded[key]
}
const visibleOf = (group: Group) =>
    expanded[group.key] ? group.people : group.people.slice(0, VISIBLE_LIMIT)

</script>
