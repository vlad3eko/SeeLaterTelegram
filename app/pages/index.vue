<template>
  <SearchPanel v-model="searchInput" @search="searchMovies"/>
  <CatalogList
      :media="filterMedia"
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

const filterMedia = computed(() => {

  const today = new Date().getTime()

  const enriched = movies.value.map(item => {

    const dateCheck = 'release_date' in item
        ? item.release_date
        : item.first_air_date

    const releaseDate = new Date(dateCheck || 0).getTime()
    const vote = item.vote_count || 0
    const isUnreleased = releaseDate > today

    return {
      ...item,
      _vote: vote,
      _date: releaseDate,
      _isUnreleased: isUnreleased
    }
  })
  const topRanked = [...enriched]
      .sort((a, b) => b._vote - a._vote)
      .slice(0, 3)

  const topIds = new Set(topRanked.map(i => i.id))

  const unreleased = enriched
      .filter(media => media._isUnreleased && !topIds.has(media.id))
      .sort((a, b) => b._vote - a._vote)

  const others = enriched
      .filter(media => !media._isUnreleased && !topIds.has(media.id))
      .sort((a, b) => b._vote - a._vote)

  return [
    ...unreleased,
    ...topRanked,
    ...others
  ]
})


</script>

<style scoped>

</style>
