const API_URL = "https://orders-api.supbot777.workers.dev/api"; // твой воркер
const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");
const AUTH = "Basic " + btoa("admin:1234"); // логин:пароль
const DELETE_PASSWORD = "1488"; // simple client-side guard for delete

async function api(path, options = {}) {
  const isFormData = options && options.body && typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    "Authorization": AUTH,
    ...(options.headers || {}),
  };
  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const res = await fetch(API_URL + path, { ...options, headers });
  return res.json();
}

// ---------- Orders ----------
async function loadOrders() {
  let orders = await api("/orders");
  // Sort: New (waiting) first, then Done
  orders = orders.sort((a, b) => {
    const weight = status => (status === "waiting" ? 0 : 1);
    const dw = weight(a.status) - weight(b.status);
    if (dw !== 0) return dw;
    // fallback: newest first by created_at if available
    if (a.created_at && b.created_at) {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    return 0;
  });
  const container = document.getElementById("ordersList");
  container.innerHTML = "";

  orders.forEach(order => {
    const div = document.createElement("div");
    const statusClass = order.status === "waiting" ? "order--waiting" : "order--done";
    div.className = `order ${statusClass}`;

    div.innerHTML = `
      <button class="order__delete" title="Delete order" aria-label="Delete order">×</button>
      <h3>#${order.id} ${order.brand} (${order.year}) — ${order.mileage} km</h3>
      <p>${order.description}</p>

      <label>
        Status:
        <select class="statusSelect" data-id="${order.id}">
          <option value="waiting" ${order.status === "waiting" ? "selected" : ""}>New</option>
          <option value="done" ${order.status === "done" ? "selected" : ""}>Done</option>
        </select>
      </label>

      <h4>Replies:</h4>
      ${order.replies.map(r => `
        <div class="reply" data-reply-id="${r.id}">
          <button class="reply__delete" title="Delete reply" aria-label="Delete reply">×</button>
          <p>${r.description} — $${r.price}</p>
          ${r.images && r.images.length ? `
            <div class="carousel" aria-label="Images" data-reply-id="${r.id}">
              ${r.images.map(img => {
                const src = (img.url || "");
                const abs = src.startsWith("http") ? src : (API_ORIGIN + src);
                return `<img src="${abs}" alt="reply image" class="carousel__img" data-src="${abs}" />`;
              }).join("")}
            </div>
          ` : ""}
        </div>
      `).join("")}

      <form class="replyForm" data-id="${order.id}">
        <textarea name="description" placeholder="Reply description" rows="4" required></textarea>
        <input name="price" type="number" placeholder="Price" required />
        <input name="images" type="file" accept="image/*" multiple />
        <button type="submit">Reply</button>
      </form>
    `;

    container.appendChild(div);
  });

  // Обработчики смены статуса
  document.querySelectorAll(".statusSelect").forEach(select => {
    select.addEventListener("change", async e => {
      const orderId = e.target.dataset.id;
      const newStatus = e.target.value;
      await api(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      loadOrders();
    });
  });

  // Обработчики удаления заказа
  document.querySelectorAll(".order__delete").forEach(btn => {
    btn.addEventListener("click", async e => {
      const wrapper = e.target.closest('.order');
      // orderId хранится в DOM только внутри select и форм; возьмём из select
      const select = wrapper.querySelector('.statusSelect');
      const orderId = select ? select.dataset.id : null;
      if (!confirm("Delete this order?")) return;
      const pwd = prompt("Enter delete password:");
      if (pwd === null) return;
      if (pwd !== DELETE_PASSWORD) {
        alert("Wrong password. Order was not deleted.");
        return;
      }
      await api(`/orders/${orderId}`, { method: "DELETE" });
      loadOrders();
    });
  });

  // Удаление конкретного ответа
  document.querySelectorAll(".reply__delete").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const wrapper = e.target.closest('.reply');
      const replyId = wrapper?.dataset?.replyId;
      if (!replyId) return;
      if (!confirm("Delete this reply?")) return;
      const pwd = prompt("Enter delete password:");
      if (pwd === null) return;
      if (pwd !== DELETE_PASSWORD) {
        alert("Wrong password. Reply was not deleted.");
        return;
      }
      await api(`/replies/${replyId}`, { method: "DELETE" });
      loadOrders();
    });
  });

  // Обработчики форм ответа
  document.querySelectorAll(".replyForm").forEach(form => {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const orderId = form.dataset.id;
      const fd = new FormData();
      fd.append("description", form.description.value);
      fd.append("price", form.price.value);
      const files = form.images && form.images.files ? Array.from(form.images.files) : [];
      files.slice(0, 9).forEach(file => fd.append("images", file));
      await api(`/orders/${orderId}/replies`, { method: "POST", body: fd });
      loadOrders();
    });
  });

  // Lightbox handlers
  const lightbox = document.getElementById('lightbox');
  const lbImg = lightbox.querySelector('.lightbox__img');
  const lbClose = lightbox.querySelector('.lightbox__close');
  const lbPrev = lightbox.querySelector('.lightbox__prev');
  const lbNext = lightbox.querySelector('.lightbox__next');

  let gallery = [];
  let index = 0;

  function openLightbox(images, startIdx) {
    gallery = images;
    index = startIdx;
    lbImg.src = gallery[index];
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
  }
  function closeLightbox() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    lbImg.src = '';
  }
  function show(delta) {
    if (!gallery.length) return;
    index = (index + delta + gallery.length) % gallery.length;
    lbImg.src = gallery[index];
  }

  document.querySelectorAll('.carousel').forEach(carousel => {
    const imgs = Array.from(carousel.querySelectorAll('.carousel__img'));
    const urls = imgs.map(img => img.dataset.src || img.src);
    imgs.forEach((img, i) => {
      img.addEventListener('click', () => openLightbox(urls, i));
    });
  });

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', () => show(-1));
  lbNext.addEventListener('click', () => show(1));
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  window.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') show(-1);
    if (e.key === 'ArrowRight') show(1);
  });
}

// ---------- New Order ----------
document.getElementById("orderForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const body = {
    brand: form.brand.value,
    year: form.year.value,
    mileage: form.mileage.value,
    description: form.description.value,
  };
  await api("/orders", { method: "POST", body: JSON.stringify(body) });
  form.reset();
  loadOrders();
});

// Initial load
loadOrders();
