const btn       = document.getElementById("searchBtn");
const clearBtn  = document.getElementById("clearBtn");
const addBtn    = document.getElementById("addBtn");
const statusEl  = document.getElementById("status");
const resultsEl = document.getElementById("results");
const keywordList = document.getElementById("keyword-list");

// ── 關鍵字列管理 ──

function updateRemoveButtons() {
  const btns = keywordList.querySelectorAll(".remove-btn");
  const hide = btns.length <= 2;
  btns.forEach(b => { b.style.display = hide ? "none" : ""; });
}

function addKeywordRow(value = "") {
  const row = document.createElement("div");
  row.className = "keyword-row";
  row.innerHTML = `<input type="text" placeholder="輸入關鍵字">`;

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.title = "移除";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateRemoveButtons();
  });

  row.appendChild(removeBtn);
  if (value) row.querySelector("input").value = value;
  keywordList.appendChild(row);
}

addBtn.addEventListener("click", () => {
  addKeywordRow();
  updateRemoveButtons();
  keywordList.lastElementChild.querySelector("input").focus();
});

// 初始化：綁定預設兩列的刪除按鈕
keywordList.querySelectorAll(".remove-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    btn.closest(".keyword-row").remove();
    updateRemoveButtons();
  });
});
updateRemoveButtons();

// ── 開啟時還原上次的搜尋結果 ──
chrome.storage.local.get(["lastResult", "lastKeywords"], ({ lastResult, lastKeywords }) => {
  if (lastKeywords?.length) {
    const inputs = keywordList.querySelectorAll("input");
    lastKeywords.forEach((kw, i) => {
      if (inputs[i]) {
        inputs[i].value = kw;
      } else {
        addKeywordRow(kw);
      }
    });
    updateRemoveButtons();
  }
  if (lastResult) renderResults(lastResult);
});

// ── 搜尋 ──
btn.addEventListener("click", async () => {
  const keywords = Array.from(keywordList.querySelectorAll("input"))
    .map(i => i.value.trim()).filter(Boolean);

  if (keywords.length < 2) {
    setStatus("請輸入至少 2 個關鍵字", "error");
    return;
  }

  setStatus("搜尋中，請稍候…", "loading");
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

    chrome.storage.local.set({ lastResult: resp.result, lastKeywords: keywords });
    renderResults(resp.result);
  });
});

// ── 清除 ──
clearBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["lastResult", "lastKeywords"]);
  resultsEl.innerHTML = "";

  // 清空輸入值，多餘的列刪回剩 2 列
  const rows = keywordList.querySelectorAll(".keyword-row");
  rows.forEach((row, i) => {
    if (i < 2) row.querySelector("input").value = "";
    else row.remove();
  });
  updateRemoveButtons();

  setStatus("", "");
  clearBtn.style.display = "none";
});

// ── 工具函式 ──
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

    // 計算買齊估價
    let minTotal = 0, maxTotal = 0;
    for (const kw of keywords) {
      const kwItems = shop.items[kw] ?? [];
      if (kwItems.length === 0) continue;
      minTotal += Math.min(...kwItems.map(i => i.priceMin));
      maxTotal += Math.max(...kwItems.map(i => i.priceMax));
    }
    const totalEl = document.createElement("div");
    totalEl.className = "shop-total";
    const totalStr = minTotal === maxTotal
      ? `NT$${minTotal.toFixed(0)}`
      : `<span class="total-min">最低 NT$${minTotal.toFixed(0)}</span> <span class="total-sep">/</span> <span class="total-max">最高 NT$${maxTotal.toFixed(0)}</span>`;
    totalEl.innerHTML = `<span class="total-label">合購估價：</span><span class="total-range">${totalStr}</span>`;
    card.appendChild(totalEl);

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
          <div class="item-meta">${priceStr} ／ ⭐ ${item.rating} ／ 已售 ${item.sold}${item.delivery ? ` ／ 🚚 ${item.delivery}` : ""}</div>
        `;
        card.appendChild(row);
      }
    }

    resultsEl.appendChild(card);
  }
}
