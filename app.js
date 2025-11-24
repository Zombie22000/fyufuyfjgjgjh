// Basic multi-tab browser-like UI using iframes and localStorage for bookmarks/history.
// No external dependencies used so importmap remains ready for future modules.

const STATE_KEY = 'miniweb_state_v1'
const DEFAULT_HOME = 'https://browsesimwelcome.on.websim.com'

const el = id => document.getElementById(id)
const tabbar = el('tabbar')
const viewport = el('viewport')
const address = el('address')
const addressForm = el('addressForm')
const backBtn = el('back')
const forwardBtn = el('forward')
const reloadBtn = el('reload')
const homeBtn = el('home')
const newTabBtn = el('newTab')
const bookmarkBtn = el('bookmark')
// sidebar lists removed; popups remain available

// popup elements
const openBookmarksBtn = el('openBookmarks')
const openHistoryBtn = el('openHistory')
const popupOverlay = el('popupOverlay')
const popupBookmarks = el('popupBookmarks')
const popupHistory = el('popupHistory')
const clearHistoryBtn = el('clearHistory')

let state = loadState()
if (!state.tabs || state.tabs.length === 0) {
  state = createEmptyState()
  addTab(state.home)
}
render()

// --- Utility ---
function ensureUrl(url){
  url = (url || '').trim()
  // if it already has a scheme, leave it (but still check for example.com redirect)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    try {
      const u = new URL(url)
      if (u.hostname === 'example.com') return DEFAULT_HOME
    } catch(e){}
    return url
  }
  // otherwise treat it as a URL by prepending https:// (no search fallback)
  const candidate = 'https://' + url
  try {
    const u = new URL(candidate)
    if (u.hostname === 'example.com') return DEFAULT_HOME
  } catch(e){}
  return candidate
}

// --- State helpers ---
function createEmptyState(){
  return {
    activeTab: null,
    tabs: [],
    bookmarks: [],
    history: [],
    home: DEFAULT_HOME
  }
}
function saveState(){localStorage.setItem(STATE_KEY, JSON.stringify(state))}
function loadState(){
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || createEmptyState() }
  catch(e){ return createEmptyState() }
}

// --- Tab management ---
function addTab(url = state.home, opts = {}) {
  url = ensureUrl(url)
  const id = 't' + Date.now() + Math.random().toString(36).slice(2,8)
  // allow an optional display value for the address bar
  const tab = {id, title: url, url, history: [url], idx:0, display: opts.display || null}
  state.tabs.push(tab)
  state.activeTab = id
  saveState()
  render()
  if (!opts.background) focusTab(id)
}

function closeTab(id){
  const i = state.tabs.findIndex(t=>t.id===id)
  if (i === -1) return
  state.tabs.splice(i,1)
  if (state.activeTab === id) {
    const next = state.tabs[i] || state.tabs[i-1]
    state.activeTab = next ? next.id : null
  }
  saveState()
  render()
}

function focusTab(id){
  state.activeTab = id
  saveState()
  render()
}

function currentTab(){
  return state.tabs.find(t=>t.id===state.activeTab)
}

// --- Navigation ---
function navigate(tab, url, replace=false, display=null){
  // normalize input to a URL (do not convert to a search query)
  url = ensureUrl(url)
  // store the full url for iframe/navigation
  tab.url = url
  // store an optional display string to show in the address bar (keeps it from showing the full embed path)
  tab.display = display || null
  if (!replace) {
    tab.history = tab.history.slice(0, tab.idx + 1)
    tab.history.push(url)
    tab.idx = tab.history.length - 1
  } else {
    tab.history[tab.idx] = url
  }
  tab.title = url
  pushHistory(url)
  saveState()
  render()
}

function goOffset(tab, offset){
  const idx = tab.idx + offset
  if (idx < 0 || idx >= tab.history.length) return
  tab.idx = idx
  tab.url = tab.history[tab.idx]
  // clear any transient display when navigating history
  tab.display = null
  saveState()
  render()
}

