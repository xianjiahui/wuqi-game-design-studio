const $ = (selector) => document.querySelector(selector);
const html = (value) => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const menuData = JSON.parse($("#menuData").textContent);
const categories = ["全部", "肉菜", "海鲜", "素菜", "主食", "汤与锅", "♥ 收藏"];
const categoryArt = ["kitty", "bow", "sparkle", "berry", "heart", "sparkle", "heart"];
const onlineKitchen = window.kitchenConfig !== undefined;

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(localStateKey()));
    return {
      edits: saved?.edits ?? {},
      added: saved?.added ?? [],
      favorites: saved?.favorites ?? [],
      orders: saved?.orders ?? [],
      sender: saved?.sender ?? "",
      receiver: saved?.receiver ?? ""
    };
  } catch {
    return { edits: {}, added: [], favorites: [], orders: [], sender: "", receiver: "" };
  }
}

function localStateKey() {
  return onlineKitchen ? "pipi-kitchen-shared-" + kitchenUser : "pipi-kitchen-menu-v2";
}

let state = readState();
const cart = new Map();
let activeCategory = "全部";
let draft = { sender: state.sender, receiver: state.receiver, meal: "今晚", note: "" };
let toastTimer;
let currentPoster;
let posterUrl;
let posterRequest = 0;

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function saveState(next) {
  try {
    localStorage.setItem(localStateKey(), JSON.stringify(next));
  } catch {
    return false;
  }
  state = next;
  return true;
}

function dishes() {
  if (onlineKitchen) return sharedMenu;
  return [...state.added, ...menuData.dishes].map(dish => ({ ...dish, ...state.edits[dish.id] }));
}

function getDish(id) {
  if (onlineKitchen) return sharedMenu.find(dish => dish.id === id);
  const dish = state.added.find(item => item.id === id) ?? menuData.dishes.find(item => item.id === id);
  return dish && { ...dish, ...state.edits[id] };
}

function dateText(timestamp) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  });
}

function quantityControls(dish) {
  const quantity = cart.get(dish.id) ?? 0;
  const name = html(dish.name);
  return `<div class="stepper">
    ${quantity ? `<button type="button" class="step" data-minus="${dish.id}" aria-label="减少${name}">−</button><span>${quantity}</span>` : ""}
    <button type="button" class="step plus" data-plus="${dish.id}" aria-label="添加${name}">＋</button>
  </div>`;
}

function dishCard(dish) {
  const favorite = state.favorites.includes(dish.id);
  const name = html(dish.name);
  return `<article class="dish" data-card="${dish.id}">
    <div class="dish-visual">
      <button class="dish-image-button" data-detail="${dish.id}" aria-label="查看${name}菜谱">
        ${dish.photo ? `<img src="${dish.photo}" alt="${name}" loading="lazy" decoding="async">` : '<span class="photo-placeholder" aria-hidden="true">♡</span>'}
      </button>
      <button class="favorite" data-favorite="${dish.id}" aria-label="${favorite ? "取消收藏" : "收藏"}${name}" aria-pressed="${favorite}">${favorite ? "♥" : "♡"}</button>
    </div>
    <div class="dish-body">
      <div class="dish-meta"><span><i class="pixel ${categoryArt[categories.indexOf(dish.category)] || "bow"}" aria-hidden="true"></i>${html(dish.category)}</span></div>
      <button class="dish-title" data-detail="${dish.id}">${name}</button>
      <div class="dish-actions"><span class="dish-time">${dish.minutes ? `约 ${dish.minutes} 分钟` : ""}</span>${quantityControls(dish)}</div>
    </div>
  </article>`;
}

function renderMenu() {
  const search = $("#search").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = dishes();
  const filtered = all.filter(dish => {
    const categoryMatch = activeCategory === "全部" || dish.category === activeCategory ||
      (activeCategory === "♥ 收藏" && state.favorites.includes(dish.id));
    const text = [dish.name, dish.category, dish.ingredients, dish.id].join(" ").toLowerCase();
    return categoryMatch && search.every(word => text.includes(word));
  });
  $("#menuCount").textContent = filtered.length === all.length ? `${all.length} 道菜` : `${filtered.length} / ${all.length} 道菜`;
  $("#dishes").innerHTML = filtered.map(dishCard).join("") ||
    '<p class="empty">没有找到菜品，试试其他食材或分类。</p>';
}

