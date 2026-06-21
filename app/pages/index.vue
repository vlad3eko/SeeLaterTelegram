<template>
  <SearchPanel v-model="searchInput" @search="searchMovies"/>
  <CatalogList
      :media="x"
      :loading="pending"
  />
</template>

<script lang="ts" setup>
import SearchPanel from "~/components/layout/SearchPanel.vue";
import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import {useTmdbSearch} from "~/composables/useTmdbSearch";

const {
  movies,
  pending,
  searchInput,
  searchMovies
} = useTmdbSearch()


const x = computed(() => {

  const today = new Date().getTime()

  const enriched = movies.value.map(item => {

    const releaseDate = new Date(
        item.release_date || item.first_air_date || 0
    ).getTime()

    const vote = item.vote_count || 0

    const isUnreleased = releaseDate > today

    return {
      ...item,
      _vote: vote,
      _date: releaseDate,
      _isUnreleased: isUnreleased
    }
  })

  // 1. ТОП 3 по рейтингу
  const topRated = [...enriched]
      .sort((a, b) => b._vote - a._vote)
      .slice(0, 3)

  console.log('topRated', topRated)

  const topIds = new Set(topRated.map(i => i.id))

  console.log('topIds', topIds)

  // 2. НЕВЫШЕДШИЕ (но не из топ-3)
  const unreleased = enriched
      .filter(i => i._isUnreleased && !topIds.has(i.id))
      .sort((a, b) => b._date - a._date)

  console.log('unreleased', unreleased)

  // 3. ОСТАЛЬНЫЕ
  const others = enriched
      .filter(i => !i._isUnreleased && !topIds.has(i.id))
      .sort((a, b) => b._vote - a._vote)

  console.log('others', others)

  return [
    ...unreleased,
    ...topRated,
    ...others
  ]
})

</script>

<style scoped>

</style>
