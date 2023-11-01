/* eslint-disable sort-keys */
import { Contact, Message, Room, Wechaty, log, types } from 'wechaty'
import { getCurrentFormattedDate } from '../utils/mod.js'
import type { SendTextRequest } from '../types/mod.js'
import { v4 as uuidv4 } from 'uuid'
import { FileBox } from 'file-box'
import htmlToDocx from 'html-to-docx'
import DB from '../db/nedb.js'
const messageChatData = DB('data/messageChat.db')

export async function getAvatarUrl (params:Contact|Room) {
  try {
    return JSON.parse(JSON.stringify(await params.avatar()))['url']
  } catch (e) {
    return ''
  }
}

export async function updateChats (
  message:Message,
  recordsDir: {[key:string]:any[]},
  chats:{[key:string]:any},
  webClient:any,
) {
  const talker = message.talker()
  const listener = message.listener()
  const room = message.room()
  const text = message.text()
  const curTime = getCurrentFormattedDate()
  const msgType = message.type() === types.Message.Text ? 1 : undefined
  const curMsg =     {
    id: room?.id || talker.id,
    sequence: 1140,
    msg_id: message.id,
    talk_type: 1,
    msg_type: msgType,
    user_id: talker.id,
    receiver_id: room?.id || talker.id,
    nickname: talker.name(),
    avatar: await getAvatarUrl(room || talker) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
    is_revoke: 0,
    is_mark: 0,
    is_read: 1,
    content: text,
    created_at: getCurrentFormattedDate(),
    extra: {},
  }

  if (room) {
    const records:any[] = recordsDir[room.id] || []
    const chatId = `2_${room.id}`
    chats[chatId] = {
      avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
      id: chatId,
      index_name: chatId,
      is_disturb: 0,
      is_online: 1,
      is_robot: 0,
      is_top: 0,
      msg_text: text,
      name: await room.topic(),
      receiver_id: room.id,
      remark_name: '',
      talk_type: 2,
      unread_num: 0,
      updated_at: curTime,
    }
    const newMessage = {
      sid:message.id,
      event:'im.message',
      content:{
        data:{
          avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
          content:text,
          created_at:curTime,
          extra:{

          },
          id:room.id,
          is_revoke:0,
          is_mark:0,
          is_read:0,
          msg_id:message.id,
          msg_type:1,
          nickname:talker.name(),
          receiver_id:room.id,
          sequence:379,
          talk_type:2,
          user_id:talker.id,
        },
        sender_id:talker.id,
        receiver_id:room.id,
        talk_type:2,
      },
    }
    curMsg.sequence = records.length
    records.push(curMsg)
    recordsDir[room.id] = records
    // 存储到DB
    await messageChatData.insert(records)
    if (webClient) {
      webClient.websocket.send(JSON.stringify(newMessage))
    }
  } else {
    const records:any[] = recordsDir[talker.id] || []
    const chatId = `1_${talker.id}`
    chats[chatId] = {
      avatar: await getAvatarUrl(talker) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
      id: chatId,
      index_name: chatId,
      is_disturb: 0,
      is_online: 1,
      is_robot: 0,
      is_top: 0,
      msg_text: text,
      name: talker.name(),
      receiver_id: talker.id,
      remark_name: await talker.alias() || '',
      talk_type: 1,
      unread_num: 0,
      updated_at: getCurrentFormattedDate(),
    }
    const newMessage = {
      sid:message.id,
      event:'im.message',
      content:{
        data:{
          id:talker.id,
          sequence:379,
          msg_id:message.id,
          talk_type:1,
          msg_type:1,
          user_id:talker.id,
          receiver_id:listener?.id,
          nickname:talker.name(),
          avatar:await getAvatarUrl(talker) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png',
          is_revoke:0,
          is_mark:0,
          is_read:0,
          content:text,
          created_at:getCurrentFormattedDate(),
          extra:{

          },
        },
        sender_id:talker.id,
        receiver_id:listener?.id,
        talk_type:1,
      },
    }
    curMsg.sequence = records.length
    records.push(curMsg)
    recordsDir[talker.id] = records
    if (webClient) {
      webClient.websocket.send(JSON.stringify(newMessage))
    }
  }
}

