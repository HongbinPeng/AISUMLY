// Background Service Worker - handles keyboard shortcuts and side panel setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    path: 'index.html',
    enabled: true,
  })
})
