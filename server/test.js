const axios = require('axios')
const pd = require('node-pandas')

function getData() {
  const columns = [
    'trade_date',
    'open',
    'close',
    'high',
    'low',
    'volume',
    'amount',
    '',
    'change_pct',
    'change',
    'turnover_ratio',
  ]

  axios
    .get('http://push2his.eastmoney.com/api/qt/stock/kline/get', {
      params: {
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116',
        ut: '7eea3edcaed734bea9cbfc24409ed989',
        klt: '102',
        fqt: 0,
        secid: '1.600519',
        beg: '20240101',
        end: '20241201',
        _: '1623766962675',
      },
    })
    .then(async (rsp) => {
      console.log(rsp.data)
      // const lines = rsp.data.data.klines
      // const data = []
      // lines.forEach((line) => {
      //   data.push(line.split(','))
      // })
      // const df = pd.DataFrame(data, columns)
      // console.log(df.show())
    })
}

getData()
