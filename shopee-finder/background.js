// background.js
// 策略：導航到蝦皮搜尋頁，讓蝦皮自己的 JS 發 API request（帶正確的 token），
// interceptor.js 攔截回應存入 window.__searchCache__，我們再讀取。

const LIMIT = 20;
const LOAD_WAIT_MS = 5000; // 等待頁面 JS 發完 API request 的時間

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function getOrCreateShopeeTab() {
  const tabs = await chrome.tabs.query({ url: "https://shopee.tw/*" });
  if (tabs.length > 0) return tabs[0].id;

  const tab = await chrome.tabs.create({ url: "https://shopee.tw", active: false });
  await waitForTabLoad(tab.id);
  return tab.id;
}

async function searchShopee(tabId, keyword) {
  const searchUrl = `https://shopee.tw/search?keyword=${encodeURIComponent(keyword)}&page=0&sortBy=relevancy`;

  // 導航到搜尋頁，讓蝦皮自己觸發 API call
  await chrome.tabs.update(tabId, { url: searchUrl });
  await waitForTabLoad(tabId);
  await delay(LOAD_WAIT_MS); // 等蝦皮 JS 執行完 API request

  // 讀取 interceptor.js 存下的結果
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (kw) => window.__searchCache__?.[kw] ?? null,
    args: [keyword],
    world: "MAIN",
  });

  const items = results[0].result;
  if (!items) throw new Error(`搜尋「${keyword}」未攔截到資料（頁面可能尚未載入）`);
  return items;
}

function parseItem(item) {
  const b = item.item_basic ?? item;
  return {
    shopId:   b.shopid,
    shopName: b.shop_name ?? "（未知賣場）",
    itemId:   b.itemid,
    name:     b.name ?? "",
    price:    (b.price     ?? 0) / 100000,
    priceMin: (b.price_min ?? 0) / 100000,
    priceMax: (b.price_max ?? 0) / 100000,
    sold:     b.historical_sold ?? 0,
    rating:   Math.round((b.item_rating?.rating_star ?? 0) * 10) / 10,
    url:      `https://shopee.tw/product/${b.shopid}/${b.itemid}`,
  };
}

async function findCommonShops(keywords) {
  const tabId = await getOrCreateShopeeTab();
  const allResults = {};

  for (const kw of keywords) {
    const rawItems = await searchShopee(tabId, kw);
    const shopMap = {};
    for (const raw of rawItems) {
      const item = parseItem(raw);
      if (!item.shopId) continue;
      (shopMap[item.shopId] ??= []).push(item);
    }
    allResults[kw] = shopMap;
  }

  // 取交集
  const sets = keywords.map((kw) => new Set(Object.keys(allResults[kw])));
  const common = sets.reduce((a, b) => new Set([...a].filter((x) => b.has(x))));

  const shops = [];
  for (const sid of common) {
    const firstKw = keywords[0];
    const shopName = allResults[firstKw][sid][0].shopName;
    const items = {};
    for (const kw of keywords) {
      items[kw] = allResults[kw][sid] ?? [];
    }
    shops.push({ shopId: sid, shopName, items });
  }

  return { shops, keywords };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "SEARCH") return;

  findCommonShops(msg.keywords)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err)   => sendResponse({ ok: false, error: err.message }));

  return true;
});
