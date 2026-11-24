
<template>
  <NuxtLayout>
    <NuxtPage/>
  </NuxtLayout>
</template>

<script lang="ts" setup>
import {useUserStore} from "~/stores/user.store";

const user = useUserStore()

// Общие мета-теги: страницы задают свой title/description, остальное — по умолчанию.
useHead({
  titleTemplate: (title?: string) => title ? `${title} — Киноманов` : 'Киноманов — фильмы и сериалы',
  htmlAttrs: {lang: 'ru'},
})

useSeoMeta({
  description: 'Фильмы и сериалы: трейлеры, актёры, съёмочная группа и подборки. Сохраняйте и получайте уведомления в Telegram.',
  ogSiteName: 'Киноманов',
  ogType: 'website',
  twitterCard: 'summary_large_image',
})

onMounted(user.refresh)

</script>

<style>

body {
  margin: 0;
  color: var(--color-accent-foreground);
  background-color: var(--color-background);
  font-family: 'Poppins', sans-serif;
}
</style>
