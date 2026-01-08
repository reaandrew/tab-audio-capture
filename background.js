// Open UI in a new tab when extension icon clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'popup.html' });
});
