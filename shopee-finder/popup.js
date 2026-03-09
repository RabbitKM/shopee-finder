const btn       = document.getElementById("searchBtn");
const clearBtn  = document.getElementById("clearBtn");
const statusEl  = document.getElementById("status");
const resultsEl = document.getElementById("results");

// ── 開啟 popup 時，還原上次的搜尋結果 ──
chrome.storage.local.get(["lastResult", "lastKeywords"], ({ lastResult, lastKeywords }) => {
  if (lastResult) {
    if (lastKeywords) {
      document.getElementById("keywords").value = lastKeywords.join("\n");
    }
    renderResults(lastResult);
  }
});

btn.addEventListener("click", async () => {
  const raw = document.getElementById("keywords").value;
  const keywords = raw.split("\n").map((s) => s.trim()).filter(Boolean);

  if (keywords.length < 2) {
    setStatus("請輸入至少 2 個關鍵字", "error");
    return;
  }

  setStatus("搜尋中，請稍候…（每個關鍵字約需 5 秒）", "loading");
  btn.disabled = true;
  clearBtn.style.display = "none";
  resultsEl.innerHTML = "";

  chrome.runtime.sendMessage({ type: "SEARCH", keywords }, (resp) => {
    btn.disabled = false;
    clearBtn.style.display = "";

    if (!resp || !resp.ok) {
      setStatus(`搜尋失敗：${resp?.error ?? "未知錯誤"}`, "error");
      return;
    }

    // 儲存結果，讓下次開啟 popup 時自動還原
    chrome.storage.local.set({ lastResult: resp.result, lastKeywords: keywords });
    renderResults(resp.result);
  });
});

clearBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["lastResult", "lastKeywords"]);
  resultsEl.innerHTML = "";
  document.getElementById("keywords").value = "";
  setStatus("", "");
  clearBtn.style.display = "none";
});

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = type;
}

function renderResults({ shops, keywords }) {
  resultsEl.innerHTML = "";

  if (shops.length === 0) {
    setStatus("❌ 找不到同時販售所有商品的賣場（可嘗試減少關鍵字）", "error");
    clearBtn.style.display = "";
    return;
  }

  setStatus(`✅ 找到 ${shops.length} 間賣場`, "success");
  clearBtn.style.display = "";

  for (const shop of shops) {
    const card = document.createElement("div");
    card.className = "shop-card";

    const header = document.createElement("div");
    header.className = "shop-header";
    header.innerHTML = `
      <span class="shop-name">🏪 ${shop.shopName}</span>
      <a href="https://shopee.tw/shop/${shop.shopId}/" target="_blank" class="shop-link">賣場頁面 ↗</a>
    `;
    card.appendChild(header);

    for (const kw of keywords) {
      for (const item of shop.items[kw] ?? []) {
        const priceStr =
          item.priceMin !== item.priceMax
            ? `NT$${item.priceMin.toFixed(0)}～${item.priceMax.toFixed(0)}`
            : `NT$${item.price.toFixed(0)}`;

        const row = document.createElement("div");
        row.className = "item-row";
        row.innerHTML = `
          <div class="item-tag">${kw}</div>
          <a href="${item.url}" target="_blank" class="item-name">${item.name}</a>
          <div class="item-meta">${priceStr} ／ ⭐ ${item.rating} ／ 已售 ${item.sold}</div>
        `;
        card.appendChild(row);
      }
    }

    resultsEl.appendChild(card);
  }
}