// --- Bookmarks & history ---
function toggleBookmark(url){
  const i = state.bookmarks.indexOf(url)
  if (i === -1) state.bookmarks.unshift(url)
  else state.bookmarks.splice(i,1)
  saveState()
  render()
}

function pushHistory(url){
  state.history.unshift({url, ts: Date.now()})
  // cap history
  if (state.history.length > 200) state.history.length = 200
}

function clearHistory(){
  state.history = []
  saveState()
  render()
}

// New: remove single history item by index
function removeHistoryItem(idx){
  if (idx < 0 || idx >= state.history.length) return
  state.history.splice(idx,1)
  saveState()
  render()
}

// New: remove a bookmark by url
function removeBookmark(url){
  const i = state.bookmarks.indexOf(url)
  if (i === -1) return
  state.bookmarks.splice(i,1)
  saveState()
  render()
}

// --- Rendering ---
function render(){
  renderTabs()
  renderViewport()
  updateToolbarButtons()
}

function renderTabs(){
  tabbar.innerHTML = ''
  state.tabs.forEach(tab=>{
    const t = document.createElement('div')
    t.className = 'tab' + (tab.id === state.activeTab ? ' active' : '')
    t.setAttribute('role','tab')
    t.onclick = ()=>focusTab(tab.id)
    const title = document.createElement('span')
    // Show the same text as the address bar: use the transient display value if present, otherwise the tab's URL
    title.textContent = tab.display || tab.url
    const close = document.createElement('button')
    close.className = 'close'
    close.textContent = '✕'
    close.onclick = (e)=>{ e.stopPropagation(); closeTab(tab.id) }
    t.appendChild(title)
    t.appendChild(close)
    tabbar.appendChild(t)
  })
}

function renderViewport(){
  const active = currentTab()
  viewport.innerHTML = ''
  if (!active){
    const empty = document.createElement('div')
    empty.style.display='flex'; empty.style.alignItems='center'; empty.style.justifyContent='center'
    empty.style.color='var(--muted)'
    empty.textContent = 'No tab'
    viewport.appendChild(empty)
    address.value = ''
    return
  }

  // show display value if present, otherwise show actual url
  address.value = active.display || active.url
  const iframe = document.createElement('iframe')
  iframe.className = 'webview'
  iframe.src = active.url
  iframe.sandbox = 'allow-scripts allow-forms allow-same-origin allow-popups allow-modals'
  iframe.onload = ()=>{
    try {
      const docTitle = iframe.contentDocument && iframe.contentDocument.title
      if (docTitle) {
        active.title = docTitle
        // clear any transient display once the actual page loads and provides a real title
        active.display = null
        saveState()
        renderTabs()
      }
    } catch(e){}
  }
  viewport.appendChild(iframe)
}

// sidebar removed — bookmarks and history are still accessible via popups; no sidebar DOM updates needed

// --- Popups control ---
class PopupManager {
  constructor() {
    this.activePopup = null
  }

  show(popupId) {
    this.hide()
    const popup = el(popupId)
    if (!popup) return
    
    popupOverlay.classList.add('active')
    popup.classList.add('active')
    this.activePopup = popupId
    
    if (popupId === 'popupBookmarks') renderBookmarksPopup()
    else if (popupId === 'popupHistory') renderHistoryPopup()
  }

  hide() {
    if (this.activePopup) {
      el(this.activePopup).classList.remove('active')
      this.activePopup = null
    }
    popupOverlay.classList.remove('active')
  }
}

const popupMgr = new PopupManager()

function renderBookmarksPopup(){
  const list = popupBookmarks.querySelector('.popupBody')
  list.innerHTML = ''
  state.bookmarks.forEach(b=>{
    const li = document.createElement('li')
    const text = document.createElement('span')
    text.textContent = shortTitle(b)
    text.style.cursor = 'pointer'
    text.onclick = ()=> {
      if (!state.activeTab) addTab(b)
      else navigate(currentTab(), b)
      popupMgr.hide()
    }
    const del = document.createElement('button')
    del.textContent = '🗑'
    del.title = 'Remove bookmark'
    del.onclick = (e)=>{
      e.stopPropagation()
      removeBookmark(b)
      renderBookmarksPopup()
    }
    li.appendChild(text)
    li.appendChild(del)
    list.appendChild(li)
  })
}

