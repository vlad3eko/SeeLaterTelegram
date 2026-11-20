import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseChannelsEnv, youtubeQueueConfig} from '../../engine/youtube/config'

test('очередь YouTube: русские каналы по умолчанию приоритетные, «*» в YOUTUBE_WATCH_CHANNELS', () => {
    const saved = process.env.YOUTUBE_WATCH_CHANNELS
    delete process.env.YOUTUBE_WATCH_CHANNELS
    try {
        const priority = youtubeQueueConfig().channels.filter(channel => channel.priority)
        assert.deepEqual(priority.map(channel => channel.name), ['KinomanTrailers', 'топКино', 'FRESH Trailers', 'INS'])
    } finally {
        if (saved !== undefined) process.env.YOUTUBE_WATCH_CHANNELS = saved
    }

    const parsed = parseChannelsEnv('*UC6A-Z0jDKemh9-CwGbj5yog:дубляж,UCWOA1ZGywLbqmigxE4Qlvuw')
    assert.deepEqual(parsed.map(channel => [channel.id, channel.priority === true, channel.keywords]), [
        ['UC6A-Z0jDKemh9-CwGbj5yog', true, ['дубляж']],
        ['UCWOA1ZGywLbqmigxE4Qlvuw', false, ['trailer', 'teaser']]
    ])
})
