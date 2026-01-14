const API_URL = "https://orders-api.supbot777.workers.dev/api"; // твой воркер
const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");
let currentAuth = localStorage.getItem("auth_header"); // Пытаемся вспомнить вход
const DELETE_PASSWORD = "1488"; // simple client-side guard for delete

// Pagination settings
const ORDERS_PER_PAGE = 20;
let currentPage = 1;
let allOrders = [];



async function api(path, options = {}) {
  // Если мы еще не вошли — стоп
  if (!currentAuth) {
    showLoginScreen();
    throw new Error("Нужен вход");
  }

  const isFormData = options && options.body && typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    "Authorization": currentAuth, // ИСПОЛЬЗУЕМ ПЕРЕМЕННУЮ
    ...(options.headers || {}),
  };
  
  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const res = await fetch(API_URL + path, { ...options, headers });

  // ГЛАВНОЕ: Если сервер ответил 401 (Unauthorized)
  if (res.status === 401) {
    localStorage.removeItem("auth_header"); // Забываем пароль
    currentAuth = null;
    showLoginScreen(); // Показываем окно входа снова
    document.getElementById("loginError").style.display = "block"; // Показываем ошибку
    throw new Error("Неверный пароль");
  }

  return res.json();
}

// ---------- Orders with Pagination ----------
async function loadOrders(page = 1) {
  // Load all orders only once, then paginate client-side
  if (allOrders.length === 0) {
    allOrders = await api("/orders");
    // Sort: New (waiting) first, then Done
    allOrders = allOrders.sort((a, b) => {
      const weight = status => (status === "waiting" ? 0 : 1);
      const dw = weight(a.status) - weight(b.status);
      if (dw !== 0) return dw;
      // fallback: newest first by created_at if available
      if (a.created_at && b.created_at) {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return 0;
    });
  }

  currentPage = page;
  const totalPages = Math.ceil(allOrders.length / ORDERS_PER_PAGE);
  const startIndex = (page - 1) * ORDERS_PER_PAGE;
  const endIndex = startIndex + ORDERS_PER_PAGE;
  const pageOrders = allOrders.slice(startIndex, endIndex);

  renderOrders(pageOrders);
  renderPagination(totalPages);
  setupEventHandlers();
}
function updateInterfaceForRole() {
  const token = localStorage.getItem("auth_header");
  
  // ИЩЕМ ТВОЮ СЕКЦИЮ ПО ID
  const adminSection = document.getElementById("new-order"); 
  
  if (!token || !adminSection) return;

  try {
    const base64Url = token.split(" ")[1];
    const decoded = atob(base64Url);
    const username = decoded.split(":")[0];

    // Если админ — показываем твою секцию
    if (username === "admin") {
      adminSection.style.display = "block";
    } else {
      adminSection.style.display = "none";
    }
    
  } catch (e) {
    console.error("Ошибка проверки роли:", e);
    adminSection.style.display = "none";
  }
}
function renderOrders(orders) {
  const container = document.getElementById("ordersList");
  container.innerHTML = "";

  orders.forEach(order => {
    const div = document.createElement("div");
    const statusClass = order.status === "waiting" ? "order--waiting" : "order--done";
    div.className = `order ${statusClass}`;

    // --- ЛОГИКА ДЛЯ БЕЙДЖИКА ---
    let ownerBadge = "";
    if (order.owner) {
      // Берем первую букву и делаем большой
      const letter = order.owner.charAt(0).toUpperCase();
      // Генерируем HTML кружочка
      ownerBadge = `<span class="owner-badge" title="${order.owner}">${letter}</span>`;
    }
    // ---------------------------
    
    div.innerHTML = `
      <button class="order__delete" title="Delete order" aria-label="Delete order">×</button>
      <h3>${ownerBadge}#${order.id} ${order.brand} (${order.year}) — ${order.mileage} km</h3>
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
                return `<img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y3ZjdmNyIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TG9hZGluZy4uLjwvdGV4dD48L3N2Zz4=" alt="reply image" class="carousel__img" data-src="${abs}" loading="lazy" />`;
              }).join("")}
            </div>
          ` : ""}
        </div>
      `).join("")}

      <button class="addReplyBtn" data-id="${order.id}">Add reply</button>
    `;

    container.appendChild(div);
  });
}

function renderPagination(totalPages) {
  let paginationContainer = document.getElementById("pagination");
  if (!paginationContainer) {
    paginationContainer = document.createElement("div");
    paginationContainer.id = "pagination";
    paginationContainer.className = "pagination";
    document.querySelector(".container").appendChild(paginationContainer);
  }

  if (totalPages <= 1) {
    paginationContainer.innerHTML = "";
    return;
  }

  let paginationHTML = "";
  
  // Previous button
  if (currentPage > 1) {
    paginationHTML += `<button class="pagination__btn" data-page="${currentPage - 1}">‹ Previous</button>`;
  }

  // Page numbers
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    paginationHTML += `<button class="pagination__btn" data-page="1">1</button>`;
    if (startPage > 2) {
      paginationHTML += `<span class="pagination__dots">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === currentPage ? "pagination__btn--active" : "";
    paginationHTML += `<button class="pagination__btn ${activeClass}" data-page="${i}">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += `<span class="pagination__dots">...</span>`;
    }
    paginationHTML += `<button class="pagination__btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  // Next button
  if (currentPage < totalPages) {
    paginationHTML += `<button class="pagination__btn" data-page="${currentPage + 1}">Next ›</button>`;
  }

  paginationContainer.innerHTML = paginationHTML;

  // Add event listeners to pagination buttons
  paginationContainer.querySelectorAll(".pagination__btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const page = parseInt(e.target.dataset.page);
      loadOrders(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function setupEventHandlers() {
  // Обработчики смены статуса
  document.querySelectorAll(".statusSelect").forEach(select => {
    select.addEventListener("change", async e => {
      const orderId = e.target.dataset.id;
      const newStatus = e.target.value;
      await api(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      // Refresh current page
      loadOrders(currentPage);
    });
  });

  
  
  // Setup lazy loading for new carousels on this page
  setupLazyLoading();

  // Обработчики удаления заказа
  document.querySelectorAll(".order__delete").forEach(btn => {
    btn.addEventListener("click", async e => {
      // Prevent multiple clicks
      if (e.target.disabled) return;
      
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
      
      // Disable button during deletion
      e.target.disabled = true;
      e.target.textContent = 'Deleting...';
      
      try {
        await api(`/orders/${orderId}`, { method: "DELETE" });
        // Remove from allOrders array and refresh current page
        allOrders = allOrders.filter(order => order.id !== orderId);
        loadOrders(currentPage);
      } catch (error) {
        console.error('Error deleting order:', error);
        alert('Error deleting order. Please try again.');
        // Re-enable button on error
        e.target.disabled = false;
        e.target.textContent = '×';
      }
    });
  });

  // Удаление конкретного ответа
  document.querySelectorAll(".reply__delete").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      
      // Prevent multiple clicks
      if (e.target.disabled) return;
      
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
      
      // Disable button during deletion
      e.target.disabled = true;
      e.target.textContent = 'Deleting...';
      
      try {
        await api(`/replies/${replyId}`, { method: "DELETE" });
        // Refresh current page
      loadOrders(currentPage);
      } catch (error) {
        console.error('Error deleting reply:', error);
        alert('Error deleting reply. Please try again.');
        // Re-enable button on error
        e.target.disabled = false;
        e.target.textContent = '×';
      }
    });
  });

  // Обработчики кнопок "Add reply"
  document.querySelectorAll(".addReplyBtn").forEach(btn => {
    btn.addEventListener("click", e => {
      const orderId = e.target.dataset.id;
      openReplyModal(orderId);
    });
  });


  // Reply modal functions
  function openReplyModal(orderId) {
    const modal = document.getElementById('replyModal');
    const form = modal.querySelector('.replyForm');
    form.dataset.id = orderId;
    form.reset();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeReplyModal() {
    const modal = document.getElementById('replyModal');
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  // Reply modal handlers
  const replyModal = document.getElementById('replyModal');
  const replyForm = replyModal.querySelector('.replyForm');
  const replyClose = replyModal.querySelector('.replyModal__close');

  replyClose.addEventListener('click', closeReplyModal);
  replyModal.addEventListener('click', e => { if (e.target === replyModal) closeReplyModal(); });

  replyForm.addEventListener('submit', async e => {
    e.preventDefault();
    
    // Prevent multiple submissions
    const submitBtn = replyForm.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;
    
    const orderId = replyForm.dataset.id;
    const fd = new FormData();
    fd.append("description", replyForm.description.value);
    fd.append("price", replyForm.price.value);
    const files = replyForm.images && replyForm.images.files ? Array.from(replyForm.images.files) : [];
    files.slice(0, 9).forEach(file => fd.append("images", file));
    
    // Disable submit button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    
    try {
      await api(`/orders/${orderId}/replies`, { method: "POST", body: fd });
      closeReplyModal();
      // Reset cache and reload current page
      allOrders = [];
      loadOrders(currentPage);
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Error sending reply. Please try again.');
    } finally {
      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Reply';
    }
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && replyModal.classList.contains('is-open')) {
      closeReplyModal();
    }
  });
}

