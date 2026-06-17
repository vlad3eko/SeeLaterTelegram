<template>
  <button
      :class="classes">
    <slot/>
  </button>
</template>

<script lang="ts" setup>

interface Prop {
  variant?: 'primary' | 'secondary'
}

const props = withDefaults(defineProps<Prop>(), {
  variant: 'primary'
})
const classes = computed(() => {
  const base = ' rounded-4xl overflow-hidden self-center rounded-xl cursor-pointer py-2 px-3'

  const variants = {
    primary: 'bg-primary text-accent hover:bg-focus w-full',
    secondary: 'w-max p-3 mr-3 text-accent-foreground hover:bg-panel bg-shell text-center'
  }

  return [
    base,
    variants[props.variant]
  ].join(' ')
})


</script>

<style scoped>

</style>
