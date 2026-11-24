
<template>
  <SearchPanel v-model="searchInput" @search="onSearch"/>

  <!-- Поиск -->
  <template v-if="mode === 'search'">
    <CatalogList :media="movies" :loading="pending" :show-info="true"/>
    <p v-if="!pending && !movies.length" class="text-center text-muted-foreground my-10">
      Ничего не нашлось. Попробуйте другое название.
    </p>
  </template>

  <!-- Каталог: жанр, тип (фильмы/сериалы), страна -->
  <template v-else-if="mode === 'genre'">
    <div class="max-w-7xl mx-auto px-3 mb-6 flex flex-wrap items-center gap-3">
      <h1 class="text-[24px] md:text-[30px] font-semibold leading-tight">
        {{ genreTitle }}
      </h1>
      <NuxtLink to="/" class="text-primary hover:underline">← на главную</NuxtLink>
    </div>
    <CatalogList :media="genreItems" :loading="genrePending" :show-info="true"/>
  </template>

  <!-- Главная: полки -->
  <section v-else class="flex flex-col gap-4 px-3 md:px-8 pb-10 overflow-hidden">
    <MediaShelf title="🔥 В тренде за неделю" kind="trending" media="all"/>
    <MediaShelf title="🎟 Скоро в кино" kind="upcoming" media="movie"/>
    <MediaShelf title="🎬 Сейчас в кино" kind="now_playing" media="movie"/>
    <MediaShelf title="📺 Новые серии" kind="on_the_air" media="tv"/>
    <MediaShelf title="⭐ Лучшие фильмы" kind="top_rated" media="movie"/>
    <MediaShelf title="⭐ Лучшие сериалы" kind="top_rated" media="tv"/>
  </section>

  <div ref="loadMoreTrigger"></div>
</template>

<script lang="ts" setup>
import SearchPanel from "~/components/layout/SearchPanel.vue";
import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import MediaShelf from "~/components/widgets/web/shelf/MediaShelf.vue";
import {useTmdbSearch} from "~/composables/useTmdbSearch";
import {useInfiniteScroll} from "~/composables/useInfiniteScroll";

const route = useRoute()
const router = useRouter()

const {
  movies,
  pending,
  searchInput,
  searchMovies,
  loadMore
} = useTmdbSearch()

/*
 * Режим страницы: поиск (есть запрос), каталог, иначе полки.
 * Каталог: ?genre=&media= (жанр), ?media=movie|tv (все фильмы / сериалы), ?country=US&media=all (страна).
 */
const genreId = computed(() => Number(route.query.genre) || 0)
const countryCode = computed(() => {
  const value = String(route.query.country || '')
  return /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : ''
})
const genreMedia = computed<'movie' | 'tv' | 'all'>(() =>
    route.query.media === 'tv' ? 'tv' : route.query.media === 'all' && !genreId.value ? 'all' : 'movie')
const genreName = computed(() => String(route.query.name || ''))
const browsing = computed(() => !!genreId.value || !!countryCode.value
    || route.query.media === 'movie' || route.query.media === 'tv' || route.query.media === 'all')

const searching = ref(false)

const mode = computed(() => searching.value ? 'search' : browsing.value ? 'genre' : 'home')

const onSearch = async () => {
  searching.value = !!searchInput.value.trim()
  if (searching.value && browsing.value) await router.replace('/')
  await searchMovies()
}

// Пустой запрос возвращает на главную.
watch(searchInput, (value) => {
  if (!value.trim()) searching.value = false
})

/* ---------- Жанр ---------- */

const genreItems = ref<any[]>([])
const genrePage = ref(0)
const genreTotal = ref(1)
const genrePending = ref(false)

const genreTitle = computed(() => {
  const kind = genreMedia.value === 'tv' ? 'Сериалы' : genreMedia.value === 'all' ? 'Фильмы и сериалы' : 'Фильмы'
  return genreName.value ? `${kind}: ${genreName.value}` : kind
})

// Ключ текущей подборки: ответы на прошлую подборку (после перехода) отбрасываются.
const browseKey = computed(() => `${genreMedia.value}|${genreId.value}|${countryCode.value}`)

const loadGenre = async (reset = false) => {
  // Смена подборки (reset) не ждёт запрос прошлой — его ответ всё равно будет отброшен.
  if (!browsing.value || (genrePending.value && !reset)) return
  if (reset) {
    genreItems.value = []
    genrePage.value = 0
    genreTotal.value = 1
  }
  if (genrePage.value >= genreTotal.value) return

  const key = browseKey.value
  // «Фильмы и сериалы» (страна): обе ленты discover постранично, страница сводится по популярности.
  const medias = genreMedia.value === 'all' ? ['movie', 'tv'] : [genreMedia.value]
  genrePending.value = true
  try {
    const nextPage = genrePage.value + 1
    const pages: any[] = await Promise.all(medias.map(media => $fetch('/api/tmdb/discover', {
      query: {
        media,
        with_genres: genreId.value || undefined,
        with_origin_country: countryCode.value || undefined,
        sort_by: 'popularity.desc',
        page: nextPage,
      }
    }).catch(() => null)))
    if (key !== browseKey.value) return
    const results = pages
        .flatMap((data: any) => data?.results || [])
        .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
    // id фильма и сериала могут совпасть — уникальность по паре тип+id.
    const seen = new Set(genreItems.value.map((item: any) => `${item.media_type}-${item.id}`))
    genreItems.value.push(...results.filter((item: any) => item.poster_path && !seen.has(`${item.media_type}-${item.id}`)))
    genrePage.value = nextPage
    genreTotal.value = Math.min(Math.max(1, ...pages.map((data: any) => data?.total_pages || 1)), 500)
  } catch (error) {
    console.error('[GENRE LOAD ERROR]', error)
  } finally {
    if (key === browseKey.value) genrePending.value = false
  }
}

// Подборка грузится в браузере (как и поиск), иначе серверная отрисовка не совпадёт с клиентской.
const startGenre = () => {
  if (browsing.value) {
    searching.value = false
    loadGenre(true)
  }
}
watch(browseKey, startGenre)
onMounted(startGenre)

// Крошка: «Главная» или выбранный жанр
useCrumbLabel(() => mode.value === 'genre' && genreTitle.value ? genreTitle.value : 'Главная')

useSeoMeta({
  title: computed(() => mode.value === 'genre' ? genreTitle.value : ''),
})

/* ---------- Подгрузка ---------- */

const pendingAny = computed(() => mode.value === 'genre' ? genrePending.value : pending.value)

const {
  target: loadMoreTrigger
} = useInfiniteScroll(
    async () => {
      if (mode.value === 'search') await loadMore()
      else if (mode.value === 'genre') await loadGenre()
    },
    pendingAny
)
</script>

<style scoped>

</style>
