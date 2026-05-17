import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import title from "../lib/title.js";

const {
  handleTabUpdate,
  updateTabTitlePrefix,
  updateTitleWithPrefix,
  registerListeners,
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
    },
  };
}

beforeEach(() => {
  globalThis.browser = makeBrowserStub();
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
});

describe("handleTabUpdate", () => {
  it("skips contextualIdentities lookup when the active tab is in the default profile", async () => {
    browser.tabs.query.mockImplementation((_, cb) =>
      cb([{ id: 1, cookieStoreId: "firefox-default" }]),
    );

    handleTabUpdate();
    await Promise.resolve();

    expect(browser.contextualIdentities.get).not.toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("fetches the contextual identity and updates the title for non-default tabs", async () => {
    browser.tabs.query.mockImplementation((_, cb) =>
      cb([{ id: 1, cookieStoreId: "firefox-container-3" }]),
    );
    browser.contextualIdentities.get.mockResolvedValue({ name: "Banking" });

    handleTabUpdate();
    await Promise.resolve();

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
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalled();
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