function renderFilters() {
  $("#filters").innerHTML = categories.map((category, index) =>
    `<button class="filter" data-category="${category}" aria-pressed="${category === activeCategory}"><i class="pixel ${categoryArt[index]}" aria-hidden="true"></i>${category.replace("♥ ", "")}</button>`).join("");
}

function renderBasket() {
  const quantity = [...cart.values()].reduce((sum, value) => sum + value, 0);
  $("#cartTotal").textContent = quantity ? `已选 ${quantity} 份` : "点菜篮";
  $("#cartHint").textContent = quantity ? `${cart.size} 道菜，生成图片后发给对方` : "从菜单里选一道喜欢的菜";
  $("#openCart").disabled = !quantity;
}

const dialog = $("#dialog");

function showDialog(content, view) {
  $("#dialogContent").innerHTML = content;
  dialog.dataset.view = view;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

function openDetail(dish) {
  showDialog(`
    <h2 id="dialogTitle">${html(dish.name)}</h2>
    <p class="detail-text">${html(dish.category)}${dish.minutes ? ` · 约 ${dish.minutes} 分钟` : ""}</p>
    ${dish.photo ? `<img class="detail-photo" src="${dish.photo}" alt="${html(dish.name)}">` : ""}
    <h3>${dish.reference ? "参考食材" : "食材"}</h3>
    <p class="detail-text">${html(dish.ingredients || "待补充")}</p>
    <h3>${dish.reference ? "参考做法" : "做法"}</h3>
    ${dish.steps.length ? `<ol class="recipe-steps">${dish.steps.map(step => `<li>${html(step)}</li>`).join("")}</ol>` : '<p class="detail-text">待补充</p>'}
    ${dish.reference ? '<p class="help">食材与做法是根据照片整理的家常参考，可换成你们自己的配方。</p>' : ""}
    <div class="row">${!onlineKitchen || kitchenUser ? `<button class="quiet" data-edit="${dish.id}">编辑菜谱</button>` : ""}<button class="button" data-detail-add="${dish.id}">＋ 加入点菜篮</button></div>
  `, "detail");
}

async function compressPhoto(file) {
  if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) {
    throw new Error("请选择 25 MB 以内的图片");
  }
  const url = URL.createObjectURL(file);
  try {
    const source = await loadImage(url);
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 900 / Math.max(source.width, source.height));
    canvas.width = Math.max(1, Math.round(source.width * ratio));
    canvas.height = Math.max(1, Math.round(source.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fffaf6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function openEditor(dish) {
  if (onlineKitchen && !kitchenUser) return;
  const edited = dish ?? { name: "", category: "肉菜", minutes: "", ingredients: "", steps: [] };
  showDialog(`
    <h2 id="dialogTitle">${dish ? "编辑菜谱" : "录入菜品"}</h2>
    <form id="editForm">
      <label class="field">菜名<input name="name" maxlength="32" required value="${html(edited.name)}"></label>
      <div class="order-fields">
        <label class="field">分类<select name="category">${categories.slice(1, -1).map(category =>
          `<option ${edited.category === category ? "selected" : ""}>${category}</option>`).join("")}</select></label>
        <label class="field">用时（分钟）<input name="minutes" type="number" min="1" max="1440" value="${edited.minutes}"></label>
      </div>
      <label class="field">食材<textarea name="ingredients" maxlength="600">${html(edited.ingredients)}</textarea></label>
      <label class="field">做法（每行一步）<textarea name="steps" maxlength="2400" rows="4">${html(edited.steps.join("\n"))}</textarea></label>
      <label class="field">照片<input name="photo" type="file" accept="image/*"></label>
      <p class="help">${onlineKitchen ? "保存后，对方刷新菜单即可看到。" : "菜谱改动保存在当前浏览器。"}</p>
      <p class="help" id="editStatus" aria-live="polite"></p>
      <button class="button wide" type="submit">保存菜谱</button>
      ${onlineKitchen && dish ? `<div class="delete-dish">
        <button class="quiet delete-trigger" id="showDeleteDish" type="button" aria-expanded="false" aria-controls="deleteDishPrompt">删除菜品</button>
        <div id="deleteDishPrompt" hidden>
          <p class="help">确定从共享菜单删除「${html(dish.name)}」？删除后无法在网页恢复，已有订单记录会保留。</p>
          <div class="row">
            <button class="quiet" id="cancelDeleteDish" type="button">取消</button>
            <button class="button" id="confirmDeleteDish" type="button">确认删除</button>
          </div>
          <p class="help" id="deleteDishStatus" role="status"></p>
        </div>
      </div>` : ""}
    </form>`, "edit");
  const form = $("#editForm");
  const submit = form.querySelector("button[type=submit]");
  const deleteTrigger = $("#showDeleteDish");
  if (deleteTrigger) {
    const prompt = $("#deleteDishPrompt");
    const cancel = $("#cancelDeleteDish");
    const confirm = $("#confirmDeleteDish");
    const status = $("#deleteDishStatus");
    const setConfirmation = visible => {
      prompt.hidden = !visible;
      deleteTrigger.hidden = visible;
      deleteTrigger.setAttribute("aria-expanded", String(visible));
      submit.disabled = visible;
      status.textContent = "";
      (visible ? cancel : deleteTrigger).focus();
    };
    deleteTrigger.onclick = () => setConfirmation(true);
    cancel.onclick = () => setConfirmation(false);
    confirm.onclick = async () => {
      confirm.disabled = cancel.disabled = true;
      status.textContent = "正在删除…";
      try {
        await deleteDish(dish);
        if (dialog.open && form.isConnected) dialog.close();
        notify("菜品已从共享菜单删除");
        refreshSharedMenu({ force: true }).catch(() => {});
      } catch (error) {
        status.textContent = error instanceof Error && !error.code ? error.message : "删除失败，请稍后重试。";
      } finally {
        confirm.disabled = cancel.disabled = false;
      }
    };
  }
  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const input = new FormData(form);
    const name = input.get("name").trim();
    if (!name) return;
    submit.disabled = true;
    if (deleteTrigger) deleteTrigger.disabled = true;
    try {
      const selected = input.get("photo");
      const photo = selected.size ? await compressPhoto(selected) : undefined;
      if (!dialog.open || !form.isConnected) return;
      const ingredients = input.get("ingredients").trim();
      const steps = input.get("steps").split(/\r?\n/).map(step => step.trim()).filter(Boolean);
      const reference = Boolean(edited.reference && ingredients === edited.ingredients && steps.join("\n") === edited.steps.join("\n"));
      const fields = {
        name, category: input.get("category"), minutes: Number(input.get("minutes")),
        ingredients, steps, reference
      };
      if (photo) fields.photo = photo;
      const next = { ...state };
      if (onlineKitchen) {
        delete fields.photo;
        await writeDish(dish, fields, photo);
        const synced = await refreshSharedMenu({ force: true }).then(() => true, () => false);
        if (!form.isConnected) return;
        if (!synced) {
          dialog.close();
          notify("菜谱已保存，请刷新菜单查看");
          return;
        }
      } else {
        if (dish) next.edits = { ...state.edits, [dish.id]: { ...state.edits[dish.id], ...fields } };
        else next.added = [{ id: "D" + Date.now().toString(36), ...fields }, ...state.added];
        if (!saveState(next)) throw new Error("浏览器存储不可用或空间不足，请减少照片大小后重试");
      }
      if (!dish) {
        activeCategory = "全部";
        $("#search").value = "";
        renderFilters();
      }
      renderMenu();
      dialog.close();
      notify("菜谱已保存");
    } catch (error) {
      if (form.isConnected) $("#editStatus").textContent = error.message || "照片读取失败";
    } finally {
      submit.disabled = false;
      if (deleteTrigger) deleteTrigger.disabled = false;
    }
  };
}

function removeFromCart(id) {
  if (!cart.delete(id) || !dialog.open || dialog.dataset.view !== "cart") return;
  document.querySelector(`[data-order-row="${id}"]`)?.remove();
  if (!cart.size) openCart();
  else $("#orderStatus").textContent = "已移除菜单中下架的菜品。";
}

function openCart() {
  const rows = [...cart].map(([id]) => {
    const dish = getDish(id);
    return `<div class="order-row" data-order-row="${dish.id}">
      ${dish.photo ? `<img src="${dish.photo}" alt="">` : ""}
      <strong>${html(dish.name)}</strong>${quantityControls(dish)}
    </div>`;
  }).join("");
  showDialog(`<h2 id="dialogTitle">点菜单</h2>
    <div id="orderRows">${rows || '<p class="empty">点菜篮空了，回到菜单选几道菜吧。</p>'}</div>
    <form id="orderForm" ${cart.size ? "" : "hidden"}>
      <div class="order-fields">
        <label class="field">点单人<input name="sender" maxlength="20" placeholder="你的昵称" value="${html(draft.sender)}"></label>
        <label class="field">收单人<input name="receiver" maxlength="20" placeholder="对方的昵称" value="${html(draft.receiver)}"></label>
      </div>
      <label class="field">用餐时间<input name="meal" maxlength="40" placeholder="例如：周六晚上 7 点" value="${html(draft.meal)}"></label>
      <label class="field">口味备注<textarea name="note" maxlength="180" placeholder="例如：少辣、不要香菜">${html(draft.note)}</textarea></label>
      <p class="help" id="orderStatus" aria-live="polite"></p>
      <button type="submit" class="button wide">生成下单图片 →</button>
    </form>`, "cart");
  const form = $("#orderForm");
  form.oninput = () => { draft = Object.fromEntries(new FormData(form)); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (!cart.size) return;
    const submit = form.querySelector("button");
    submit.disabled = true;
    const timestamp = Date.now();
    const order = {
      id: timestamp.toString(36).toUpperCase(),
      timestamp,
      ...draft,
      items: [...cart].map(([id, quantity]) => {
        const { name, category } = getDish(id);
        return { id, name, category, quantity };
      })
    };
    try {
      const file = await createPoster(order);
      if (!dialog.open || !form.isConnected) return;
      const saved = saveState({
        ...state, sender: draft.sender, receiver: draft.receiver, orders: [order, ...state.orders].slice(0, 50)
      });
      cart.clear();
      draft = { ...draft, note: "" };
      renderMenu();
      renderBasket();
      showPoster(file, saved ? "" : "当前浏览器未能保存订单记录，请保存图片。");
    } catch {
      if (form.isConnected) $("#orderStatus").textContent = "暂时无法生成图片，可以减少菜品数量后重试。";
    } finally {
      submit.disabled = false;
    }
  };
}

function changeQuantity(id, delta) {
  const dish = getDish(id);
  if (!dish) {
    notify("这道菜已从菜单移除");
    return;
  }
  const previous = cart.get(id) ?? 0;
  if (!previous && delta > 0 && cart.size >= 80) {
    notify("一张点菜单最多放 80 道菜");
    return;
  }
  const quantity = Math.max(0, Math.min(99, previous + delta));
  if (quantity) cart.set(id, quantity);
  else cart.delete(id);
  const card = document.querySelector(`[data-card="${id}"]`);
  if (card) card.querySelector(".stepper").outerHTML = quantityControls(dish);
  if (dialog.open && dialog.dataset.view === "cart") {
    const row = document.querySelector(`[data-order-row="${id}"]`);
    if (quantity && row) row.querySelector(".stepper").outerHTML = quantityControls(dish);
    else if (row) row.remove();
    if (!cart.size) openCart();
  }
  renderBasket();
}

function openHistory() {
  showDialog(`<h2 id="dialogTitle">订单记录</h2>
    <p class="help" id="historyStatus" aria-live="polite">本机最近 50 张点菜单，可再次生成图片。</p>
    ${state.orders.length ? state.orders.map(order => `<div class="history-row">
      <div><strong>${html(order.items.map(item => item.name).join("、"))}</strong>
        <p class="help">${dateText(order.timestamp)} · ${order.items.length} 道菜</p></div>
      <button class="quiet" data-order="${order.id}">查看图片</button>
    </div>`).join("") : '<p class="empty">生成第一张点菜单后，就能在这里找到它。</p>'}`, "history");
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https:\/\//.test(source)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片无法读取"));
    image.src = source;
  });
}

function coverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2,
    sourceWidth, sourceHeight, x, y, width, height);
}

function roundedBox(ctx, x, y, width, height, radius, color) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function setFont(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
}

function wrapText(ctx, input, width) {
  return String(input).split("\n").flatMap(paragraph => {
    const lines = [""];
    for (const char of paragraph) {
      const last = lines.length - 1;
      if (lines[last] && ctx.measureText(lines[last] + char).width > width) lines.push(char);
      else lines[last] += char;
    }
    return lines;
  });
}

async function createPoster(order) {
  const width = 880;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  setFont(ctx, 25);
  const direction = [order.sender.trim() || "点单人", order.receiver.trim() || "收单人"].join("  →  ");
  const information = wrapText(ctx, direction + (order.meal.trim() ? "\n用餐时间  " + order.meal.trim() : ""), 718);
  const note = order.note.trim() ? wrapText(ctx, order.note.trim(), 700) : [];
  const rowsStart = 285 + information.length * 35;
  const notesHeight = note.length ? 68 + note.length * 34 : 0;
  const rowsHeight = order.items.length * 94;
  const height = rowsStart + rowsHeight + notesHeight + 101;
  const pixelScale = Math.min(1, 7500 / height);
  canvas.width = Math.floor(width * pixelScale);
  canvas.height = Math.ceil(height * pixelScale);
  ctx.scale(pixelScale, pixelScale);
  const [cover, wallpaper, bow, ...images] = await Promise.all([
    loadImage(menuData.cover).catch(() => null),
    loadImage(menuData.art.wallpaper).catch(() => null),
    loadImage(menuData.art.bow).catch(() => null),
    ...order.items.map(item => {
      const photo = getDish(item.id)?.photo;
      return photo ? loadImage(photo).catch(() => null) : null;
    })
  ]);
  ctx.fillStyle = "#fffaf6";
  ctx.fillRect(0, 0, width, height);
  roundedBox(ctx, 28, 28, width - 56, 205, 22, "#f9e4ed");
  if (wallpaper) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(28, 28, width - 56, 205, 22);
    ctx.clip();
    ctx.globalAlpha = .38;
    ctx.fillStyle = ctx.createPattern(wallpaper, "repeat");
    ctx.fillRect(28, 28, width - 56, 205);
    ctx.restore();
  }
  if (cover) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(527, 28, 325, 205, [0, 22, 22, 0]);
    ctx.clip();
    ctx.fillStyle = "#fff0f2";
    ctx.fillRect(527, 28, 325, 205);
    ctx.drawImage(cover, 586, 28, 205, 205);
    ctx.restore();
  }
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#a8283b";
  setFont(ctx, 23, 750);
  ctx.fillText("屁屁厨房", 66, 83);
  if (bow) ctx.drawImage(bow, 171, 61, 31, 20);
  ctx.fillStyle = "#342320";
  setFont(ctx, 58, 800);
  ctx.fillText("今日点菜单", 64, 155);
  ctx.fillStyle = "#786461";
  setFont(ctx, 21);
  ctx.fillText(dateText(order.timestamp), 67, 198);
  ctx.fillStyle = "#342320";
  setFont(ctx, 25);
  information.forEach((line, i) => ctx.fillText(line, 66, 270 + i * 35));
  ctx.strokeStyle = "#e6ccc7";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  const divider = (y) => {
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(820, y);
    ctx.stroke();
  };
  divider(rowsStart - 13);
  order.items.forEach((item, index) => {
    const y = rowsStart + index * 94;
    const photo = images[index];
    if (photo) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(65, y + 5, 94, 70, 9);
      ctx.clip();
      coverImage(ctx, photo, 65, y + 5, 94, 70);
      ctx.restore();
    } else {
      roundedBox(ctx, 65, y + 5, 94, 70, 9, "#f7e2df");
      ctx.fillStyle = "#a8283b";
      setFont(ctx, 32);
      ctx.fillText("♡", 96, y + 50);
    }
    ctx.fillStyle = "#342320";
    setFont(ctx, 29, 750);
    const title = wrapText(ctx, item.name, 490);
    if (title.length === 1) {
      ctx.fillText(title[0], 180, y + 36);
      ctx.fillStyle = "#786461";
      setFont(ctx, 19);
      ctx.fillText(item.category, 181, y + 64);
    } else {
      title.forEach((line, i) => ctx.fillText(line, 180, y + 31 + i * 33));
    }
    ctx.fillStyle = "#a8283b";
    setFont(ctx, 28, 750);
    ctx.textAlign = "right";
    ctx.fillText(`× ${item.quantity}`, 812, y + 49);
    ctx.textAlign = "left";
    divider(y + 84);
  });
  const end = rowsStart + rowsHeight;
  if (note.length) {
    roundedBox(ctx, 59, end + 10, 762, notesHeight - 12, 13, "#f9ebe6");
    ctx.fillStyle = "#a8283b";
    setFont(ctx, 22, 750);
    ctx.fillText("口味备注", 80, end + 46);
    ctx.fillStyle = "#342320";
    setFont(ctx, 25);
    note.forEach((line, i) => ctx.fillText(line, 80, end + 79 + i * 34));
  }
  ctx.fillStyle = "#786461";
  setFont(ctx, 21);
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  ctx.fillText(`共 ${order.items.length} 道菜 · ${quantity} 份`, 65, height - 39);
  ctx.textAlign = "right";
  ctx.fillText(order.id, 812, height - 39);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(result =>
    result ? resolve(result) : reject(new Error("生成图片失败")), "image/png"));
  return new File([blob], `屁屁厨房-点菜单-${order.id}.png`, { type: "image/png" });
}