export async function updateChatsReply (
  bot:Wechaty,
  requestBody: SendTextRequest,
  recordsDir:{[key:string]:any[]},
  chats:{[key:string]:any},
  webClient:any,
) {

  const talker: Contact | undefined = await bot.currentUser
  let listener:Contact|undefined
  let room:Room|undefined
  const text = requestBody.text
  const messageId = uuidv4()

  if (requestBody.talk_type === 2) {
    room = await bot.Room.find({ id: requestBody.receiver_id })
    await room?.say(requestBody.text)
  } else {
    listener = await bot.Contact.find({ id: requestBody.receiver_id })
  }

  const curTime = getCurrentFormattedDate()
  const curMsg =     {
    id: room?.id || talker.id,
    sequence: 1140,
    msg_id: messageId,
    talk_type: 1,
    msg_type: 1,
    user_id: talker.id,
    receiver_id: room?.id || talker.id,
    nickname: talker.name(),
    avatar: await getAvatarUrl(room || talker) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
    is_revoke: 0,
    is_mark: 0,
    is_read: 1,
    content: text,
    created_at: getCurrentFormattedDate(),
    extra: {
      address: '中国 广东省 深圳市 电信',
      agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
      datetime: getCurrentFormattedDate(),
      ip: '183.14.132.181',
      platform: 'web',
      reason: '常用设备登录',
    },
  }

  if (room) {
    const records:any[] = recordsDir[room.id] || []
    const chatId = `2_${room.id}`
    chats[chatId] = {
      avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
      id: chatId,
      index_name: chatId,
      is_disturb: 0,
      is_online: 1,
      is_robot: 0,
      is_top: 0,
      msg_text: text,
      name: await room.topic(),
      receiver_id: room.id,
      remark_name: '',
      talk_type: 2,
      unread_num: 0,
      updated_at: curTime,
    }
    const newMessage = {
      sid:messageId,
      event:'im.message',
      content:{
        data:{
          avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
          content:text,
          created_at:curTime,
          extra:{

          },
          id:room.id,
          is_revoke:0,
          is_mark:0,
          is_read:0,
          msg_id:messageId,
          msg_type:1,
          nickname:talker.name(),
          receiver_id:room.id,
          sequence:379,
          talk_type:2,
          user_id:talker.id,
        },
        sender_id:talker.id,
        receiver_id:room.id,
        talk_type:2,
      },
    }
    curMsg.sequence = records.length
    records.push(curMsg)
    recordsDir[room.id] = records
    if (webClient) {
      webClient.websocket.send(JSON.stringify(newMessage))
    }
  } else {
    const records:any[] = recordsDir[talker.id] || []
    const chatId = `1_${talker.id}`
    chats[chatId] = {
      avatar: await getAvatarUrl(talker) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
      id: chatId,
      index_name: chatId,
      is_disturb: 0,
      is_online: 1,
      is_robot: 0,
      is_top: 0,
      msg_text: text,
      name: talker.name(),
      receiver_id: talker.id,
      remark_name: await talker.alias() || '',
      talk_type: 1,
      unread_num: 0,
      updated_at: getCurrentFormattedDate(),
    }
    const newMessage = {
      sid:messageId,
      event:'im.message',
      content:{
        data:{
          id:talker.id,
          sequence:379,
          msg_id:messageId,
          talk_type:1,
          msg_type:1,
          user_id:talker.id,
          receiver_id:listener?.id,
          nickname:talker.name(),
          avatar:await getAvatarUrl(talker) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png',
          is_revoke:0,
          is_mark:0,
          is_read:0,
          content:text,
          created_at:getCurrentFormattedDate(),
          extra:{

          },
        },
        sender_id:talker.id,
        receiver_id:listener?.id,
        talk_type:1,
      },
    }
    curMsg.sequence = records.length
    records.push(curMsg)
    recordsDir[talker.id] = records
    // 存储到DB
    await messageChatData.insert(records)
    if (webClient) {
      webClient.websocket.send(JSON.stringify(newMessage))
    }
  }
}

