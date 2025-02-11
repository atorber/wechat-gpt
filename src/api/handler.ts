const getTalkRecordsFromServer = async (receiver_id:string, talk_type:number, limit:number = 30, cursor:number = 0) => {
    // http://10.211.55.13:8002/api/v1/talk/records?talk_type=2&receiver_id=tyutluyc&cursor=0&limit=30
    const resp = await fetch(`http://10.211.55.13:8002/api/v1/talk/records?talk_type=${talk_type}&receiver_id=${receiver_id}&cursor=${cursor}&limit=${limit}`)
    const data:any[] = await resp.json() as any[]
    console.info('data:', data)
    return data
}

export { getTalkRecordsFromServer }
