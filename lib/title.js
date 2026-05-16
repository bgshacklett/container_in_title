function handleTabUpdate() {

  browser.tabs.query({active: true, currentWindow: true}, tabs => {

    console.debug("tab:")
    console.debug(tabs[0])

    if (tabs[0].cookieStoreId == "firefox-default") {
      console.debug("Ignoring tab with default profile")
      return
    }

    browser.contextualIdentities.get(tabs[0].cookieStoreId).then(context => {
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
  .then(() => {
    console.debug(`Tab title updated with prefix "${prefix}"`);
  })
  .catch(e => console.error(e));
}

function registerListeners() {
  browser.tabs.onActivated.addListener(handleTabUpdate);
  browser.tabs.onUpdated.addListener(handleTabUpdate);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    handleTabUpdate,
    updateTitleWithPrefix,
    updateTabTitlePrefix,
    registerListeners,
  };
}
