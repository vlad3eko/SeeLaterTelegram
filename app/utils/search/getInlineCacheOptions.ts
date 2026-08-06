import {SearchStrategy} from "~/utils/search/strategy/enums";

export const getInlineCacheOptions = (strategy:string)=>{
    switch(strategy){

        case SearchStrategy.BOOKMARKS:

            return {
                cache_time:0,
                is_personal:true
            }

        case SearchStrategy.POPULAR:
            return {
                cache_time:600,
                is_personal:false
            }

        default:

            return {
                cache_time:300,
                is_personal:false
            }
    }
}
