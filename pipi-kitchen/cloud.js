const cloudConfig = window.kitchenConfig;
const cloudAvailable = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cloudConfig?.url) &&
  /^sb_publishable_[A-Za-z0-9_-]+$/.test(cloudConfig?.publishableKey);
const cloud = cloudAvailable ? window.supabase.createClient(cloudConfig.url, cloudConfig.publishableKey, {
  auth: { storageKey: "pipi-kitchen-cloud-session", detectSessionInUrl: false }
}) : null;

const PHOTO_BUCKET = "kitchen-photos";
let kitchenUser = null;
let sharedMenu = [];
let refreshGeneration = 0;
let syncInProgress = false;
let lastSync = 0;

function checkCloud(result) {
  if (result.error) throw result.error;
  return result.data;
}

async function fetchMenu() {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const batch = checkCloud(await cloud.from("kitchen_dishes").select("*")
      .order("sort_order", { ascending: false }).order("id").range(offset, offset + 199));
    rows.push(...batch);
    if (batch.length < 200) break;
  }
  return rows.map(row => ({
    id: row.id, name: row.name, category: row.category, minutes: row.minutes,
    ingredients: row.ingredients, steps: row.steps, reference: row.reference,
    updatedAt: row.updated_at, photo: row.photo_path ?
      cloud.storage.from(PHOTO_BUCKET).getPublicUrl(row.photo_path).data.publicUrl : ""
  }));
}

async function refreshSharedMenu({ force = false } = {}) {
  if (!cloud || (syncInProgress && !force)) return;
  const generation = ++refreshGeneration;
  syncInProgress = true;
  try {
    const dishes = await fetchMenu();
    if (generation !== refreshGeneration) return;
    sharedMenu = dishes;
    for (const id of cart.keys()) if (!sharedMenu.some(dish => dish.id === id)) cart.delete(id);
    lastSync = Date.now();
    renderMenu();
    renderBasket();
    $("#cloudStatus").textContent = "共享菜单已同步";
  } catch (error) {
    if (generation === refreshGeneration) {
      $("#cloudStatus").textContent = "菜单同步失败，请重试";
      throw error;
    }
  } finally {
    if (generation === refreshGeneration) syncInProgress = false;
  }
}

async function writeDish(dish, fields, imageData) {
  if (!kitchenUser) throw new Error("请先登录后再编辑。");
  const id = dish?.id ?? crypto.randomUUID();
  const record = { id, ...fields };
  if (imageData) {
    const image = await (await fetch(imageData)).blob();
    const path = "menu/" + crypto.randomUUID() + ".jpg";
    checkCloud(await cloud.storage.from(PHOTO_BUCKET).upload(path, image, { contentType: "image/jpeg" }));
    record.photo_path = path;
  }
  if (dish) {
    const updated = checkCloud(await cloud.from("kitchen_dishes").update(record)
      .eq("id", id).eq("updated_at", dish.updatedAt).select("id").maybeSingle());
    if (!updated) throw new Error("这道菜有更新，请关闭编辑窗口、刷新菜单后再修改。");
  } else {
    checkCloud(await cloud.from("kitchen_dishes").insert({ ...record, sort_order: Date.now() }));
  }
}

function lockKitchen() {
  const wasEditor = Boolean(kitchenUser);
  kitchenUser = null;
  if (wasEditor) {
    if (dialog.open) dialog.close();
    state = readState();
    draft = { sender: state.sender, receiver: state.receiver, meal: "今晚", note: "" };
    renderMenu();
  }
  $("#addDish").hidden = true;
  $("#signOut").hidden = true;
  $("#editLogin").hidden = false;
}

async function unlockKitchen(user) {
  const member = checkCloud(await cloud.from("kitchen_members").select("user_id").eq("user_id", user.id).maybeSingle());
  if (!member) {
    await cloud.auth.signOut({ scope: "local" });
    throw new Error("这个账号还没有加入厨房。");
  }
  kitchenUser = user.id;
  state = readState();
  draft = { sender: state.sender, receiver: state.receiver, meal: "今晚", note: "" };
  $("#addDish").hidden = false;
  $("#signOut").hidden = false;
  $("#editLogin").hidden = true;
  renderMenu();
}

async function startKitchen() {
  const status = $("#loginStatus");
  const form = $("#loginForm");
  const panel = $("#loginPanel");
  const submit = form.querySelector('[type="submit"]');
  const emailInput = form.elements.email;
  const codeInput = form.elements.code;
  const resetButton = $("#resetLogin");
  let sentTo = "";
  function resetLogin() {
    sentTo = "";
    emailInput.readOnly = false;
    codeInput.disabled = true;
    codeInput.required = false;
    codeInput.value = "";
    $("#codeField").hidden = true;
    resetButton.hidden = true;
    submit.textContent = "发送验证码";
    status.textContent = "";
  }
  $("#editLogin").onclick = () => { resetLogin(); panel.showModal(); };
  $("#closeLogin").onclick = () => panel.close();
  resetButton.onclick = resetLogin;
  if (!cloud) {
    $("#editLogin").hidden = true;
    $("#cloudStatus").textContent = "菜单尚未连接。";
    return;
  }
  form.onsubmit = async event => {
    event.preventDefault();
    submit.disabled = true;
    const verifying = Boolean(sentTo);
    status.textContent = verifying ? "正在验证…" : "正在发送…";
    try {
      if (!verifying) {
        const email = emailInput.value.trim();
        checkCloud(await cloud.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
        if (!panel.open) return;
        sentTo = email;
        emailInput.readOnly = true;
        codeInput.disabled = false;
        codeInput.required = true;
        $("#codeField").hidden = false;
        resetButton.hidden = false;
        submit.textContent = "验证并登录";
        status.textContent = "验证码已发送，请查看收件箱或垃圾邮件。";
        codeInput.focus();
      } else {
        const data = checkCloud(await cloud.auth.verifyOtp({ email: sentTo, token: codeInput.value.trim(), type: "email" }));
        await unlockKitchen(data.user);
        panel.close();
        form.reset();
        resetLogin();
      }
    } catch (error) {
      if (error.status === 429) status.textContent = "操作太频繁，请稍后再试。";
      else if (verifying) status.textContent = error.message === "这个账号还没有加入厨房。" ?
        error.message : "验证码无效或已过期，请核对后重试。";
      else status.textContent = "暂时无法发送验证码，请核对编辑邮箱或稍后再试。";
    } finally {
      submit.disabled = false;
    }
  };
  $("#signOut").onclick = async () => {
    lockKitchen();
    submit.disabled = true;
    try {
      checkCloud(await cloud.auth.signOut({ scope: "local" }));
      notify("已退出编辑");
    } catch {
      notify("退出请求失败，请刷新页面后再试");
    } finally {
      submit.disabled = false;
    }
  };
  $("#refreshMenu").onclick = () => refreshSharedMenu().catch(() => {});
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastSync > 10_000) refreshSharedMenu().catch(() => {});
  });
  cloud.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") lockKitchen();
  });
  refreshSharedMenu().catch(() => {});
  try {
    submit.disabled = true;
    const { session } = checkCloud(await cloud.auth.getSession());
    if (session) await unlockKitchen(session.user);
  } catch {
    status.textContent = "请重新登录厨房。";
  } finally {
    submit.disabled = false;
  }
}
