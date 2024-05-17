const axios = require('axios')
const cheerio = require('cheerio')
const Segment = require('segment')
const XLSX = require('xlsx')
const os = require('os')
const path = require('path')
const fs = require('fs').promises
let stopLoop = false;

/**
 * 寻找该网址下满足条件的公告链接
 * @param url 网页地址
 * @returns {targetUrl} 满足条件的公告链接url
 */
async function getLinkFromPage (url, keywords) {
  const targetUrl = []
  try {
    const response = await axios.get(url)
    const $ = cheerio.load(response.data)
    // 获取所有标签的标题
    const titlesName = $('.newslistlef').map((i, el) => $(el)).get()

    for (let i = 0; i < titlesName.length; i++) {
      if (titlesName[i].text() === '【送达公告】') {
        let text = titlesName[i].next().text().replace(/\s+/g, '')
        let anyMatch = keywords.some(str => text.includes(str))
        if (anyMatch) {
          // 剔除
        } else {
          // 继续
          targetUrl.push('http://www.czxqcourt.gov.cn' + titlesName[i].next().attr('href'))
        }
      } else {
        // 剔除
      }
    }
  } catch (error) {
    stopLoop = true;
    return null;
  }
  return targetUrl
}

/**
 * 判断文章是否在所选时间范围内
 * @param detail 文章
 * @param startDate 起始时间
 * @param endDate 终止时间
 * @returns {{isStop: boolean, isStay: boolean}} isStay: 是否保留该数据, isStop: 是否终止循环
 */
function dateFilter (detail, startY, startM, endY, endM) {
  const dateRegex = /发布时间：(.*?)(?:日)/
  const ymRegex = /发布时间：(\d{4})年(\d{1,2})月/
  const launchDate = detail.match(dateRegex)[0]
  const ym = launchDate.match(ymRegex)
  const y = ym[1]
  const m = ym[2].startsWith('0') ? ym[2].charAt(1) : ym[2]

  if (+y > +endY || (+y === +endY && +m > +endM)) {
    return { isStay: false, isStop: false }
  } else if (+y < +startY || (+y === +startY && +m < +startM)) {
    return { isStay: false, isStop: true }
  }
  return { isStay: true, isStop: false }
}

async function asyncWithRetry(method, isError, maxRetryTimes = 3) {
  for (let currentRetryTimes = 0; currentRetryTimes < maxRetryTimes; currentRetryTimes++) {
    try {
      const res = await method()
      if (isError(res)) {
        throw new Error(res)
      } else {
        return res
      }
    } catch (e) {
      console.log(e)
    }
  }
  throw new Error('超过最大重试次数')
}

/**
 * 根据公告链接查找公告内容
 * @param url_group 公告链接的数组，筛选起始时间以及末尾时间
 * @returns {Promise<*[]>} 含有公告内容、链接、状态标识的对象数组
 */
async function getDetailFromLinks (url_group, startY, startM, endY, endM) {
  const detail_group = []

  for (let i = 0; i < url_group.length; i++) {
    let response
    try {
      const retryFunction = () => axios.get(url_group[i])
      const isError = (data) => data.status !== 200
      response = await asyncWithRetry(retryFunction, isError)
    } catch (e) {
      detail_group.push({
        url_group: url_group[i],
        status: 'fail',
      })
      continue
    }
    const $ = cheerio.load(response.data)
    // 获取所有标签的标题
    const titlesName = $('#news_detailed').map((i, el) => $(el).text().replace(/\s+/g, '')).get()
    const detail = titlesName[0]
    // 在这里做时间筛选
    const filter = dateFilter(detail, startY, startM, endY, endM)
    if (filter.isStay) {
      // 在时间范围内
      detail_group.push({
        url_group: url_group[i],
        detail: detail,
        time_status: 'in',
        status: 'success',
      })
    } else if (!filter.isStop) {
      // 在时间范围之后
      detail_group.push({
        url_group: url_group[i],
        detail: detail,
        time_status: 'after',
        status: 'success',
      })
    } else {
      // 在时间范围之前
      detail_group.push({
        url_group: url_group[i],
        detail: detail,
        time_status: 'before',
        status: 'success',
      })
    }
  }
  return detail_group
}

/**
 * 将所有符合条件的可疑公告的相关信息返回
 * @param detail_group 含有公告内容及其链接的数组
 * @returns {*[]} 链接、原文、原告、被告、事由、文书落款时间、文书对应的链接
 */
