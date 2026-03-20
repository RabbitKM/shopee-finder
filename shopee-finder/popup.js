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

function updateCheckboxes() {
  const rows = keywordList.querySelectorAll(".keyword-row");
  const hide = rows.length <= 2;
  rows.forEach(row => {
    const cb = row.querySelector("input[type=checkbox]");
    cb.style.display = hide ? "none" : "";
    // 回到 2 列時，強制恢復勾選避免搜尋出錯
    if (hide && !cb.checked) {
      cb.checked = true;
      row.classList.remove("unchecked");
    }
  });
}

function bindCheckbox(cb, row) {
  cb.addEventListener("change", () => {
    row.classList.toggle("unchecked", !cb.checked);
  });
}

function addKeywordRow(value = "", checked = true) {
  const row = document.createElement("div");
  row.className = "keyword-row";
  if (!checked) row.classList.add("unchecked");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  bindCheckbox(cb, row);

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "輸入關鍵字";
  if (value) input.value = value;

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.title = "移除";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateRemoveButtons();
    updateCheckboxes();
  });

  row.appendChild(cb);
  row.appendChild(input);
  row.appendChild(removeBtn);
  keywordList.appendChild(row);
}

addBtn.addEventListener("click", () => {
  addKeywordRow();
  updateRemoveButtons();
  updateCheckboxes();
  keywordList.lastElementChild.querySelector("input[type=text]").focus();
});

// 初始化：綁定預設兩列的刪除按鈕與 checkbox
keywordList.querySelectorAll(".keyword-row").forEach(row => {
  const cb = row.querySelector("input[type=checkbox]");
  if (cb) bindCheckbox(cb, row);

  row.querySelector(".remove-btn").addEventListener("click", () => {
    row.remove();
    updateRemoveButtons();
    updateCheckboxes();
  });
});
updateRemoveButtons();
updateCheckboxes();

// ── 開啟時還原上次的搜尋結果 ──
chrome.storage.local.get(["lastResult", "lastRows", "lastKeywords"], ({ lastResult, lastRows, lastKeywords }) => {
  const rows = lastRows ?? lastKeywords?.map(kw => ({ kw, checked: true }));
  if (rows?.length) {
    const existingRows = keywordList.querySelectorAll(".keyword-row");
    rows.forEach(({ kw, checked }, i) => {
      if (existingRows[i]) {
        existingRows[i].querySelector("input[type=text]").value = kw;
        const cb = existingRows[i].querySelector("input[type=checkbox]");
        cb.checked = checked;
        existingRows[i].classList.toggle("unchecked", !checked);
      } else {
        addKeywordRow(kw, checked);
      }
    });
    updateRemoveButtons();
    updateCheckboxes();
  }
  if (lastResult) renderResults(lastResult);
});

// ── 搜尋 ──
btn.addEventListener("click", async () => {
  const keywords = Array.from(keywordList.querySelectorAll(".keyword-row"))
    .filter(row => row.querySelector("input[type=checkbox]").checked)
    .map(row => row.querySelector("input[type=text]").value.trim())
    .filter(Boolean);

  if (keywords.length < 2) {
    setStatus("請至少勾選 2 個關鍵字", "error");
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

    // 儲存所有列（含未勾選）的狀態
    const allRows = Array.from(keywordList.querySelectorAll(".keyword-row")).map(row => ({
      kw: row.querySelector("input[type=text]").value.trim(),
      checked: row.querySelector("input[type=checkbox]").checked,
    }));
    chrome.storage.local.set({ lastResult: resp.result, lastRows: allRows });
    renderResults(resp.result);
  });
});

// ── 清除 ──
clearBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["lastResult", "lastRows", "lastKeywords"]);
  resultsEl.innerHTML = "";

  // 清空輸入值，多餘的列刪回剩 2 列，checkbox 全部重設為 checked
  const rows = keywordList.querySelectorAll(".keyword-row");
  rows.forEach((row, i) => {
    if (i < 2) {
      row.querySelector("input[type=text]").value = "";
      const cb = row.querySelector("input[type=checkbox]");
      cb.checked = true;
      row.classList.remove("unchecked");
    } else {
      row.remove();
    }
  });
  updateRemoveButtons();
  updateCheckboxes();

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
