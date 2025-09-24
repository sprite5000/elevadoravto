const API_URL = "https://orders-api.supbot777.workers.dev/api"; // твой воркер
const AUTH = "Basic " + btoa("admin:1234"); // логин:пароль

async function api(path, options = {}) {
  const res = await fetch(API_URL + path, {
    ...options,
    headers: {
      "Authorization": AUTH,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return res.json();
}

// ---------- Orders ----------
async function loadOrders() {
  const orders = await api("/orders");
  const container = document.getElementById("ordersList");
  container.innerHTML = "";

  orders.forEach(order => {
    const div = document.createElement("div");
    div.className = "order";

    div.innerHTML = `
      <h3>${order.brand} (${order.year}) — ${order.mileage} km</h3>
      <p>${order.description}</p>

      <label>
        Статус:
        <select class="statusSelect" data-id="${order.id}">
          <option value="waiting" ${order.status === "waiting" ? "selected" : ""}>Новая</option>
          <option value="done" ${order.status === "done" ? "selected" : ""}>Готовая</option>
        </select>
      </label>

      <button class="deleteBtn" data-id="${order.id}">Удалить заявку</button>

      <h4>Ответы:</h4>
      <ul>
        ${order.replies.map(r => `
          <li>
            <p>${r.description} — $${r.price}</p>
            ${r.image_key ? `<img src="${r.image_key}" width="150"/>` : ""}
          </li>
        `).join("")}
      </ul>

      <form class="replyForm" data-id="${order.id}">
        <input name="description" placeholder="Описание ответа" required />
        <input name="price" type="number" placeholder="Цена" required />
        <input name="imageUrl" placeholder="Image URL (опционально)" />
        <button type="submit">Ответить</button>
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

  // Обработчики удаления
  document.querySelectorAll(".deleteBtn").forEach(btn => {
    btn.addEventListener("click", async e => {
      const orderId = e.target.dataset.id;
      if (confirm("Удалить заявку?")) {
        await api(`/orders/${orderId}`, { method: "DELETE" });
        loadOrders();
      }
    });
  });

  // Обработчики форм ответа
  document.querySelectorAll(".replyForm").forEach(form => {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const orderId = form.dataset.id;
      const body = {
        description: form.description.value,
        price: form.price.value,
        imageUrl: form.imageUrl.value || null,
      };
      await api(`/orders/${orderId}/replies`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      loadOrders();
    });
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