function showPoster(file, notice) {
  if (posterUrl) URL.revokeObjectURL(posterUrl);
  currentPoster = file;
  posterUrl = URL.createObjectURL(file);
  const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  showDialog(`
    <h2 id="dialogTitle">下单图片已生成</h2>
    <p class="help">${notice ? html(notice) + " " : ""}下载图片或在手机上长按保存，再发给对方。</p>
    <img class="poster-preview" src="${posterUrl}" alt="已生成的屁屁厨房点菜单">
    <div class="row">
      ${canShare ? '<button class="quiet" id="sharePoster">分享图片</button>' : ""}
      <a class="button" href="${posterUrl}" download="${html(file.name)}">下载 PNG</a>
    </div><p class="help" id="shareStatus" aria-live="polite"></p>`, "poster");
  if (canShare) $("#sharePoster").onclick = async () => {
    try {
      await navigator.share({ files: [currentPoster] });
    } catch (error) {
      if (error.name !== "AbortError") $("#shareStatus").textContent = "可以下载图片后，在微信里手动发送。";
    }
  };
}

document.body.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  const { category, favorite, plus, minus, detail, detailAdd, edit, order } = button.dataset;
  if (button.hasAttribute("data-close")) dialog.close();
  if (category) {
    activeCategory = category;
    for (const filter of $("#filters").children) filter.setAttribute("aria-pressed", filter === button);
    renderMenu();
  }
  if (favorite) {
    const wasFavorite = state.favorites.includes(favorite);
    const favorites = wasFavorite ? state.favorites.filter(id => id !== favorite) : [...state.favorites, favorite];
    if (saveState({ ...state, favorites })) {
      if (activeCategory === "♥ 收藏") renderMenu();
      else {
        button.textContent = wasFavorite ? "♡" : "♥";
        button.setAttribute("aria-pressed", !wasFavorite);
        button.setAttribute("aria-label", (wasFavorite ? "收藏" : "取消收藏") + getDish(favorite).name);
      }
    } else notify("当前浏览器无法保存收藏");
  }
  if (plus) changeQuantity(plus, 1);
  if (minus) changeQuantity(minus, -1);
  if (detail || edit) {
    const dish = getDish(detail || edit);
    if (!dish) {
      dialog.close();
      notify("这道菜已从菜单移除");
    } else if (detail) openDetail(dish);
    else openEditor(dish);
  }
  if (detailAdd) {
    changeQuantity(detailAdd, 1);
    dialog.close();
  }
  if (order) {
    const request = ++posterRequest;
    button.disabled = true;
    try {
      const saved = state.orders.find(item => item.id === order);
      const file = await createPoster(saved);
      if (dialog.open && dialog.dataset.view === "history" && button.isConnected && request === posterRequest) showPoster(file);
    } catch {
      if (button.isConnected) $("#historyStatus").textContent = "暂时无法生成图片，请重试。";
    } finally {
      button.disabled = false;
    }
  }
});

$("#heroImage").src = menuData.cover;
$("#stillKitty").srcset = menuData.art.kitty;
$("#menuKitty").src = menuData.art["kitty-bounce"];
for (const [name, image] of Object.entries(menuData.art)) {
  document.documentElement.style.setProperty("--art-" + name, `url("${image}")`);
}
$("#search").addEventListener("input", renderMenu);
$("#openCart").onclick = openCart;
$("#historyButton").onclick = openHistory;
$("#addDish").onclick = () => openEditor();
renderFilters();
renderMenu();
renderBasket();
if (onlineKitchen) startKitchen();