export async function exportFile (history:any[]) {
  try {
    const time = new Date().toLocaleString()
    let content = `<h2>导出时间</h2><br> ${time}<br><h2>内容记录</h2><br>`
    for (const record of history) {
      content += `${record.role} <br>${record.content}<br>`
    }
    // 使用html-to-docx库将会议聊天信息转换为word文档的buffer对象
    const buffer = await htmlToDocx(content)
    const reg = /[^a-zA-Z0-9]/g
    // 将buffer对象转换为FileBox对象，用于发送文件
    const fileBox = FileBox.fromBuffer(buffer, `${time.replace(reg, '')}.docx`)
    return fileBox

  } catch (err) {

    // 如果出现错误，打印错误信息，并回复给群聊
    log.error('导出失败', err)
    return '导出失败，请重试'
  }
}

export type NewContact = {
    avatar: string;
    gender: types.ContactGender;
    group_id: number;
    id: string;
    is_online: number;
    motto: string;
    nickname: string;
    remark: string;
  }

export async function getAllContacts (bot:Wechaty) {
  const contacts = await bot.Contact.findAll()
  const newContacts: (NewContact|null)[] = await Promise.all(
    contacts.map(async (contact) => {
      const isFriend = contact.friend()
      if (isFriend) {
        return {
          avatar: await getAvatarUrl(contact) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png',
          gender: contact.gender(),
          group_id: 0,
          id: contact.id,
          is_online: 0,
          motto: '',
          nickname: contact.name(),
          remark: await contact.alias() || '',
        }
      } else {
        log.info('不是好友:', contact.name())
      }
      return null // 如果联系人不是好友，则返回 null 或其他适当的值
    }),
  )

  // 过滤掉值为 null 的联系人
  const filteredContacts: (NewContact|null)[] = newContacts.filter((contact) => contact !== null)
  return filteredContacts
}

export type NewRoom = {
    avatar: string;
    group_name: string;
    id: string;
    is_disturb: number;
    leader: string | undefined;
    profile: string;
  };

export async function getAllRooms (bot: Wechaty) {
  const rooms = await bot.Room.findAll()
  const newRooms: NewRoom[] = await Promise.all(
    rooms.map(async (room: Room) => ({
      avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png', // 设置群组头像
      group_name: await room.topic(),
      id: room.id,
      is_disturb: 0, // 设置群组是否免打扰
      leader: room.owner()?.id, // 设置群组领导人
      profile: await room.announce(), // 设置群组简介
    })),
  )
  return newRooms
}

export type ContactDetail = {
    avatar: string;
    email: string;
    friend_apply: number;
    friend_status: number;
    gender: number;
    group_id: number;
    id: string;
    mobile: string | undefined;
    motto: string | undefined;
    nickname: string;
    remark: string | undefined;
  };

export type RoomDetail = {
    avatar: string;
    created_at: string;
    group_id: string;
    group_name: string;
    is_disturb: number,
    is_manager: boolean,
    manager_nickname:string | undefined,
    profile: string,
    visit_card: string
  };

export function updateConfig (curId:string, curUserConfig:any, whiteList:any, config:any, history:any) {
  if (curUserConfig) {
    whiteList[curId] = curUserConfig
  } else {
    delete whiteList[curId]
    delete history[curId]
  }
  config.whiteList = whiteList
  config.lastUpdate = new Date().toLocaleString()
}

export async function getPhone (contact:Contact) {
  try {
    return (await contact.phone()).length ? (await contact.phone())[0] : '--'
  } catch (e) {
    return ''
  }
}

