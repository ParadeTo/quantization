const sqlite3 = require('sqlite3').verbose()
const sqlite = require('sqlite')
const axios = require('axios')
const pl = require('nodejs-polars')
const dayjs = require('dayjs')

function initDB() {
  return sqlite.open({filename: './data.db', driver: sqlite3.Database})
}

function createKDayDf({data, columns}) {
  const df = pl.DataFrame(data, {columns})
  return df
}

async function fetchData(params) {
  const {code, beg, end} = params
  const seCid = code.startsWith(6) ? '1' : '0'
  const rsp = await axios.get(
    'http://push2his.eastmoney.com/api/qt/stock/kline/get',
    {
      params: {
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116',
        ut: '7eea3edcaed734bea9cbfc24409ed989',
        klt: '101',
        fqt: 0,
        secid: `${seCid}.${code}`,
        beg,
        end,
        _: '1623766962675',
      },
    }
  )
  const lines = rsp.data.data.klines
  const data = []
  lines.forEach((line) => {
    data.push([
      code,
      ...line.split(',').map((a) => (isNaN(Number(a)) ? a : Number(a))),
    ])
  })

  return data
}

async function saveData({db, columns, data}) {
  const insert = await db.prepare(
    `INSERT INTO k_day (${columns.join(',')}) VALUES (${[
      ...new Array(columns.length),
    ]
      .map(() => '?')
      .join(',')})`
  )
  for (row of data) {
    try {
      await insert.run(...row)
      console.log('=============')
    } catch (error) {
      console.error(error)
    }
  }
  await insert.finalize()
}

async function getData(params) {
  let {code, beg, end} = params
  const columns = [
    'code',
    'date',
    'open',
    'close',
    'high',
    'low',
    'volume',
    'amount',
    'unknow1',
    'change_pct',
    'change',
    'turnover_ratio',
  ]
  const db = await initDB()
  const query = await db.all(
    `SELECT * from k_day WHERE ts >= ${dayjs(
      beg,
      'YYYYMMDD'
    ).unix()} and ts <= ${dayjs(end, 'YYYYMMDD').unix()} ORDER BY ts`
  )

  const data = []
  for (row of query) {
    const values = []
    for (let col of columns) {
      values.push(row[col])
    }
    data.push(values)
  }

  if (
    dayjs(end, 'YYYYMMDD').unix() >
    dayjs(data[data.length - 1][1], 'YYYY-MM-DD').unix()
  ) {
    beg = dayjs(data[data.length - 1][1], 'YYYY-MM-DD')
      .add(1, 'd')
      .format('YYYYMMDD')
    debugger

    // 请求数据
    const moreData = await fetchData({...params, beg})
    await saveData({columns, db, data: moreData})
    data.push(...moreData)
  }

  const df = createKDayDf({data, columns})

  db.close()

  return df
}

async function strategy() {
  let df = await getData({code: '600519', beg: '20240101', end: '20241210'})
  console.log(df)
  // 添加 J 列
  df = df.withColumns([
    pl.lit(0).alias('rsv_day'),
    pl.lit(0).alias('rsv_month'),
    pl.lit(0).alias('j_day'),
    pl.lit(0).alias('j_month'),
  ])

  const kdjDay = calKDJ(df, 3)
  const kdjMonth = calKDJ(df, 30)

  console.log(kdjDay[2].toString())
  // const rows = df.rows()
  // for (i = 0; i < rows.length; i++) {
  //   console.log(rows[i])
  // }

  // 初始化变量
  let capital = 5000000 // 本金
  let position = 0 // 当前持仓
  let buyPrice = 0 // 买入价格
  let stopLoss = 0 // 止损价格
  let stopProfit = 0 // 止盈价格

  // 遍历数据进行回测
  for (let i = 0; i < df.length; i++) {
    const row = df.get(i)

    // 左侧交易时买入
    if (i < df.length / 2) {
      if (row.get('J') < 0) {
        const buyAmount = Math.floor(capital / 3 / 100) * 100 // 计算买入数量
        position += buyAmount
        buyPrice = row.get('close')
        stopLoss = buyPrice * 0.9 // 止损价格为买入价格的 90%
        stopProfit = buyPrice * 1.2 // 止盈价格为买入价格的 120%
        capital -= buyAmount * buyPrice
      }
    }
    // 右侧交易时买入
    else {
      if (row.get('J') < 0) {
        const buyAmount = Math.floor(capital / 3 / 100) * 100 // 计算买入数量
        position += buyAmount
        buyPrice = row.get('close')
        capital -= buyAmount * buyPrice
      }
    }

    // 判断是否触发止损
    if (position >= 300 && row.get('close') <= stopLoss) {
      const sellAmount = Math.floor(position / 2 / 100) * 100 // 计算卖出数量
      position -= sellAmount
      capital += sellAmount * row.get('close')
    }

    // 判断是否触发止盈
    if (position >= 100 && row.get('close') >= stopProfit) {
      const sellAmount = Math.floor(position / 3 / 100) * 100 // 计算卖出数量
      position -= sellAmount
      capital += sellAmount * row.get('close')
    }
  }

  return capital
}

// 计算 KDJ
function calKDJ(df, window) {
  const closePrices = df.getColumn('close')
  const lowPrices = df.getColumn('low')
  const highPrices = df.getColumn('high')

  const rsv = []

  for (let i = 0; i < closePrices.length; i++) {
    const c = closePrices.get(i)
    const Ln = lowPrices.slice(i + 1 - window, i + 1).min()
    const Hn = highPrices.slice(i + 1 - window, i + 1).max()
    if (Ln === null || Hn === null) {
      rsv.push(undefined)
      continue
    }
    const rsvValue = ((c - Ln) / (Hn - Ln)) * 100
    rsv.push(rsvValue)
  }

  const k = []
  for (let i = 0; i < closePrices.length; i++) {
    const prevK = k[i - 1] ? k[i - 1] : 50
    if (rsv[i] === undefined) {
      k.push(undefined)
      continue
    }
    k.push((2 / 3) * prevK + (1 / 3) * rsv[i])
  }

  const d = []
  for (let i = 0; i < closePrices.length; i++) {
    const prevD = d[i - 1] ? d[i - 1] : 50
    if (k[i] === undefined) {
      d.push(undefined)
      continue
    }
    d.push((2 / 3) * prevD + (1 / 3) * k[i])
  }

  const j = []
  for (let i = 0; i < closePrices.length; i++) {
    if (k[i] === undefined) {
      j.push(undefined)
      continue
    }
    j.push(3 * k[i] - 2 * d[i])
  }

  return [k, d, j]
}

console.log(strategy())
