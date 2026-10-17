// Before styles and React; accepts the existing Zustand persisted format.
;(function () {
  var preference
  try {
    var saved = JSON.parse(localStorage.getItem('voltforge-theme') || 'null')
    preference = saved && saved.state && (saved.state.preference || saved.state.theme)
  } catch {}
  var theme = preference === 'dark' || preference === 'light' ? preference
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.classList.add(theme)
  document.documentElement.style.colorScheme = theme
  // First paint precedes the Vite module/CSS download.
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#171816' : '#F4F1E8'
})()