function findSuspiciousDetail (detail_group, keywords) {
  const target_links = []
  for (let i = 0; i < detail_group.length; i++) {
    const detail = detail_group[i].detail
    // 检查文章
    let { isSuspicious, missingKeywords } = checkDetail(detail, keywords)
    if (isSuspicious) {
      //对原文进行适当剪切
      const usefulRegex1 = /(?:原告|申请执行人|申请人|上诉人)(.*?)(?:一案|二案|，)/
      const usefulRegex2 = /法院公告(.*?)(?:一案|二案)/
      const usefulRegex3 = /(.*?)(?:判决|审理终结)/
      const uselessRegex = /(.*?)(?:.pdf|.doc)/

      const dateRegex = /二(?:〇|○|O|0)(.*?)(?:日)/
      const dateRegex2 = /.{2,4}\s*年\s*.{1,2}\s*月\s*.{1,3}\s*日/g

      let usefulDetail
      if (detail.match(usefulRegex1)) {
        usefulDetail = detail.match(usefulRegex1)[0]
      } else if (detail.match(usefulRegex2)) {
        usefulDetail = detail.match(usefulRegex2)[0]
      } else if (detail.match(usefulRegex3)) {
        usefulDetail = detail.match(usefulRegex3)[0]
      } else if (detail.match(uselessRegex)) {
        //去除文档类文章
        continue
      }

      //确定关键词位置
      const segment = new Segment()
      segment.useDefault()
      const result = segment.doSegment(usefulDetail)
      let plaintiffStart, plaintiffEnd, defendantStart, defendantEnd

      // 原告
      for (let j = 0; j < result.length; j++) {
        const word = result[j].w
        // 确定原告位置
        if (!plaintiffStart && (word.includes('原告') || word.includes('人') || word.includes('公告'))) {
          plaintiffStart = j + 1
        }
        if (!plaintiffEnd && (word.includes('与') || word.includes('发') || (word.includes('诉') && word.length <= 1 && result[j + 1].w != '一'))) {
          plaintiffEnd = j - 1
        }

      }
      let plaintiff = ''
      for (let j = plaintiffStart; j <= plaintiffEnd; j++) {
        plaintiff += result[j].w
      }

      // 被告
      for (let j = plaintiffEnd + 1; j < result.length; j++) {
        const word = result[j].w
        // 确定被告位置
        if (!defendantStart && (word.includes('被告') || word.includes('人') || word.includes('及'))) {
          defendantStart = j + 1
          defendantEnd = defendantStart
        }
        if (defendantStart && (word.includes('公司') || word.includes('镇') || word.includes('厂') || word.includes('馆'))) {
          defendantEnd = j
        }
        if (defendantStart && (word.includes('、') && result[j + 1].w)) {
          defendantEnd = j + 1
        }

      }
      let defendant = ''
      for (let j = defendantStart; j <= defendantEnd; j++) {
        defendant += result[j].w
      }

      // 事由
      let reason = ''
      for (let j = defendantEnd + 1; j < result.length - 2; j++) {
        reason += result[j].w
      }

      //日期
      let date
      if (detail.match(dateRegex2)) {
        date = detail.match(dateRegex2).pop()
      }

      // 放入链接和原文
      target_links.push({
        link: detail_group[i].url_group,
        detail: usefulDetail,
        plaintiff: plaintiff,
        defendant: defendant,
        reason: reason,
        date: date,
      })
    }
  }
  return target_links
}

/**
 * 根据公告原文判断是否可疑
 * @param detail 公告原文
 * @returns {{isSuspicious: boolean, missingKeywords: *[]}} 可疑返回true
 */
function checkDetail (detail, keyword) {
  let isSuspicious = false
  let missingKeywords = []
  const keywords = keyword || ['诉求', '判令', '诉讼费用', '送达方式', '潮州']
  for (let i = 0; i < keywords.length; i++) {
    if (detail.includes(keywords[i])) {

    } else {
      missingKeywords.push(keywords[i])
    }
  }
  if (missingKeywords.length > 0) {
    isSuspicious = true
  }
  // const checkKeywords = keywords.every(keyword => new RegExp("\\b" + keyword + "\\b").test(detail));
  // if (!checkKeywords) {
  //     isSuspicious = true
  // }
  // console.log(checkKeywords)
  return { isSuspicious, missingKeywords }
}

/**
 * 辅助函数：将毫秒转换为分秒格式
 * @param milliseconds
 * @returns {string}
 */
function convertMillisecondsToMinutesAndSeconds (milliseconds) {
  const minutes = Math.floor(milliseconds / 60000)
  const seconds = ((milliseconds % 60000) / 1000).toFixed(0)
  return `${minutes}分${(seconds < 10 ? '0' : '')}${seconds}秒`
}

/**
 * 将结果导出成excel并保存在桌面的《检索结果》文件夹中
 * @param data
 * @returns {Promise<string>} excel的路径
 */