// async function updateChats (message:Message) {
//   const talker = message.talker()
//   const listener = message.listener()
//   const room = message.room()
//   const text = message.text()
//   const curTime = getCurrentFormattedDate()
//   const curMsg =     {
//     id: room?.id || talker.id,
//     sequence: 1140,
//     msg_id: message.id,
//     talk_type: 1,
//     msg_type: 1,
//     user_id: talker.id,
//     receiver_id: room?.id || talker.id,
//     nickname: talker.name(),
//     avatar: await getAvatarUrl(room || talker) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
//     is_revoke: 0,
//     is_mark: 0,
//     is_read: 1,
//     content: text,
//     created_at: getCurrentFormattedDate(),
//     extra: {},
//   }

//   if (room) {
//     const records:any[] = recordsDir[room.id] || []
//     const chatId = `2_${room.id}`
//     chats[chatId] = {
//       avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
//       id: chatId,
//       index_name: chatId,
//       is_disturb: 0,
//       is_online: 1,
//       is_robot: 0,
//       is_top: 0,
//       msg_text: text,
//       name: await room.topic(),
//       receiver_id: room.id,
//       remark_name: '',
//       talk_type: 2,
//       unread_num: 0,
//       updated_at: curTime,
//     }
//     const newMessage = {
//       sid:message.id,
//       event:'im.message',
//       content:{
//         data:{
//           avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
//           content:text,
//           created_at:curTime,
//           extra:{

//           },
//           id:room.id,
//           is_revoke:0,
//           is_mark:0,
//           is_read:0,
//           msg_id:message.id,
//           msg_type:1,
//           nickname:talker.name(),
//           receiver_id:room.id,
//           sequence:379,
//           talk_type:2,
//           user_id:talker.id,
//         },
//         sender_id:talker.id,
//         receiver_id:room.id,
//         talk_type:2,
//       },
//     }
//     curMsg.sequence = records.length
//     records.push(curMsg)
//     recordsDir[room.id] = records
//     if (webClient) {
//       webClient.websocket.send(JSON.stringify(newMessage))
//     }
//   } else {
//     const records:any[] = recordsDir[talker.id] || []
//     const chatId = `1_${talker.id}`
//     chats[chatId] = {
//       avatar: await getAvatarUrl(talker) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
//       id: chatId,
//       index_name: chatId,
//       is_disturb: 0,
//       is_online: 1,
//       is_robot: 0,
//       is_top: 0,
//       msg_text: text,
//       name: talker.name(),
//       receiver_id: talker.id,
//       remark_name: await talker.alias() || '',
//       talk_type: 1,
//       unread_num: 0,
//       updated_at: getCurrentFormattedDate(),
//     }
//     const newMessage = {
//       sid:message.id,
//       event:'im.message',
//       content:{
//         data:{
//           id:talker.id,
//           sequence:379,
//           msg_id:message.id,
//           talk_type:1,
//           msg_type:1,
//           user_id:talker.id,
//           receiver_id:listener?.id,
//           nickname:talker.name(),
//           avatar:await getAvatarUrl(talker) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png',
//           is_revoke:0,
//           is_mark:0,
//           is_read:0,
//           content:text,
//           created_at:getCurrentFormattedDate(),
//           extra:{

//           },
//         },
//         sender_id:talker.id,
//         receiver_id:listener?.id,
//         talk_type:1,
//       },
//     }
//     curMsg.sequence = records.length
//     records.push(curMsg)
//     recordsDir[talker.id] = records
//     if (webClient) {
//       webClient.websocket.send(JSON.stringify(newMessage))
//     }
//   }
// }

// async function updateChatsReply (requestBody: SendTextRequest) {

//   const talker: Contact | undefined = await bot.currentUser
//   let listener:Contact|undefined
//   let room:Room|undefined
//   const text = requestBody.text
//   const messageId = uuidv4()

