<template>
  <div class="flex justify-start flex-col items-center">
    {{ user }}
  </div>
</template>

<script setup lang="ts">
import {useAuth} from "~/composables/auth/useAuth";

const {user} = useAuth()
</script>

