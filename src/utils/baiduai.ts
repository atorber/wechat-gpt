/* eslint-disable sort-keys */
import axios from 'axios'
import fs from 'fs'

import {
  log,
} from 'wechaty'
import { baseConfig } from '../config.js'

const AK = baseConfig.baiduvop.items.ak.value
const SK = baseConfig.baiduvop.items.sk.value

export async function vop (path:string) {
  const speech:string = getFileContentAsBase64(path)

  // 创建一个实例
  const instance = axios.create({
    baseURL: 'https://vop.baidu.com',
    timeout: 5000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })

  try {
    // 发送POST请求
    const data = {
      format: 'wav',
      rate: 16000,
      channel: 1,
      cuid: '1111111111111111',
      token: await getAccessToken(),
      speech,
      len: Buffer.from(speech, 'base64').byteLength,
    }
    // log.info(JSON.stringify(data))
    const response:any = await instance.post('/server_api', data)
    // 处理响应数据
    //   log.info('response.data', JSON.stringify(response.data));
    return response.data
  } catch (error:any) {
    // 处理错误
    log.error('error:', error)
    return error
  }
}

/**
 * 使用 AK，SK 生成鉴权签名（Access Token）
 * @return string 鉴权签名信息（Access Token）
 */
async function getAccessToken () {

  // 创建一个实例
  const instance = axios.create({
    baseURL: 'https://aip.baidubce.com',
    timeout: 3000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })

  try {
  // 发送POST请求
    const response:any = await instance.post('/oauth/2.0/token?grant_type=client_credentials&client_id=' + AK + '&client_secret=' + SK, {})
    // 处理响应数据
    // log.info('response.data', JSON.stringify(response.data));
    return response.data.access_token

  } catch (error:any) {
    // 处理错误
    log.error('error:', error)
    return error
  }

}

/**
 * 获取文件base64编码
 * @param string  path 文件路径
 * @return string base64编码信息，不带文件头
 */
function getFileContentAsBase64 (path:string) {
  // path = '/Users/luyuchao/Documents/GitHub/WechatGPT/output/159fdab3-2909-4320-ad9d-ed40f6a264c2.wav'
  try {
    return fs.readFileSync(path, { encoding: 'base64' })
  } catch (err:any) {
    throw new Error(err)
  }
}
