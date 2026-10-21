chrome.runtime.onInstalled.addListener(async details => {
  const {installs = 0} = await chrome.storage.local.get('installs');
  await chrome.storage.local.set({installs: installs + 1, lastReason: details.reason});
});