//   if (requestBody.talk_type === 2) {
//     room = await bot.Room.find({ id: requestBody.receiver_id })
//     await room?.say(requestBody.text)
//   } else {
//     listener = await bot.Contact.find({ id: requestBody.receiver_id })
//   }

//   const curTime = getCurrentFormattedDate()
//   const curMsg =     {
//     id: room?.id || talker.id,
//     sequence: 1140,
//     msg_id: messageId,
//     talk_type: 1,
//     msg_type: 1,
//     user_id: talker.id,
//     receiver_id: room?.id || talker.id,
//     nickname: talker.name(),
//     avatar: await getAvatarUrl(room || talker) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
//     is_revoke: 0,
//     is_mark: 0,
//     is_read: 1,
//     content: text,
//     created_at: getCurrentFormattedDate(),
//     extra: {
//       address: '中国 广东省 深圳市 电信',
//       agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
//       datetime: getCurrentFormattedDate(),
//       ip: '183.14.132.181',
//       platform: 'web',
//       reason: '常用设备登录',
//     },
//   }

//   if (room) {
//     const records:any[] = recordsDir[room.id] || []
//     const chatId = `2_${room.id}`
//     chats[chatId] = {
//       avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
//       id: chatId,
//       index_name: chatId,
//       is_disturb: 0,
//       is_online: 1,
//       is_robot: 0,
//       is_top: 0,
//       msg_text: text,
//       name: await room.topic(),
//       receiver_id: room.id,
//       remark_name: '',
//       talk_type: 2,
//       unread_num: 0,
//       updated_at: curTime,
//     }
//     const newMessage = {
//       sid:messageId,
//       event:'im.message',
//       content:{
//         data:{
//           avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
//           content:text,
//           created_at:curTime,
//           extra:{

//           },
//           id:room.id,
//           is_revoke:0,
//           is_mark:0,
//           is_read:0,
//           msg_id:messageId,
//           msg_type:1,
//           nickname:talker.name(),
//           receiver_id:room.id,
//           sequence:379,
//           talk_type:2,
//           user_id:talker.id,
//         },
//         sender_id:talker.id,
//         receiver_id:room.id,
//         talk_type:2,
//       },
//     }
//     curMsg.sequence = records.length
//     records.push(curMsg)
//     recordsDir[room.id] = records
//     if (webClient) {
//       webClient.websocket.send(JSON.stringify(newMessage))
//     }
//   } else {
//     const records:any[] = recordsDir[talker.id] || []
//     const chatId = `1_${talker.id}`
//     chats[chatId] = {
//       avatar: await getAvatarUrl(talker) || 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
//       id: chatId,
//       index_name: chatId,
//       is_disturb: 0,
//       is_online: 1,
//       is_robot: 0,
//       is_top: 0,
//       msg_text: text,
//       name: talker.name(),
//       receiver_id: talker.id,
//       remark_name: await talker.alias() || '',
//       talk_type: 1,
//       unread_num: 0,
//       updated_at: getCurrentFormattedDate(),
//     }
//     const newMessage = {
//       sid:messageId,
//       event:'im.message',
//       content:{
//         data:{
//           id:talker.id,
//           sequence:379,
//           msg_id:messageId,
//           talk_type:1,
//           msg_type:1,
//           user_id:talker.id,
//           receiver_id:listener?.id,
//           nickname:talker.name(),
//           avatar:await getAvatarUrl(talker) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png',
//           is_revoke:0,
//           is_mark:0,
//           is_read:0,
//           content:text,
//           created_at:getCurrentFormattedDate(),
//           extra:{

//           },
//         },
//         sender_id:talker.id,
//         receiver_id:listener?.id,
//         talk_type:1,
//       },
//     }
//     curMsg.sequence = records.length
//     records.push(curMsg)
//     recordsDir[talker.id] = records
//     if (webClient) {
//       webClient.websocket.send(JSON.stringify(newMessage))
//     }
//   }
// }