// Global lightbox variables
let gallery = [];
let index = 0;

function setupLightbox() {
  const lightbox = document.getElementById('lightbox');
  const lbImg = lightbox.querySelector('.lightbox__img');
  const lbClose = lightbox.querySelector('.lightbox__close');
  const lbPrev = lightbox.querySelector('.lightbox__prev');
  const lbNext = lightbox.querySelector('.lightbox__next');

  // Make functions global
  window.openLightbox = function(images, startIdx) {
    gallery = images;
    index = startIdx;
    lbImg.src = gallery[index];
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
  };

  window.closeLightbox = function() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    lbImg.src = '';
  };

  window.show = function(delta) {
    if (!gallery.length) return;
    index = (index + delta + gallery.length) % gallery.length;
    lbImg.src = gallery[index];
  };

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

function setupLazyLoading() {
  // Lazy loading function
  function loadImage(img) {
    if (img.dataset.src && img.src !== img.dataset.src) {
      img.src = img.dataset.src;
      img.classList.add('loaded');
    }
  }

  // Load all images in a carousel
  function loadCarouselImages(carousel) {
    const imgs = Array.from(carousel.querySelectorAll('.carousel__img'));
    imgs.forEach(loadImage);
  }

  document.querySelectorAll('.carousel').forEach(carousel => {
    const imgs = Array.from(carousel.querySelectorAll('.carousel__img'));
    const urls = imgs.map(img => img.dataset.src || img.src);
    
    imgs.forEach((img, i) => {
      img.addEventListener('click', () => {
        // Load all images in this carousel when user clicks on any image
        loadCarouselImages(carousel);
        openLightbox(urls, i);
      });
    });

    // Load images when carousel comes into view (Intersection Observer)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadCarouselImages(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '50px' });
    
    observer.observe(carousel);
  });
}
// --- ЛОГИКА ВХОДА ---

