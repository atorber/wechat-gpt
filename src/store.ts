import type * as PUPPET from 'wechaty-puppet'

import { type Storage, type StorageValue, prefixStorage } from 'unstorage'

export type PrefixStorage<T extends StorageValue> = ReturnType<typeof createPrefixStorage<T>>

export function createPrefixStorage<T extends StorageValue>(storage: Storage<T | null>, base: string) {
  const s = prefixStorage(storage, base)

  const getItemsMap = async (base?: string) => {
    const keys = await s.getKeys(base)
    return await Promise.all(keys.map(async key => ({ key, value: await s.getItem(key) as T })))
  }
  return {
    ...s,
    getItemsMap,
    async getItemsList(base?: string) {
      return (await getItemsMap(base)).map(v => v.value)
    },
  }
}

export class CacheManager {
  private roomInvitationStorage: Storage<PUPPET.payloads.RoomInvitation | null>
  private friendshipStorage: Storage<PUPPET.payloads.Friendship | null>
  private roomInvitationCache: PrefixStorage<PUPPET.payloads.RoomInvitation>
  private friendshipCache: PrefixStorage<PUPPET.payloads.Friendship>

  constructor(storage: Storage<StorageValue>) {
    this.roomInvitationStorage = storage as Storage<PUPPET.payloads.RoomInvitation | null>
    this.friendshipStorage = storage as Storage<PUPPET.payloads.Friendship | null>
    this.roomInvitationCache = createPrefixStorage(this.roomInvitationStorage, 'wcf:room-invitation')
    this.friendshipCache = createPrefixStorage(this.friendshipStorage, 'wcf:friendship')
  }

  // #region Friendship

  getFriendship(friendshipId: string) {
    return this.friendshipCache.getItem(friendshipId)
  }

  setFriendship(friendshipId: string, payload: PUPPET.payloads.Friendship) {
    return this.friendshipCache.setItem(friendshipId, payload)
  }

  // #region Room Invitation

  getRoomInvitation(messageId: string) {
    return this.roomInvitationCache.getItem(messageId)
  }

  setRoomInvitation(messageId: string, payload: PUPPET.payloads.RoomInvitation) {
    return this.roomInvitationCache.setItem(messageId, payload)
  }

  deleteRoomInvitation(messageId: string) {
    return this.roomInvitationCache.removeItem(messageId)
  }
}
