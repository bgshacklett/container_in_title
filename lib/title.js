const contextCache = new Map();

function clearContextCache() {
  contextCache.clear();
}

function getContext(cookieStoreId) {
  const cached = contextCache.get(cookieStoreId);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  return browser.contextualIdentities.get(cookieStoreId).then((context) => {
    contextCache.set(cookieStoreId, context);
    return context;
  });
}

function invalidateContextCache(changeInfo) {
  const id = changeInfo && changeInfo.contextualIdentity && changeInfo.contextualIdentity.cookieStoreId;
  if (id) {
    contextCache.delete(id);
  }
}

function applyPrefixForTab(tab) {
  if (!tab || tab.cookieStoreId === "firefox-default") {
    return;
  }
  getContext(tab.cookieStoreId).then((context) => {
    updateTabTitlePrefix(tab.id, context);
  }).catch((e) => console.error(e));
}

function handleTabActivated(activeInfo) {
  browser.tabs.get(activeInfo.tabId)
    .then(applyPrefixForTab)
    .catch((e) => console.error(e));
}

function handleTabUpdated(_tabId, _changeInfo, tab) {
  applyPrefixForTab(tab);
}

function updateTitleWithPrefix(prefix) {
  const title = document.title;
  if (!title.startsWith(prefix)) {
    document.title = prefix + title;
  }
}

function updateTabTitlePrefix(tabId, context) {
  const separator = "▶️"
  const prefix = context.name + ` ${separator} `;
  browser.tabs.executeScript(
    tabId,
    {
      code: `(${updateTitleWithPrefix.toString()})(${JSON.stringify(prefix)})`
    }
  )
  .catch(e => console.error(e));
}

function registerListeners() {
  browser.tabs.onActivated.addListener(handleTabActivated);
  browser.tabs.onUpdated.addListener(handleTabUpdated, { properties: ["title"] });
  browser.contextualIdentities.onUpdated.addListener(invalidateContextCache);
  browser.contextualIdentities.onRemoved.addListener(invalidateContextCache);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    applyPrefixForTab,
    handleTabActivated,
    handleTabUpdated,
    updateTitleWithPrefix,
    updateTabTitlePrefix,
    registerListeners,
    clearContextCache,
  };
}