const loginOverlay = document.getElementById("loginOverlay");
const loginForm = document.getElementById("loginForm");

function showLoginScreen() {
  loginOverlay.classList.remove("hidden");
}

function hideLoginScreen() {
  loginOverlay.classList.add("hidden");
}

// Обработка формы входа
loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const user = document.getElementById("usernameInput").value.trim();
  const pass = document.getElementById("passwordInput").value.trim();

  // Создаем заголовок Basic Auth
  const token = "Basic " + btoa(user + ":" + pass);

  // Пытаемся сделать тестовый запрос, чтобы проверить пароль
  try {
    // Временно сохраняем для проверки
    currentAuth = token;
    
    // Делаем легкий запрос (например, получить заказы)
    await api("/orders"); // Если пароль неверный, api() выбросит ошибку 401

    // Если мы тут — значит пароль подошел!
    localStorage.setItem("auth_header", token); // Запоминаем навсегда
    document.getElementById("loginError").style.display = "none";
    hideLoginScreen();

    updateInterfaceForRole();
    // Запускаем приложение
    allOrders = []; // Сброс кэша
    loadOrders(1); 
    
  } catch (err) {
    console.error("Ошибка входа:", err);
    // api() само покажет ошибку, но на всякий случай сбросим
    currentAuth = null; 
  }
});

// --- СТАРТ ПРИЛОЖЕНИЯ ---

// Проверяем, вошли ли мы ранее
if (currentAuth) {
  hideLoginScreen();
  updateInterfaceForRole();
  loadOrders(1);
} else {
  showLoginScreen();
  // Не загружаем заказы, пока юзер не войдет
}
// ---------- New Order ----------
document.getElementById("orderForm").addEventListener("submit", async e => {
  e.preventDefault();
  
  // Prevent multiple submissions
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn.disabled) return;
  
  const form = e.target;
  const body = {
    brand: form.brand.value,
    year: form.year.value,
    mileage: form.mileage.value,
    description: form.description.value,
    owner: form.owner.value,
  };
  
  // Disable submit button and show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating...';
  
  try {
    await api("/orders", { method: "POST", body: JSON.stringify(body) });
    form.reset();
    // Reset cache and reload first page
    allOrders = [];
    loadOrders(1);
  } catch (error) {
    console.error('Error creating order:', error);
    alert('Error creating order. Please try again.');
  } finally {
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Order';
  }
});

// Initial setup
setupLightbox();

// Initial load
loadOrders(1);
