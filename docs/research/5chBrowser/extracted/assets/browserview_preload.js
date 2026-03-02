const { ipcRenderer, webFrame } = require('electron')


const extractSikiUrl = (e) => {
  let ret
  let elm = e.target.closest('[href]')
  if (elm?.getAttribute) {
    let href = elm.getAttribute("href")
    if (href) {
      ret = (new URL(href, location.href))?.href
    }
  }
  return ret
}


const extractImg = (e) => {
  let elm = e.target
  let ret
  for (let i = 0; i < 3; i++) {
    if (!elm) break
    if (elm.getAttribute) {
      let src = elm.getAttribute("src")
      if (src) {
        ret = src
        if (!ret.match(/^http/)) {
          let s = String(location)
          if (s.endsWith('/') && ret.startsWith('/')) {
            ret = location + ret.substr(1)
          } else {
            ret = location + ret
          }
        }
        break
      } else {
        elm = elm.parentNode
      }
    }
  }
  return ret
}

window.addEventListener("click", async (e) => {
  let href = extractSikiUrl(e)
  if (href) {
    let issiki = await ipcRenderer.invoke('webContentsViewLinkClick', { x: e.x, y: e.y, href, background: e.ctrlKey || e.button == 1 })
    if (issiki) e.preventDefault()
  }
})

window.addEventListener("mousedown", async (e) => {
  let href = extractSikiUrl(e)
  if (href) {
    if (e.button == 1) {
      let issiki = await ipcRenderer.invoke('webContentsViewLinkClick', { x: e.x, y: e.y, href, background: true })
      if (issiki) e.preventDefault()
    }
  }
})

window.addEventListener("contextmenu", async (e, x) => {
  let senddata = { x: e.x, y: e.y }
  let target = e.target
  if (target.tagName == "INPUT" || target.tagName == "TEXTAREA") {
    senddata.textmode = true
  }
  senddata.href = extractSikiUrl(e)
  senddata.src = extractImg(e)
  let sel = window.getSelection()
  if (sel) {
    try {
      senddata.selected = sel.getRangeAt(0).toString()
    } catch (e) {

    }
  }
  ipcRenderer.send('webContentsViewContextmenu', senddata, String(window.location))
})

window.addEventListener("wheel", async (e) => {
  if (e.ctrlKey) {
    let f = webFrame.getZoomFactor()
    // webFrame.setZoomFactor(Math.max(0.1, f + (e.deltaY < 0 ? 0.1 : -0.1)))
    ipcRenderer.send('browserview.zoom', Math.max(0.1, f + (e.deltaY < 0 ? 0.1 : -0.1)))
  }
})

window.addEventListener("load", (e) => {
  try {
    if (document.querySelectorAll('body>*')?.length === 1 && document.querySelector('body>img,video')) {
      return ipcRenderer.send('browserview.loaded', { mode: 'transparent' })
    }
    let bc = getComputedStyle(document.getElementsByTagName('html')[0])["background-color"]
    if (document.querySelector('body>pre:first-child') || !document.body.firstChild) {
      let is_dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      return ipcRenderer.send('browserview.loaded', { mode: is_dark ? 'dark' : 'light' })
    } else {
      ipcRenderer.send('browserview.loaded', { nobackground: bc === 'rgba(0, 0, 0, 0)' })
    }
  } catch (e) {
    console.log(e)
  }
}, false)

window.onload = () => {
  if (location.hash) {
    const contents = document.querySelector("#sikiWebContentsView>div")
    let [, error_url] = location.hash.match(/#error=(.*)/) ?? []
    if (error_url) {
      contents.outerHTML = `<div class="error">Load Error:${error_url}</div>`
    }
  }
}

ipcRenderer.on('did-fail-load', (event, args) => {
  if (location.toString().startsWith('chrome-error:')) {
    const contents = document.body
    contents.innerHTML = `<div class="error" style="margin:14vh auto 0;padding:0 10%;"><h1>Access Error.</h1><h2>${args.description}</h2><p>${args.url}</p></div>`
  }
})

ipcRenderer.once('autoPasteImage', async (event, args) => {
  const { bloburl, filepath } = args
  if (bloburl) {
    for (let x of [...Array(6)]) {
      if (document.body) break
      await new Promise(r => setTimeout(r, 2000))
    }
    const b = await (await fetch(bloburl)).blob()
    const t = new window.DataTransfer()
    t.items.add(new File([b], filepath ?? (Math.floor(new Date().getTime() / 1000) + '.png'), { type: 'image/png' }))
    document.body?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true }))
    window.__siki_bloburl = bloburl
  }
})

ipcRenderer.on('imgbb.upload.completed', async (event, args) => {
  try {
    const is_login = !!document.querySelector('#top-bar-user')
    let urls = new Set()
    if (is_login) {
      for (let u of document.querySelector('#uploaded-embed-code-1').value.matchAll(/(https:\/\/i\.ibb\.co\/.*?\.(?:jpg|webp|gif|bmp|png|apng|avif|heic|ttf|pdf))/g)) {
        urls.add(u[1])
      }
    } else {
      const v = document.querySelector('#uploaded-embed-code-0').value
      if (v) {
        urls.add(v)
      }
      console.log(v)
    }
    if (urls.size) {
      ipcRenderer.send('upload.completed', [...urls.values()])
    }
  } catch (e) {
    console.log(e)
  }
})

ipcRenderer.on('imgbox.upload.completed', async (event, args) => {
  try {
    let urls = new Set()
    for (let u of document.querySelector('#code-html-full').value.matchAll(/(https:\/\/images2\.imgbox\.com[\/\w\_]+\.\w+)/g)) {
      urls.add(u[1])
    }
    if (urls.size) {
      ipcRenderer.send('upload.completed', [...urls.values()])
    }
  } catch (e) {
    console.log(e)
  }
})

ipcRenderer.on('imgur_web.upload.completed', async (event, args) => {
  try {
    if (!window.__siki_bloburl) return
    window.__siki_bloburl = undefined
    for (let i = 0; i < 5; i++) {
      const elm = document.querySelector('.PostContent-imageWrapper-rounded img') || document.querySelector('.PostVideo-video-wrapper source')
      const src = elm?.getAttribute('src')
      if (src && src?.startsWith('https:')) {
        ipcRenderer.send('upload.completed', [src], {})
        break
      }
      await new Promise(r => setTimeout(r, 500))
    }
  } catch (e) {
    console.log(e)
  }
})
