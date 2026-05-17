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

function handleTabUpdate() {

  browser.tabs.query({active: true, currentWindow: true}, tabs => {

    if (tabs[0].cookieStoreId == "firefox-default") {
      return
    }

    getContext(tabs[0].cookieStoreId).then(context => {
        updateTabTitlePrefix(tabs[0].id, context)
      })
      .catch(
        e => console.error(e),
      )
  })
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
  browser.tabs.onActivated.addListener(handleTabUpdate);
  browser.tabs.onUpdated.addListener(handleTabUpdate, { properties: ["title"] });
  browser.contextualIdentities.onUpdated.addListener(invalidateContextCache);
  browser.contextualIdentities.onRemoved.addListener(invalidateContextCache);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    handleTabUpdate,
    updateTitleWithPrefix,
    updateTabTitlePrefix,
    registerListeners,
    clearContextCache,
  };
}
