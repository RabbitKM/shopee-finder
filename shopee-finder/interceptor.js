// 注入到 shopee.tw 主要 JS 環境，攔截蝦皮自己的搜尋 API 回應
// world: "MAIN" 確保能覆寫真實的 window.fetch

window.__searchCache__ = window.__searchCache__ || {};

const _origFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await _origFetch.apply(this, args);

  const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
  if (url.includes("api/v4/search/search_items")) {
    const clone = response.clone();
    clone
      .json()
      .then((data) => {
        const kw = new URL(url, location.href).searchParams.get("keyword");
        if (kw) {
          window.__searchCache__[kw] = data.items ?? data.data?.items ?? [];
        }
      })
      .catch(() => {});
  }

  return response;
};