function renderHistoryPopup(){
  const list = popupHistory.querySelector('.popupBody')
  list.innerHTML = ''
  state.history.slice(0,50).forEach((h, idx)=>{
    const li = document.createElement('li')
    const d = new Date(h.ts)
    const text = document.createElement('span')
    text.textContent = shortTitle(h.url) + ' · ' + d.toLocaleTimeString()
    text.style.cursor = 'pointer'
    text.onclick = ()=> {
      if (!state.activeTab) addTab(h.url)
      else navigate(currentTab(), h.url)
      popupMgr.hide()
    }
    const del = document.createElement('button')
    del.textContent = '🗑'
    del.title = 'Remove history item'
    del.onclick = (e)=>{
      e.stopPropagation()
      removeHistoryItem(idx)
      renderHistoryPopup()
    }
    li.appendChild(text)
    li.appendChild(del)
    list.appendChild(li)
  })
}

// --- UI helpers ---
function updateToolbarButtons(){
  const tab = currentTab()
  backBtn.disabled = !(tab && tab.idx > 0)
  forwardBtn.disabled = !(tab && tab.idx < tab.history.length-1)
  bookmarkBtn.textContent = (tab && state.bookmarks.includes(tab.url)) ? '★' : '☆'
}

function shortTitle(url){
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname === '/' ? '' : u.pathname.split('/').slice(0,2).join('/'))
  } catch(e){
    return url.slice(0,40)
  }
}

// --- Event bindings ---
addressForm.addEventListener('submit', e=>{
  e.preventDefault()
  const val = address.value.trim()
  if (!val) return
  // If user typed something, navigate the view to the zombiesgenerator embed with the typed text as the page query.
  const target = 'https://zombiesgenerator.on.websim.com/?page=' + encodeURIComponent(val)
  if (!state.activeTab) addTab(target, { display: val })
  else navigate(currentTab(), target, false, val)
})

backBtn.addEventListener('click', ()=>{ const t=currentTab(); if (t) goOffset(t,-1) })
forwardBtn.addEventListener('click', ()=>{ const t=currentTab(); if (t) goOffset(t,1) })
reloadBtn.addEventListener('click', ()=>{ const t=currentTab(); if (t) { /* reload by replacing current url */ navigate(t, t.url, true) } })
homeBtn.addEventListener('click', ()=>{ if (!state.activeTab) addTab(state.home); else navigate(currentTab(), state.home) })
newTabBtn.addEventListener('click', ()=>addTab(state.home))
bookmarkBtn.addEventListener('click', ()=>{ const t=currentTab(); if (t) toggleBookmark(t.url) })

// popup buttons
openBookmarksBtn.addEventListener('click', ()=> popupMgr.show('popupBookmarks'))
openHistoryBtn.addEventListener('click', ()=> popupMgr.show('popupHistory'))
popupOverlay.addEventListener('click', ()=> popupMgr.hide())

// close buttons
document.querySelectorAll('.popupClose').forEach(btn=>{
  btn.addEventListener('click', ()=> popupMgr.hide())
})

clearHistoryBtn.addEventListener('click', (e)=>{
  e.stopPropagation()
  clearHistory()
  popupMgr.hide()
})

// keyboard: Ctrl/Cmd+T new tab, Ctrl+W close tab, Ctrl+L focus address, Esc close popup
document.addEventListener('keydown', (e)=>{
  if (e.ctrlKey || e.metaKey){
    if (e.key.toLowerCase() === 't'){ e.preventDefault(); addTab(state.home) }
    if (e.key.toLowerCase() === 'w'){ e.preventDefault(); if (state.activeTab) closeTab(state.activeTab) }
    if (e.key.toLowerCase() === 'l'){ e.preventDefault(); address.select(); address.focus() }
  }
  if (e.key === 'Escape') popupMgr.hide()
})

// expose some actions for dev console
window.__miniweb = {state, addTab, closeTab, navigate, clearHistory}

// initial save
saveState()