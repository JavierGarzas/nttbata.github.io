(function () {
  "use strict";

  const statusLabels = {
    pending: "Pendiente de recogida",
    collected: "Recogida",
    cancelled: "Cancelada",
    expired: "Caducada"
  };
  const paymentLabels = { online: "Pagada online", store: "Pago en tienda" };
  const state = {
    ownerTab: "reservas",
    filters: { storeId: "", status: "", date: "" },
    cashierStore: "centro",
    pickup: null,
    readId: 0
  };
  let view;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
    );
  }

  function option(value, label, selected) {
    return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function statusBadge(label, kind) {
    return `<span class="ops-status ops-status--${escapeHtml(kind)}">${escapeHtml(label)}</span>`;
  }

  function pageTitle(title, description, controls = "") {
    return `<header class="ops-header">
      <div>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      ${controls}
    </header>`;
  }

  function ownerPage() {
    return `${pageTitle("Panel de gestión", "Consulta las reservas de la cadena y gestiona los descuentos.")}
      <nav class="ops-navigation" aria-label="Panel del dueño">
        <button type="button" data-ops-tab="reservas" aria-pressed="${state.ownerTab === "reservas"}">Reservas</button>
        <button type="button" data-ops-tab="descuentos" aria-pressed="${state.ownerTab === "descuentos"}">Descuentos</button>
      </nav>
      <div id="ops-owner-content">${ownerContent()}</div>`;
  }

  function ownerContent() {
    return state.ownerTab === "reservas" ? ownerReservations() : ownerDiscounts();
  }

  function ownerReservations() {
    const { storeId, date, status } = state.filters;
    return `<section class="ops-card" aria-labelledby="ops-reservas-heading">
      <header class="ops-section-heading">
        <h2 id="ops-reservas-heading">Reservas de la cadena</h2>
      </header>
      <form class="ops-filters" id="ops-filters">
        <label class="ops-field" for="ops-filter-store">Tienda
          <select id="ops-filter-store" name="storeId">
            ${option("", "Todas las tiendas", storeId)}
            ${Bata.stores.map((store) => option(store.id, store.name, storeId)).join("")}
          </select>
        </label>
        <label class="ops-field" for="ops-filter-date">Fecha de creación
          <input id="ops-filter-date" name="date" type="date" value="${escapeHtml(date)}">
        </label>
        <label class="ops-field" for="ops-filter-status">Estado
          <select id="ops-filter-status" name="status">
            ${option("", "Todos los estados", status)}
            ${Object.entries(statusLabels).map(([key, label]) => option(key, label, status)).join("")}
          </select>
        </label>
        <button class="ops-button ops-button--secondary" type="button" data-ops-action="clear-filters">Limpiar filtros</button>
      </form>
      <p class="ops-results" id="ops-results-count" role="status"></p>
      <div id="ops-reservation-results"></div>
    </section>`;
  }

  function updateOwnerResults() {
    const reservations = Bata.listReservations(state.filters);
    const count = reservations.length;
    const stores = new Map(Bata.stores.map((store) => [store.id, store.name]));
    view.querySelector("#ops-results-count").textContent = `${count} ${count === 1 ? "reserva" : "reservas"}`;
    view.querySelector("#ops-reservation-results").innerHTML = count
      ? `<div class="ops-table-viewport" role="region" aria-label="Listado desplazable de reservas" tabindex="0">
        <table class="ops-table" aria-label="Reservas de la cadena">
          <thead><tr><th scope="col">Reserva</th><th scope="col">Tienda</th><th scope="col">Creada el</th><th scope="col">Estado</th><th scope="col">Importe</th></tr></thead>
          <tbody>
            ${reservations.map((reservation) => `<tr>
              <th scope="row"><strong>${escapeHtml(reservation.ref)}</strong><span>${escapeHtml(reservation.name)}</span></th>
              <td>${escapeHtml(stores.get(reservation.storeId))}</td>
              <td>${escapeHtml(Bata.date(reservation.createdAt))}</td>
              <td>${statusBadge(statusLabels[reservation.status], reservation.status)}</td>
              <td class="ops-money">${escapeHtml(Bata.money(reservation.total))}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`
      : `<div class="ops-empty"><h3>No hay reservas con estos filtros</h3><p>Cambia la tienda, la fecha o el estado para ampliar la búsqueda.</p></div>`;
  }

  function ownerDiscounts() {
    const categories = [...new Set(Bata.products.map((product) => product.category))];
    return `<div class="ops-split ops-split--discounts">
      <section class="ops-card" aria-labelledby="ops-discounts-heading">
        <header class="ops-section-heading">
          <h2 id="ops-discounts-heading">Cupones y promociones</h2>
          <p>Las promociones se aplican automáticamente. Los cupones se aplican a prendas elegibles sin promoción.</p>
        </header>
        <div id="ops-discounts-list">${discountList()}</div>
        <p class="ops-message" id="ops-discounts-feedback" role="status"></p>
      </section>
      <section class="ops-card ops-editor" aria-labelledby="ops-create-heading">
        <header class="ops-section-heading">
          <h2 id="ops-create-heading">Crear descuento</h2>
        </header>
        <form class="ops-form" id="ops-discount-form">
          <label class="ops-field" for="ops-discount-type">Tipo
            <select id="ops-discount-type" name="type">
              <option value="promo">Promoción automática</option>
              <option value="coupon">Cupón con código</option>
            </select>
          </label>
          <label class="ops-field" for="ops-discount-name">Nombre
            <input id="ops-discount-name" name="name" required maxlength="60" placeholder="Ej. Selección de punto">
          </label>
          <label class="ops-field" for="ops-discount-code" id="ops-coupon-field" hidden>Código del cupón
            <input id="ops-discount-code" name="code" disabled minlength="3" maxlength="20" placeholder="Ej. PUNTO15" autocomplete="off" autocapitalize="characters">
          </label>
          <div class="ops-form-pair">
            <label class="ops-field" for="ops-discount-percent">Descuento (%)
              <input id="ops-discount-percent" name="percent" type="number" min="1" max="100" step="1" required placeholder="15">
            </label>
            <label class="ops-field" for="ops-discount-category">Categoría
              <select id="ops-discount-category" name="category">
                ${option("", "Todas", "")}
                ${categories.map((category) => option(category, category, "")).join("")}
              </select>
            </label>
          </div>
          <fieldset class="ops-date-pair">
            <legend>Vigencia (opcional)</legend>
            <div class="ops-form-pair">
              <label class="ops-field" for="ops-discount-start">Desde
                <input id="ops-discount-start" name="start" type="date">
              </label>
              <label class="ops-field" for="ops-discount-end">Hasta
                <input id="ops-discount-end" name="end" type="date">
              </label>
            </div>
          </fieldset>
          <button class="ops-button ops-button--primary" type="submit">Crear descuento</button>
          <p class="ops-message" id="ops-discount-form-feedback" role="status"></p>
        </form>
      </section>
    </div>`;
  }

  function discountList() {
    const discounts = Bata.listDiscounts();
    if (!discounts.length) return `<div class="ops-empty"><h3>Todavía no hay descuentos</h3><p>Crea una promoción automática o un cupón con código.</p></div>`;
    const today = new Date();
    const currentDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return `<ul class="ops-records">
      ${discounts.map((discount) => {
        const { id, name, code, percent, category, active, current } = discount;
        const finished = discount.end && discount.end < currentDate;
        const label = active ? (current ? "Vigente" : finished ? "Finalizado" : "Programado") : "Desactivado";
        const details = [code ? `Cupón · ${code}` : "Promoción automática", category || "Todas las categorías"];
        return `<li class="ops-record">
          <div class="ops-record-main">
            <p class="ops-record-name">${escapeHtml(name)} <span class="ops-discount-value">−${escapeHtml(percent)} %</span></p>
            <p class="ops-record-detail">${escapeHtml(details.join(" · "))}</p>
            <p class="ops-record-detail">${escapeHtml(discountDates(discount))}</p>
          </div>
          <div class="ops-record-actions">
            ${statusBadge(label, current ? "collected" : active && !finished ? "pending" : "cancelled")}
            <button class="ops-button ops-button--secondary" type="button" data-ops-action="toggle-discount" data-ops-id="${escapeHtml(id)}"
              aria-label="${active ? "Desactivar" : "Activar"} ${escapeHtml(name)}">${active ? "Desactivar" : "Activar"}</button>
          </div>
        </li>`;
      }).join("")}
    </ul>`;
  }

  function discountDates({ start, end }) {
    const localDate = (value) => Bata.date(`${value}T12:00:00`);
    if (start && end) return `${localDate(start)} – ${localDate(end)}`;
    if (start) return `Desde el ${localDate(start)}`;
    if (end) return `Hasta el ${localDate(end)}`;
    return "Sin fecha de fin";
  }

  function cashierPage() {
    return `${pageTitle("Recogidas en caja", "Valida el QR y entrega el pedido completo.", `
      <label class="ops-field ops-store-select" for="ops-cashier-store">Tienda de caja · demo
        <select id="ops-cashier-store" name="cashierStore">
          ${Bata.stores.map((store) => option(store.id, store.name, state.cashierStore)).join("")}
        </select>
      </label>`)}
      <div class="ops-split ops-split--cashier">
        <section class="ops-card ops-editor" aria-labelledby="ops-check-heading">
          <header class="ops-section-heading"><h2 id="ops-check-heading">Validar recogida</h2></header>
          <form class="ops-form" id="ops-qr-form">
            <label class="ops-field" for="ops-qr-code">Código QR de la reserva
              <input id="ops-qr-code" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ej. BATA-0001">
            </label>
            <p class="ops-helper">Pega el código, lee una foto del QR o carga un ejemplo.</p>
            <div class="ops-form-actions">
              <button class="ops-button ops-button--primary" type="submit">Validar QR</button>
              <button class="ops-button ops-button--secondary" type="button" data-ops-action="read-qr">Leer imagen del QR</button>
            </div>
            <input id="ops-qr-image" type="file" accept="image/*" hidden>
          </form>
          <p class="ops-message" id="ops-qr-feedback" role="status"></p>
          <div id="ops-pickup-details"></div>
        </section>
        <section class="ops-card" aria-labelledby="ops-queue-heading">
          <header class="ops-section-heading"><h2 id="ops-queue-heading">Reservas pendientes</h2></header>
          <label class="ops-field ops-queue-search" for="ops-queue-search">Buscar por referencia o nombre
            <input id="ops-queue-search" type="search" autocomplete="off" placeholder="Ej. BATA-0001">
          </label>
          <p class="ops-message ops-queue-feedback" id="ops-queue-feedback" role="status"></p>
          <p class="ops-visually-hidden" id="ops-queue-count" role="status"></p>
          <div id="ops-queue-list"></div>
        </section>
      </div>`;
  }

  function updateQueue() {
    const query = searchableText(view.querySelector("#ops-queue-search").value);
    const reservations = Bata.listReservations({ storeId: state.cashierStore, status: "pending" })
      .filter(({ ref, name }) => searchableText(`${ref} ${name}`).includes(query));
    view.querySelector("#ops-queue-count").textContent = `${reservations.length} reservas pendientes encontradas`;
    view.querySelector("#ops-queue-list").innerHTML = reservations.length
      ? `<ul class="ops-records">
        ${reservations.map((reservation) => `<li class="ops-record ops-pending">
          <div class="ops-record-main">
            <p class="ops-record-name">${escapeHtml(reservation.ref)} <span class="ops-client-name">${escapeHtml(reservation.name)}</span></p>
            <p class="ops-record-detail">Hasta el ${escapeHtml(Bata.date(reservation.expiresAt))}</p>
          </div>
          <div class="ops-pending-payment">
            <p class="ops-record-name">${escapeHtml(Bata.money(reservation.total))}</p>
            <p class="ops-record-detail">${paymentLabels[reservation.payment]}</p>
          </div>
          <div class="ops-record-actions">
            <button class="ops-button ops-button--secondary" type="button" data-ops-action="load-code" data-ops-id="${escapeHtml(reservation.ref)}"
              aria-label="Cargar QR de ejemplo para ${escapeHtml(reservation.ref)}">Cargar QR de ejemplo</button>
            <button class="ops-button ops-button--link" type="button" data-ops-action="resend" data-ops-id="${escapeHtml(reservation.ref)}"
              aria-label="Reenviar confirmación de ${escapeHtml(reservation.ref)}">Reenviar confirmación</button>
          </div>
        </li>`).join("")}
      </ul>`
      : `<div class="ops-empty"><h3>${query ? "No hay coincidencias" : "No hay reservas pendientes"}</h3><p>${query ? "Prueba con otra referencia o nombre." : "Aquí aparecerán las reservas listas para recoger en esta tienda."}</p></div>`;
  }

  function searchableText(value) {
    return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
  }

  function updatePickup() {
    const pickup = state.pickup;
    view.querySelector("#ops-pickup-details").innerHTML = pickup ? pickupForm(pickup.reservation) : "";
  }

  function pickupForm(reservation) {
    const needsPayment = reservation.payment === "store";
    return `<form class="ops-form ops-pickup" id="ops-pickup-form">
      <div class="ops-pickup-heading">
        <h3>${escapeHtml(reservation.ref)}</h3>
        ${statusBadge(needsPayment ? "Pendiente de cobro" : "Pagada online", needsPayment ? "pending" : "collected")}
      </div>
      <p class="ops-pickup-client">${escapeHtml(reservation.name)}</p>
      <ul class="ops-items">
        ${reservation.items.map((item) => `<li>
          <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.color)} · Talla ${escapeHtml(item.size)}</small></span>
          <span>× ${escapeHtml(item.quantity)}</span>
        </li>`).join("")}
      </ul>
      ${needsPayment ? `<label class="ops-check" for="ops-payment-confirm">
        <input id="ops-payment-confirm" type="checkbox" name="paid" required>
        <span>He cobrado <strong>${escapeHtml(Bata.money(reservation.total))}</strong> en caja.</span>
      </label>` : ""}
      <button class="ops-button ops-button--primary" type="submit">Registrar recogida</button>
    </form>`;
  }

  function showMessage(id, message, isError = false) {
    const region = view.querySelector(`#${id}`);
    region.classList.toggle("ops-message--error", isError);
    region.textContent = message;
  }

  function toggleCouponField() {
    const isCoupon = view.querySelector("#ops-discount-type").value === "coupon";
    const input = view.querySelector("#ops-discount-code");
    view.querySelector("#ops-coupon-field").hidden = !isCoupon;
    input.disabled = !isCoupon;
    input.required = isCoupon;
  }

  function resetPickup() {
    state.readId += 1;
    state.pickup = null;
    updatePickup();
    showMessage("ops-qr-feedback", "");
  }

  function validateCode(code) {
    state.readId += 1;
    try {
      const reservation = Bata.validatePickup({ code, storeId: state.cashierStore });
      state.pickup = { code, reservation };
      showMessage("ops-qr-feedback", "QR validado. Comprueba las prendas antes de registrar la recogida.");
    } catch (error) {
      state.pickup = null;
      showMessage("ops-qr-feedback", error.message, true);
    }
    updatePickup();
  }

  async function decodeQr(file) {
    if (typeof window.jsQR !== "function" || typeof window.createImageBitmap !== "function") {
      throw new Error("El lector de imágenes no está disponible. Introduce el código de la reserva.");
    }
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data;
    } catch {
      throw new Error("No se pudo leer la imagen. Prueba con otra foto del QR o introduce el código.");
    } finally {
      bitmap?.close();
    }
  }

  async function readQrImage(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = "";
    resetPickup();
    const codeInput = view.querySelector("#ops-qr-code");
    codeInput.value = "";
    const readId = state.readId;
    showMessage("ops-qr-feedback", "Leyendo la imagen del QR…");
    try {
      const code = await decodeQr(file);
      if (readId !== state.readId) return;
      if (!code?.trim()) {
        showMessage("ops-qr-feedback", "No se encontró ningún QR. Prueba con una foto más cercana y bien iluminada.", true);
        return;
      }
      codeInput.value = code.trim();
      validateCode(codeInput.value);
    } catch (error) {
      if (readId === state.readId) showMessage("ops-qr-feedback", error.message, true);
    }
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const { opsTab, opsAction, opsId } = button.dataset;
    if (opsTab && opsTab !== state.ownerTab) {
      state.ownerTab = opsTab;
      view.querySelectorAll("[data-ops-tab]").forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
      view.querySelector("#ops-owner-content").innerHTML = ownerContent();
      if (opsTab === "reservas") updateOwnerResults();
      return;
    }

    switch (opsAction) {
      case "clear-filters":
        state.filters = { storeId: "", status: "", date: "" };
        const filters = view.querySelector("#ops-filters").elements;
        Object.entries(state.filters).forEach(([name, value]) => {
          filters.namedItem(name).value = value;
        });
        updateOwnerResults();
        break;
      case "toggle-discount":
        try {
          const discount = Bata.toggleDiscount(opsId);
          view.querySelector("#ops-discounts-list").innerHTML = discountList();
          showMessage("ops-discounts-feedback", `${discount.name}: ${discount.active ? "activado" : "desactivado"}.`);
          const replacement = Array.from(view.querySelectorAll("[data-ops-id]")).find((node) => node.dataset.opsId === opsId);
          replacement?.focus();
        } catch (error) {
          showMessage("ops-discounts-feedback", error.message, true);
        }
        break;
      case "read-qr":
        view.querySelector("#ops-qr-image").click();
        break;
      case "load-code": {
        resetPickup();
        const input = view.querySelector("#ops-qr-code");
        const reservation = Bata.listReservations({ storeId: state.cashierStore, status: "pending" })
          .find((record) => record.ref === opsId);
        if (!reservation) {
          updateQueue();
          showMessage("ops-queue-feedback", "La reserva ya no está pendiente.", true);
          break;
        }
        input.value = reservation.qr;
        input.focus();
        break;
      }
      case "resend":
        try {
          const reservation = Bata.resendReservation({ ref: opsId, storeId: state.cashierStore });
          showMessage("ops-queue-feedback", `Reenvío simulado de ${reservation.ref} al correo original de la reserva.`);
        } catch (error) {
          showMessage("ops-queue-feedback", error.message, true);
        }
        break;
    }
  }

  function handleChange(event) {
    const input = event.target;
    if (input.form?.id === "ops-filters") {
      state.filters[input.name] = input.value;
      updateOwnerResults();
    } else if (input.id === "ops-discount-type") {
      toggleCouponField();
    } else if (input.id === "ops-qr-image") {
      void readQrImage(input);
    } else if (input.id === "ops-cashier-store") {
      state.cashierStore = input.value;
      view.querySelector("#ops-qr-form").reset();
      view.querySelector("#ops-queue-search").value = "";
      showMessage("ops-queue-feedback", "");
      resetPickup();
      updateQueue();
    }
  }

  function handleInput(event) {
    if (event.target.id === "ops-queue-search") updateQueue();
    if (event.target.id === "ops-qr-code") resetPickup();
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form));

    if (form.id === "ops-discount-form") {
      try {
        const discount = Bata.createDiscount(values);
        form.reset();
        toggleCouponField();
        view.querySelector("#ops-discounts-list").innerHTML = discountList();
        showMessage("ops-discount-form-feedback", `${discount.name}: descuento creado.`);
      } catch (error) {
        showMessage("ops-discount-form-feedback", error.message, true);
      }
    } else if (form.id === "ops-qr-form") {
      validateCode(values.code);
    } else if (form.id === "ops-pickup-form" && state.pickup) {
      try {
        const reservation = Bata.completePickup({
          code: state.pickup.code,
          storeId: state.cashierStore,
          paid: values.paid === "on"
        });
        state.pickup = null;
        view.querySelector("#ops-qr-form").reset();
        updatePickup();
        updateQueue();
        view.querySelector("#ops-qr-code").focus();
        showMessage("ops-qr-feedback", `Recogida registrada para ${reservation.ref}.`);
      } catch (error) {
        showMessage("ops-qr-feedback", error.message, true);
      }
    }
  }

  window.renderOperaciones = function (role) {
    if (!view) {
      view = document.querySelector("#vista-operaciones");
      view.addEventListener("click", handleClick);
      view.addEventListener("change", handleChange);
      view.addEventListener("input", handleInput);
      view.addEventListener("submit", handleSubmit);
    }
    state.readId += 1;
    state.pickup = null;
    view.innerHTML = role === "dueno" ? ownerPage() : cashierPage();
    if (role === "dueno" && state.ownerTab === "reservas") updateOwnerResults();
    if (role === "cajero") updateQueue();
  };
}());
