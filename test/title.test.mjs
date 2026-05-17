import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import title from "../lib/title.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const {
  applyPrefixForTab,
  handleTabActivated,
  handleTabUpdated,
  updateTabTitlePrefix,
  updateTitleWithPrefix,
  registerListeners,
  clearContextCache,
} = title;

function makeBrowserStub() {
  return {
    tabs: {
      get: vi.fn(),
      executeScript: vi.fn(() => Promise.resolve()),
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    contextualIdentities: {
      get: vi.fn(),
      onUpdated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
  };
}

beforeEach(() => {
  globalThis.browser = makeBrowserStub();
  clearContextCache();
});

afterEach(() => {
  delete globalThis.browser;
});

describe("updateTitleWithPrefix", () => {
  beforeEach(() => {
    document.title = "";
  });

  it("prepends the prefix when the title does not already start with it", () => {
    document.title = "Example Page";
    updateTitleWithPrefix("Personal ▶️ ");
    expect(document.title).toBe("Personal ▶️ Example Page");
  });

  it("is a no-op when the title already starts with the prefix", () => {
    document.title = "Personal ▶️ Example Page";
    updateTitleWithPrefix("Personal ▶️ ");
    expect(document.title).toBe("Personal ▶️ Example Page");
  });
});

describe("updateTabTitlePrefix", () => {
  it("calls executeScript on the given tab with a prefix derived from context.name", () => {
    updateTabTitlePrefix(42, { name: "Work" });
    expect(browser.tabs.executeScript).toHaveBeenCalledOnce();
    const [tabId, opts] = browser.tabs.executeScript.mock.calls[0];
    expect(tabId).toBe(42);
    expect(opts.code).toContain('"Work ▶️ "');
    expect(opts.code).toContain("function updateTitleWithPrefix");
  });
});

describe("registerListeners", () => {
  it("binds handleTabActivated to tabs.onActivated with no filter", () => {
    registerListeners();
    expect(browser.tabs.onActivated.addListener).toHaveBeenCalledOnce();
    expect(browser.tabs.onActivated.addListener.mock.calls[0]).toEqual([
      handleTabActivated,
    ]);
  });

  it("binds handleTabUpdated to tabs.onUpdated filtered to title changes only", () => {
    registerListeners();
    expect(browser.tabs.onUpdated.addListener).toHaveBeenCalledOnce();
    expect(browser.tabs.onUpdated.addListener.mock.calls[0]).toEqual([
      handleTabUpdated,
      { properties: ["title"] },
    ]);
  });

  it("binds an invalidator to contextualIdentities.onUpdated", () => {
    registerListeners();
    expect(browser.contextualIdentities.onUpdated.addListener).toHaveBeenCalledOnce();
    expect(typeof browser.contextualIdentities.onUpdated.addListener.mock.calls[0][0]).toBe(
      "function",
    );
  });

  it("binds an invalidator to contextualIdentities.onRemoved", () => {
    registerListeners();
    expect(browser.contextualIdentities.onRemoved.addListener).toHaveBeenCalledOnce();
    expect(typeof browser.contextualIdentities.onRemoved.addListener.mock.calls[0][0]).toBe(
      "function",
    );
  });
});

describe("applyPrefixForTab", () => {
  it("skips contextualIdentities lookup when the tab is in the default profile", async () => {
    applyPrefixForTab({ id: 1, cookieStoreId: "firefox-default" });
    await flushPromises();

    expect(browser.contextualIdentities.get).not.toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("fetches the contextual identity and applies the prefix for a container tab", async () => {
    browser.contextualIdentities.get.mockResolvedValue({ name: "Banking" });

    applyPrefixForTab({ id: 7, cookieStoreId: "firefox-container-3" });
    await flushPromises();

    expect(browser.contextualIdentities.get).toHaveBeenCalledWith("firefox-container-3");
    expect(browser.tabs.executeScript).toHaveBeenCalledOnce();
    const [tabId, opts] = browser.tabs.executeScript.mock.calls[0];
    expect(tabId).toBe(7);
    expect(opts.code).toContain('"Banking ▶️ "');
  });

  it("logs an error and skips executeScript when contextualIdentities rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    browser.contextualIdentities.get.mockRejectedValue(new Error("nope"));

    applyPrefixForTab({ id: 1, cookieStoreId: "firefox-container-3" });
    await flushPromises();

    expect(consoleError).toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("ignores undefined tabs (defensive)", async () => {
    applyPrefixForTab(undefined);
    await flushPromises();
    expect(browser.contextualIdentities.get).not.toHaveBeenCalled();
  });
});

describe("handleTabUpdated", () => {
  it("uses the tab from the event payload directly, without calling tabs.get", async () => {
    browser.contextualIdentities.get.mockResolvedValue({ name: "Banking" });
    const tab = { id: 99, active: true, windowId: 1, cookieStoreId: "firefox-container-3" };

    handleTabUpdated(99, { title: "New title" }, tab);
    await flushPromises();

    expect(browser.tabs.get).not.toHaveBeenCalled();
    expect(browser.contextualIdentities.get).toHaveBeenCalledWith("firefox-container-3");
    expect(browser.tabs.executeScript).toHaveBeenCalledOnce();
    expect(browser.tabs.executeScript.mock.calls[0][0]).toBe(99);
  });

  it("prefixes a non-active tab in a non-focused window when its title changes", async () => {
    // Regression: previously, the handler only ever updated the active tab
    // in the focused window, so a link opened in a new background container
    // tab wouldn't get its prefix until the user switched to it.
    browser.contextualIdentities.get.mockResolvedValue({ name: "Banking" });
    const backgroundTab = {
      id: 42,
      active: false,
      windowId: 99,
      cookieStoreId: "firefox-container-3",
    };

    handleTabUpdated(42, { title: "Loaded page" }, backgroundTab);
    await flushPromises();

    expect(browser.tabs.executeScript).toHaveBeenCalledOnce();
    expect(browser.tabs.executeScript.mock.calls[0][0]).toBe(42);
  });
});

describe("handleTabActivated", () => {
  it("fetches the activated tab and applies the prefix when in a container", async () => {
    browser.tabs.get.mockResolvedValue({
      id: 5,
      cookieStoreId: "firefox-container-3",
    });
    browser.contextualIdentities.get.mockResolvedValue({ name: "Banking" });

    handleTabActivated({ tabId: 5, windowId: 1, previousTabId: 4 });
    await flushPromises();

    expect(browser.tabs.get).toHaveBeenCalledWith(5);
    expect(browser.tabs.executeScript).toHaveBeenCalledOnce();
    expect(browser.tabs.executeScript.mock.calls[0][0]).toBe(5);
  });

  it("does nothing when the activated tab is in the default profile", async () => {
    browser.tabs.get.mockResolvedValue({
      id: 5,
      cookieStoreId: "firefox-default",
    });

    handleTabActivated({ tabId: 5, windowId: 1 });
    await flushPromises();

    expect(browser.contextualIdentities.get).not.toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("logs an error and skips processing when tabs.get rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    browser.tabs.get.mockRejectedValue(new Error("tab gone"));

    handleTabActivated({ tabId: 5, windowId: 1 });
    await flushPromises();

    expect(consoleError).toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("contextualIdentities cache", () => {
  it("only calls contextualIdentities.get once for repeated lookups of the same container", async () => {
    const tab = { id: 1, cookieStoreId: "firefox-container-3" };
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    applyPrefixForTab(tab);
    await flushPromises();
    applyPrefixForTab(tab);
    await flushPromises();

    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(1);
    expect(browser.tabs.executeScript).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when contextualIdentities.onUpdated fires for the cached id", async () => {
    const tab = { id: 1, cookieStoreId: "firefox-container-3" };
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    registerListeners();
    const invalidator =
      browser.contextualIdentities.onUpdated.addListener.mock.calls[0][0];

    applyPrefixForTab(tab);
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(1);

    invalidator({
      contextualIdentity: {
        cookieStoreId: "firefox-container-3",
        name: "Banking renamed",
      },
    });

    applyPrefixForTab(tab);
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when contextualIdentities.onRemoved fires for the cached id", async () => {
    const tab = { id: 1, cookieStoreId: "firefox-container-3" };
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    registerListeners();
    const invalidator =
      browser.contextualIdentities.onRemoved.addListener.mock.calls[0][0];

    applyPrefixForTab(tab);
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(1);

    invalidator({
      contextualIdentity: { cookieStoreId: "firefox-container-3" },
    });

    applyPrefixForTab(tab);
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);
  });

  it("does not invalidate unrelated cached ids when one is updated", async () => {
    browser.contextualIdentities.get.mockImplementation((id) =>
      Promise.resolve({ cookieStoreId: id, name: `name-${id}` }),
    );

    registerListeners();
    const invalidator =
      browser.contextualIdentities.onUpdated.addListener.mock.calls[0][0];

    applyPrefixForTab({ id: 1, cookieStoreId: "firefox-container-3" });
    await flushPromises();
    applyPrefixForTab({ id: 2, cookieStoreId: "firefox-container-7" });
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);

    invalidator({
      contextualIdentity: { cookieStoreId: "firefox-container-3" },
    });

    applyPrefixForTab({ id: 2, cookieStoreId: "firefox-container-7" });
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);
  });
});

// Hard-coded IPC-call-count budgets for representative event bursts.
// Bursts are simulated sequentially with flushPromises() between each
// handleTabUpdated to model real-world timing, where title-change events
// fire far slower than IPC round-trips. If these numbers regress, the
// cache or filter behavior likely broke — check git blame on the
// changed code.
describe("perf budgets", () => {
  const BURST_SIZE = 20;

  it("single-container burst: 1 contextualIdentities.get for the whole burst", async () => {
    const tab = { id: 1, cookieStoreId: "firefox-container-3" };
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    for (let i = 0; i < BURST_SIZE; i++) {
      handleTabUpdated(tab.id, { title: `t${i}` }, tab);
      await flushPromises();
    }

    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(1);
    expect(browser.tabs.executeScript).toHaveBeenCalledTimes(BURST_SIZE);
  });

  it("multi-container burst: one contextualIdentities.get per unique container", async () => {
    const tabs = [
      { id: 1, cookieStoreId: "firefox-container-3" },
      { id: 2, cookieStoreId: "firefox-container-5" },
      { id: 3, cookieStoreId: "firefox-container-7" },
    ];
    browser.contextualIdentities.get.mockImplementation((id) =>
      Promise.resolve({ cookieStoreId: id, name: `name-${id}` }),
    );

    for (let i = 0; i < BURST_SIZE; i++) {
      const tab = tabs[i % tabs.length];
      handleTabUpdated(tab.id, { title: `t${i}` }, tab);
      await flushPromises();
    }

    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(tabs.length);
    expect(browser.tabs.executeScript).toHaveBeenCalledTimes(BURST_SIZE);
  });

  it("default-profile burst: zero IPC", async () => {
    const tab = { id: 1, cookieStoreId: "firefox-default" };

    for (let i = 0; i < BURST_SIZE; i++) {
      handleTabUpdated(tab.id, { title: `t${i}` }, tab);
      await flushPromises();
    }

    expect(browser.contextualIdentities.get).not.toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("invalidation mid-burst: one re-fetch after onUpdated, no other re-fetches", async () => {
    const tab = { id: 1, cookieStoreId: "firefox-container-3" };
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    registerListeners();
    const invalidator =
      browser.contextualIdentities.onUpdated.addListener.mock.calls[0][0];

    for (let i = 0; i < BURST_SIZE / 2; i++) {
      handleTabUpdated(tab.id, { title: `t${i}` }, tab);
      await flushPromises();
    }

    invalidator({
      contextualIdentity: {
        cookieStoreId: "firefox-container-3",
        name: "Banking renamed",
      },
    });

    for (let i = 0; i < BURST_SIZE / 2; i++) {
      handleTabUpdated(tab.id, { title: `t${i + BURST_SIZE / 2}` }, tab);
      await flushPromises();
    }

    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);
    expect(browser.tabs.executeScript).toHaveBeenCalledTimes(BURST_SIZE);
  });
});
