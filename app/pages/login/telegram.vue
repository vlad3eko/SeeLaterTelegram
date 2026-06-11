<template>
  <div class="flex justify-start flex-col items-center">
    {{ user.data }}
  </div>
</template>

<script setup lang="ts">
import {useUserStore} from "~/stores/user.store";

const user = useUserStore()
</script>

