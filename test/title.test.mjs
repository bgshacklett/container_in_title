import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import title from "../lib/title.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const {
  handleTabUpdate,
  updateTabTitlePrefix,
  updateTitleWithPrefix,
  registerListeners,
  clearContextCache,
} = title;

function makeBrowserStub() {
  return {
    tabs: {
      query: vi.fn(),
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
  it("binds handleTabUpdate to tabs.onActivated with no filter", () => {
    registerListeners();
    expect(browser.tabs.onActivated.addListener).toHaveBeenCalledOnce();
    expect(browser.tabs.onActivated.addListener.mock.calls[0]).toEqual([
      handleTabUpdate,
    ]);
  });

  it("binds handleTabUpdate to tabs.onUpdated filtered to title changes only", () => {
    registerListeners();
    expect(browser.tabs.onUpdated.addListener).toHaveBeenCalledOnce();
    expect(browser.tabs.onUpdated.addListener.mock.calls[0]).toEqual([
      handleTabUpdate,
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

describe("contextualIdentities cache", () => {
  function setupActiveTab(cookieStoreId) {
    browser.tabs.query.mockImplementation((_, cb) =>
      cb([{ id: 1, cookieStoreId }]),
    );
  }

  it("only calls contextualIdentities.get once for repeated lookups of the same container", async () => {
    setupActiveTab("firefox-container-3");
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    handleTabUpdate();
    await flushPromises();
    handleTabUpdate();
    await flushPromises();

    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(1);
    expect(browser.tabs.executeScript).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when contextualIdentities.onUpdated fires for the cached id", async () => {
    setupActiveTab("firefox-container-3");
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    registerListeners();
    const invalidator =
      browser.contextualIdentities.onUpdated.addListener.mock.calls[0][0];

    handleTabUpdate();
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(1);

    invalidator({
      contextualIdentity: {
        cookieStoreId: "firefox-container-3",
        name: "Banking renamed",
      },
    });

    handleTabUpdate();
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when contextualIdentities.onRemoved fires for the cached id", async () => {
    setupActiveTab("firefox-container-3");
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    registerListeners();
    const invalidator =
      browser.contextualIdentities.onRemoved.addListener.mock.calls[0][0];

    handleTabUpdate();
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(1);

    invalidator({
      contextualIdentity: { cookieStoreId: "firefox-container-3" },
    });

    handleTabUpdate();
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

    setupActiveTab("firefox-container-3");
    handleTabUpdate();
    await flushPromises();
    setupActiveTab("firefox-container-7");
    handleTabUpdate();
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);

    invalidator({
      contextualIdentity: { cookieStoreId: "firefox-container-3" },
    });

    setupActiveTab("firefox-container-7");
    handleTabUpdate();
    await flushPromises();
    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);
  });
});

describe("handleTabUpdate", () => {
  it("skips contextualIdentities lookup when the active tab is in the default profile", async () => {
    browser.tabs.query.mockImplementation((_, cb) =>
      cb([{ id: 1, cookieStoreId: "firefox-default" }]),
    );

    handleTabUpdate();
    await flushPromises();

    expect(browser.contextualIdentities.get).not.toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("fetches the contextual identity and updates the title for non-default tabs", async () => {
    browser.tabs.query.mockImplementation((_, cb) =>
      cb([{ id: 1, cookieStoreId: "firefox-container-3" }]),
    );
    browser.contextualIdentities.get.mockResolvedValue({ name: "Banking" });

    handleTabUpdate();
    await flushPromises();

    expect(browser.contextualIdentities.get).toHaveBeenCalledWith(
      "firefox-container-3",
    );
    expect(browser.tabs.executeScript).toHaveBeenCalledOnce();
    const [tabId, opts] = browser.tabs.executeScript.mock.calls[0];
    expect(tabId).toBe(1);
    expect(opts.code).toContain('"Banking ▶️ "');
  });

  it("logs an error and skips executeScript when contextualIdentities rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    browser.tabs.query.mockImplementation((_, cb) =>
      cb([{ id: 1, cookieStoreId: "firefox-container-3" }]),
    );
    browser.contextualIdentities.get.mockRejectedValue(new Error("nope"));

    handleTabUpdate();
    await flushPromises();
    await flushPromises();

    expect(consoleError).toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

// Hard-coded IPC-call-count budgets for representative event bursts.
// Bursts are simulated sequentially with flushPromises() between each
// handleTabUpdate to model real-world timing, where title-change events
// fire far slower than IPC round-trips. If these numbers regress, the
// cache or filter behavior likely broke — check git blame on the
// changed code.
describe("perf budgets", () => {
  const BURST_SIZE = 20;

  function setActiveTab(cookieStoreId) {
    browser.tabs.query.mockImplementation((_, cb) =>
      cb([{ id: 1, cookieStoreId }]),
    );
  }

  it("single-container burst: 1 contextualIdentities.get for the whole burst", async () => {
    setActiveTab("firefox-container-3");
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    for (let i = 0; i < BURST_SIZE; i++) {
      handleTabUpdate();
      await flushPromises();
    }

    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(1);
    expect(browser.tabs.executeScript).toHaveBeenCalledTimes(BURST_SIZE);
  });

  it("multi-container burst: one contextualIdentities.get per unique container", async () => {
    const containers = [
      "firefox-container-3",
      "firefox-container-5",
      "firefox-container-7",
    ];
    browser.contextualIdentities.get.mockImplementation((id) =>
      Promise.resolve({ cookieStoreId: id, name: `name-${id}` }),
    );

    for (let i = 0; i < BURST_SIZE; i++) {
      setActiveTab(containers[i % containers.length]);
      handleTabUpdate();
      await flushPromises();
    }

    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(containers.length);
    expect(browser.tabs.executeScript).toHaveBeenCalledTimes(BURST_SIZE);
  });

  it("default-profile burst: zero IPC beyond the per-event tabs.query", async () => {
    setActiveTab("firefox-default");

    for (let i = 0; i < BURST_SIZE; i++) {
      handleTabUpdate();
      await flushPromises();
    }

    expect(browser.contextualIdentities.get).not.toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("invalidation mid-burst: one re-fetch after onUpdated, no other re-fetches", async () => {
    setActiveTab("firefox-container-3");
    browser.contextualIdentities.get.mockResolvedValue({
      cookieStoreId: "firefox-container-3",
      name: "Banking",
    });

    registerListeners();
    const invalidator =
      browser.contextualIdentities.onUpdated.addListener.mock.calls[0][0];

    for (let i = 0; i < BURST_SIZE / 2; i++) {
      handleTabUpdate();
      await flushPromises();
    }

    invalidator({
      contextualIdentity: {
        cookieStoreId: "firefox-container-3",
        name: "Banking renamed",
      },
    });

    for (let i = 0; i < BURST_SIZE / 2; i++) {
      handleTabUpdate();
      await flushPromises();
    }

    expect(browser.contextualIdentities.get).toHaveBeenCalledTimes(2);
    expect(browser.tabs.executeScript).toHaveBeenCalledTimes(BURST_SIZE);
  });
});