async function excelCreator (data) {
  // 将对象数组转换为二维数组（表格行）

  const makeDataArray = (data) => {
    const headers = Object.keys(data[0])
    const c_headers = ['链接', '原告', '被告', '事由', '日期']
    return [c_headers, ...data.map(obj => headers.map(header => obj[header]))]
  }

  // 获取用户主目录
  const homeDir = os.homedir()

  // 构建桌面路径
  const desktopPath = window.localStorage.getItem('__desktop_path') || ''
  const newFolderPath = path.join(desktopPath, '检索结果', getTime())

  try {
    await fs.mkdir(newFolderPath, { recursive: true })
    // 文件名
    const fileName = 'output.xlsx'
    const filePath = path.join(newFolderPath, fileName)
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(makeDataArray(data))
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    // 写入文件
    XLSX.writeFile(wb, filePath)
    return filePath
  } catch (error) {
    console.error('创建文件夹或保存文件时出错:', error)
  }

}

async function exportDetailAsHtmlFromExcel (excel_path) {
  // 读取Excel文件
  const workbook = XLSX.readFile(excel_path)

// 选择工作表，默认为第一个工作表
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

// 将工作表数据转换为JSON数组
  const data = XLSX.utils.sheet_to_json(sheet)
  const links = data.map(item => Object.values(item)[0])
  const basepath = excel_path.replace(/.output\.xlsx/, '')
  const foldpath = path.join(basepath, '文书附件')
  try {
    await fs.mkdir(foldpath, { recursive: true })
  } catch (e) {
    console.log('文件创建出了问题', e)
  }

  for (let i = 0; i < links.length; i++) {
    axios.get(links[i])
    .then(response => {
      if (response.status === 200) {
        // 获取网页内容
        const htmlContent = response.data
        let match = links[i].match(/[^\/]+$/) // 匹配最后一个"/"后面的所有非"/"字符
        let lastPart = match ? match[0] : '' // 防止match返回null的情况
        const filePath = path.join(foldpath, lastPart + '.html')
        // 将内容写入到HTML文件
        fs.writeFile(filePath, htmlContent, 'utf8', err => {
          if (err) {
            console.error('写入文件时发生错误:', err)
          } else {
            console.log('网页已成功保存为:', filePath)
          }
        })
      } else {
        console.log('请求网页失败，状态码:', response.status)
      }
    })
    .catch(error => {
      console.error('请求过程中发生错误:', error)
    })
  }
}

module.exports = {
  /**
   * 开始爬虫
   * @returns {Promise<*[]>}
   */
  start_Scrape: async function (url, start, end, keywords) {

    // 数据汇总
    let allData = []
    // 开始执行
    let page = 1;
    stopLoop = false;
    while(!stopLoop){
      const pageUrl = 'http://www.czxqcourt.gov.cn/list/18/_' + page;
      const keyword_group = ['判决', '裁定', '上诉', '传票', '答辩',"执行"];
      // 获取符合条件的公告链接
      const targetUrl = await getLinkFromPage(pageUrl, keyword_group)
      //如果没有搜到链接，则进入下一轮循环
      if (targetUrl === null){
        continue;
      }
      //
      //默认时间范围
      let startDate = start || '2022年6月', endDate = end || '2023年6月'
      const seymRegex = /(\d{4})年(\d{1,2})月/
      const sym = startDate.match(seymRegex)
      const eym = endDate.match(seymRegex)
      const detailGroup = await getDetailFromLinks(targetUrl, sym[1], sym[2], eym[1], eym[2])

      if (detailGroup.every(obj => !obj.time_status || obj.time_status === 'after')) {
        // 所有链接都在范围之后 —— 跳过这一页
        page++
        continue
      } else if (detailGroup.every(obj => !obj.time_status || obj.time_status === 'before')) {
        // 所有链接都在范围前 —— 中断循环
        page++
        break
      }
      const filteredArray = detailGroup.filter(obj => obj.time_status === 'in').map(({
                                                                                       time_status,
                                                                                       ...rest
                                                                                     }) => rest)
      let finalData
      finalData = findSuspiciousDetail(filteredArray, keywords)
      finalData = finalData.map(({ detail, ...rest }) => rest)
      for (let j = 0; j < finalData.length; j++) {
        allData.push(finalData[j])
      }

      detailGroup.filter(i => i.status === 'fail').forEach(i => {
        allData.push({
          link: i.url_group,
          detail: '公告拉取失败，请手动确认合法情况'
        })
      })

      page++;
    }
    return allData

  },
  download_outcome: async function (data) {
    try {
      // 导出excel
      const excel_path = await excelCreator(data)
      // 导出公告为html
      await exportDetailAsHtmlFromExcel(excel_path)
      return true
    } catch (e) {
      return false
    }

  },
}

function getTime () {
  const date = new Date()
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}:${seconds}`
}


