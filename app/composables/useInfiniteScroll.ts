import {ref, onMounted, onUnmounted} from "vue"

export const useInfiniteScroll = (callback: () => Promise<void>, pending: Ref<boolean>) => {

    const target = ref<HTMLElement | null>(null)
    let observer: IntersectionObserver | null = null

    onMounted(() => {
        if (!target.value)
            return

        observer = new IntersectionObserver(
            async ([entry]) => {
                if (!entry) return
                if (!entry.isIntersecting) return
                if (pending.value) return
                await callback()
            },
            {rootMargin: "300px"}
        )
        observer.observe(target.value)
    })
    onUnmounted(() => {
        observer?.disconnect()
    })
    return {
        target
    }
}
