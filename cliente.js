(() => {
  'use strict';

  const bata = window.Bata;
  const get = id => document.getElementById(id);
  const dialog = get('dialogo');
  const title = get('dialogo-titulo');
  const content = get('dialogo-contenido');
  const products = get('productos');
  const search = get('busqueda');
  const categoryList = get('categorias');
  const storeField = get('tienda');
  const bag = document.querySelector('[data-open-cart]');
  const feedback = get('feedback');
  const roles = [...document.querySelectorAll('[data-role]')];
  const cart = [];
  const contact = { name: '', email: '', payment: 'online' };
  let category = '';
  let storeId = bata.stores[0].id;
  let cartStore = '';
  let coupon = '';
  let payment;
  let paymentTimer;
  let reservation;
  let productDetail;
  let opener;
  let noticeTimer;
  let initialized = false;

  function html(value) {
    const node = document.createElement('span');
    node.textContent = value;
    return node.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const normal = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const store = id => bata.stores.find(item => item.id === id);

  function renderCatalog() {
    const terms = normal(search.value).split(/\s+/).filter(Boolean);
    const list = bata.products.filter(product =>
      (!category || product.category === category) && terms.every(term =>
        normal([product.name, product.category, product.description, ...product.colors, ...product.sizes].join(' ')).includes(term)
      )
    );
    get('resultados').textContent = list.length === 1 ? '1 producto' : list.length + ' productos';
    for (const button of categoryList.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
    }
    products.innerHTML = list.length ? list.map((product, index) => {
      const available = product.variants.some(({ color, size }) => bata.stock(product.id, color, size, storeId) > 0);
      const { price, originalPrice, discountPercent } = bata.productPrice(product.id);
      return '<article class="product">' +
        '<div class="product-media">' +
          '<img src="' + product.image + '" width="512" height="512" alt="" decoding="async"' + (index > 2 ? ' loading="lazy"' : '') + '>' +
          (discountPercent ? '<span class="promo" aria-hidden="true">−' + discountPercent + ' %</span>' : '') +
        '</div>' +
        '<div class="product-line"><h3><button type="button" data-product="' + product.id + '" aria-label="Ver tallas de ' +
          html(product.name) + '">' + html(product.name) + '</button></h3><span class="price">' +
          (discountPercent ? '<del>' + bata.money(originalPrice) + '</del>' : '') + bata.money(price) +
        '</span></div>' +
        '<p>' + html(product.colors[0]) + ' · ' + product.colors.length + ' colores</p>' +
        '<p class="product-stock' + (available ? ' in-stock' : '') + '">' +
          (available ? 'Disponible en tienda' : 'Agotado en esta tienda') + '</p>' +
      '</article>';
    }).join('') : '<div class="empty"><h3>No encontramos prendas</h3><p>Prueba con otro nombre o busca en todas las categorías.</p><button class="button secondary" type="button" data-clear-search>Limpiar filtros</button></div>';
  }

  function showRole() {
    const next = location.hash.slice(1);
    const role = ['dueno', 'cajero'].includes(next) ? next : 'cliente';
    const changed = document.body.dataset.role !== role;
    document.body.dataset.role = role;
    get('vista-cliente').hidden = role !== 'cliente';
    get('vista-operaciones').hidden = role === 'cliente';
    document.querySelector('.customer-nav').hidden = role !== 'cliente';
    bag.hidden = role !== 'cliente';
    const roleLink = roles.find(link => link.dataset.role === role);
    for (const link of roles) link.removeAttribute('aria-current');
    roleLink.setAttribute('aria-current', 'page');
    document.title = role === 'cliente' ? 'NTT-BATA | Reserva en tienda' : 'NTT-BATA | ' + (role === 'dueno' ? 'Dueño de tienda' : 'Caja');
    if (changed) {
      if (dialog.open) dialog.close();
      clearTimeout(noticeTimer);
      feedback.textContent = '';
    }
    if (role === 'cliente') renderCatalog();
    else window.renderOperaciones(role);
    if (next === 'catalogo') get('catalog-title').focus();
    else if (initialized && changed) {
      window.scrollTo(0, 0);
      const heading = document.querySelector('#vista-' + (role === 'cliente' ? 'cliente' : 'operaciones') + ' h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
    initialized = true;
  }

  function flash(message) {
    clearTimeout(noticeTimer);
    feedback.textContent = message;
    noticeTimer = setTimeout(() => { feedback.textContent = ''; }, 4500);
  }

  function showDialog(heading, body, focus) {
    stopTimer();
    title.textContent = heading;
    content.innerHTML = body;
    if (!dialog.open) {
      opener = document.activeElement;
      dialog.showModal();
    }
    const target = focus ? content.querySelector(focus) : title;
    if (target) {
      if (target === title) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
    dialog.scrollTop = 0;
  }

  function showError(message) {
    const box = content.querySelector('[data-dialog-error]');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  }

  const error = '<p class="notice problem" data-dialog-error role="alert" hidden></p>';
  const option = value => '<option value="' + html(value) + '">' + html(value) + '</option>';

  function variantDetails(product, color, size) {
    return product.variants.find(variant => variant.color === color && variant.size === size);
  }

  function cartQuantity(productId, color, size) {
    return cart.find(item => item.productId === productId && item.color === color && item.size === size)?.quantity ?? 0;
  }

  function showProduct(product) {
    productDetail = product;
    const color = product.colors[0];
    const size = product.sizes.find(candidate => bata.stock(product.id, color, candidate, storeId)) ?? product.sizes[0];
    const { price, originalPrice, discountPercent } = bata.productPrice(product.id);
    showDialog(product.name, '<div class="product-detail">' +
      '<img src="' + product.image + '" width="512" height="512" alt="' + html(product.name + ' en ' + color) + '">' +
      '<form class="dialog-form" data-form="product">' +
        '<p>' + html(product.description) + '</p>' +
        '<p class="price">' + (discountPercent ? '<del>' + bata.money(originalPrice) + '</del>' : '') + bata.money(price) + '</p>' +
        '<div class="form-columns">' +
          '<div class="field"><label for="detalle-color">Color</label><select name="color" id="detalle-color">' + product.colors.map(option).join('') + '</select></div>' +
          '<div class="field"><label for="detalle-talla">Talla</label><select name="size" id="detalle-talla">' + product.sizes.map(option).join('') + '</select></div>' +
        '</div>' +
        '<p class="notice" data-variant-status aria-live="polite"></p>' +
        '<div class="field"><label for="cantidad">Unidades</label><select id="cantidad" name="quantity"></select></div>' +
        error +
        '<button type="submit" class="button primary" data-add>Añadir a la cesta</button>' +
        '<button type="button" class="button text-button" data-action="cart" hidden>Ver cesta</button>' +
      '</form></div>');
    get('detalle-talla').value = size;
    updateVariant();
  }

  function updateVariant() {
    const { value: color } = get('detalle-color');
    const { value: size } = get('detalle-talla');
    const picture = content.querySelector('.product-detail img');
    const image = productDetail.images[color];
    if (picture.getAttribute('src') !== image) {
      picture.src = image;
      picture.alt = productDetail.name + ' en ' + color;
    }
    const variant = variantDetails(productDetail, color, size);
    const stock = variant ? bata.stock(productDetail.id, color, size, storeId) : 0;
    const wrongStore = cartStore && cartStore !== storeId;
    const blocked = Boolean(wrongStore || payment);
    const remaining = Math.max(0, stock - (wrongStore ? 0 : cartQuantity(productDetail.id, color, size)));
    const kind = remaining === 1 ? '1 unidad disponible' : remaining + ' unidades disponibles';
    const message = remaining ? kind : (stock ? 'Ya tienes todas las unidades disponibles en la cesta' : 'Agotado');
    content.querySelector('[data-variant-status]').textContent = message + ' en ' + store(storeId).name + '.';
    const quantity = get('cantidad');
    quantity.innerHTML = Array.from({ length: remaining || 1 }, (_, index) => option(index + 1)).join('');
    quantity.disabled = !remaining || blocked;
    content.querySelector('[data-add]').disabled = quantity.disabled;
    const warning = content.querySelector('[data-dialog-error]');
    warning.hidden = !blocked;
    content.querySelector('[data-action="cart"]').hidden = !blocked;
    if (payment) warning.textContent = 'Tienes un pago en curso. Abre la cesta para continuarlo.';
    else if (wrongStore) warning.textContent = 'Tu cesta es de ' + store(cartStore).name + '. Cada reserva se recoge en una sola tienda.';
  }

  function updateBag() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    bag.querySelector('.bag-count').textContent = count;
    bag.setAttribute('aria-label', 'Abrir cesta, ' + count + (count === 1 ? ' artículo' : ' artículos'));
  }

  function addToCart(fields) {
    const { color, size } = fields;
    const quantity = Number(fields.quantity);
    if (cartStore && cartStore !== storeId) throw new Error('Cada reserva se recoge en una sola tienda.');
    const existing = cart.find(item => item.productId === productDetail.id && item.color === color && item.size === size);
    const available = bata.stock(productDetail.id, color, size, storeId) - (existing?.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) throw new Error('Revisa la cantidad disponible.');
    if (existing) existing.quantity += quantity;
    else cart.push({ productId: productDetail.id, color, size, quantity });
    cartStore = storeId;
    updateBag();
    dialog.close();
    flash(productDetail.name + ' se ha añadido a tu cesta.');
  }

  function summary(quote) {
    return '<div class="cart-subtotal"><span>Subtotal</span><span class="price">' + bata.money(quote.subtotal) + '</span></div>' +
      (quote.discount ? '<div class="cart-subtotal"><span>Descuentos</span><span class="price">−' + bata.money(quote.discount) + '</span></div>' : '') +
      '<div class="cart-total"><strong>Total</strong><strong class="price">' + bata.money(quote.total) + '</strong></div>';
  }

  function cartQuote() {
    return bata.quote({ storeId: cartStore, items: cart, coupon });
  }

  function showCart() {
    if (payment) return showPayment();
    if (!cart.length) {
      showDialog('Tu cesta', '<div class="empty-actions"><p>Tu cesta está vacía. Elige una prenda y consulta sus tallas.</p><button class="button primary" type="button" data-action="browse">Ver catálogo</button></div>');
      return;
    }
    const pickup = store(cartStore);
    let quote;
    let stockIssue = '';
    try { quote = cartQuote(); } catch (reason) { stockIssue = reason.message; }
    showDialog('Tu cesta', '<div class="dialog-form">' +
      '<div><strong>' + html(pickup.name) + '</strong><p class="pickup-address">' + html(pickup.address) + '</p></div>' +
      '<ul class="cart-lines">' + cart.map((item, index) => {
        const line = quote?.items[index];
        const product = bata.products.find(({ id }) => id === item.productId);
        return '<li class="cart-line"><div><p><strong>' + html(product.name) + '</strong></p><small>' +
          item.quantity + ' × ' + html(item.color) + ' / ' + html(item.size) +
          (line?.discountName ? ' · ' + html(line.discountName) : '') + '</small></div>' +
          (line ? '<strong class="price">' + bata.money(line.subtotal) + '</strong>' : '') +
          '<button type="button" class="button text-button" data-remove="' + index + '" aria-label="Quitar ' + html(product.name + ' ' + item.color + ' ' + item.size) + '">Quitar</button></li>';
      }).join('') + '</ul>' +
      '<form class="form-columns" data-form="coupon"><div class="field"><label for="cupon">Cupón</label>' +
        '<input id="cupon" name="coupon" value="' + html(coupon) + '" maxlength="24" autocomplete="off" placeholder="HOLA10"></div>' +
        '<button class="button secondary coupon-button" type="submit">Aplicar cupón</button></form>' +
      (quote?.couponMessage ? '<p class="notice' + (quote.couponApplied ? ' status' : '') + '" role="status">' + html(quote.couponMessage) + '</p>' : '') +
      (quote ? summary(quote) : '<p class="notice problem" role="alert">' + html(stockIssue) + ' Quita esa línea para continuar.</p>') +
      '<button type="button" class="button primary" data-action="checkout"' + (quote ? '' : ' disabled') + '>Continuar con la reserva</button></div>');
  }

  function showCheckout(message = '') {
    let quote;
    try { quote = cartQuote(); }
    catch { return showCart(); }
    showDialog('Completa tu reserva', '<form class="dialog-form" data-form="checkout">' +
      '<p>Recogida en <strong>' + html(store(cartStore).name) + '</strong>.</p>' +
      '<div class="form-columns"><div class="field"><label for="nombre">Nombre</label>' +
        '<input id="nombre" name="name" value="' + html(contact.name) + '" maxlength="80" autocomplete="name" required></div>' +
      '<div class="field"><label for="correo">Correo electrónico</label>' +
        '<input id="correo" name="email" type="email" value="' + html(contact.email) + '" maxlength="120" autocomplete="email" required></div></div>' +
      '<p class="notice">Usa datos de prueba. El prototipo guarda la reserva en este navegador.</p>' +
      '<div class="dialog-actions"><button class="button text-button" type="button" data-action="fill-demo">Usar datos de prueba</button></div>' +
      '<fieldset class="pay-methods"><legend>Forma de pago</legend>' +
        '<label><input type="radio" name="payment" value="online"' + (contact.payment === 'online' ? ' checked' : '') + '><span><strong>Pago online</strong><small>Recogida en 7 días desde el pago.</small></span></label>' +
        '<label><input type="radio" name="payment" value="store"' + (contact.payment === 'store' ? ' checked' : '') + '><span><strong>Pago en tienda</strong><small>Recogida y pago en las próximas 48 horas.</small></span></label>' +
      '</fieldset>' + summary(quote) + error +
      '<div class="dialog-actions"><button class="button primary" type="submit" data-confirm-reservation>' +
      (contact.payment === 'online' ? 'Continuar al pago de prueba' : 'Confirmar reserva') +
      '</button><button class="button text-button" type="button" data-action="cart">Volver a la cesta</button></div></form>');
    if (message) showError(message);
  }

  function stopTimer() {
    clearInterval(paymentTimer);
    paymentTimer = undefined;
  }

  function showPayment() {
    showDialog('Pago de prueba', '<div class="dialog-form">' +
      '<p>Se han apartado tus prendas. Completa el pago dentro de los próximos 15 minutos.</p>' +
      '<p class="notice">Tiempo restante <strong data-countdown></strong></p>' + summary(payment) + error +
      '<div class="dialog-actions">' +
        '<button class="button primary" type="button" data-action="pay">Simular pago correcto</button>' +
        '<button class="button secondary" type="button" data-action="fail">Simular rechazo</button>' +
      '</div></div>');
    const countdown = content.querySelector('[data-countdown]');
    const tick = () => {
      if (!payment || !dialog.open) return stopTimer();
      const seconds = Math.max(0, Math.ceil((Date.parse(payment.expiresAt) - Date.now()) / 1000));
      countdown.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      if (!seconds) {
        try { bata.finishOnlinePayment({ id: payment.id, approved: false }); }
        catch (reason) {
          payment = undefined;
          renderCatalog();
          showCheckout(reason.message);
        }
      }
    };
    paymentTimer = setInterval(tick, 1000);
    tick();
  }

  function finishPayment(approved) {
    try {
      const result = bata.finishOnlinePayment({ id: payment.id, approved });
      confirm(result);
    } catch (reason) {
      payment = undefined;
      renderCatalog();
      showCheckout(reason.message);
    }
  }

  function confirm(result) {
    cart.length = 0;
    cartStore = '';
    coupon = '';
    payment = undefined;
    contact.name = '';
    contact.email = '';
    updateBag();
    renderCatalog();
    showReservation(result, true);
  }

  function showLookup() {
    showDialog('Mi reserva', '<form class="dialog-form" data-form="lookup">' +
      '<p>Introduce la referencia y el correo que usaste para reservar.</p>' +
      '<div class="field"><label for="referencia">Referencia</label><input id="referencia" name="ref" maxlength="24" autocomplete="off" placeholder="BATA-0001" required></div>' +
      '<div class="field"><label for="correo-reserva">Correo electrónico</label><input id="correo-reserva" name="email" type="email" maxlength="120" autocomplete="email" required></div>' +
      '<div class="dialog-actions"><button class="button text-button" type="button" data-action="lookup-demo">Usar reserva de ejemplo</button></div>' +
      error + '<button class="button primary" type="submit">Consultar reserva</button></form>', '#referencia');
  }

  function qrMarkup(code) {
    if (typeof window.qrcode !== 'function') return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(code);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true });
  }

  function showReservation(data, created = false, update = '') {
    reservation = data;
    const pickup = store(data.storeId);
    const pending = data.status === 'pending';
    const amountLabel = data.payment === 'online' ? 'Pago online' : 'Pago en tienda';
    showDialog(created ? 'Reserva confirmada' : 'Reserva ' + data.ref, '<div class="dialog-form">' +
      (update ? '<p class="status" role="status">' + html(update) + '</p>' : '') +
      (pending ? '<p>Muestra este QR en caja para recoger tu reserva completa.</p>' : '') +
      '<dl class="reservation-meta"><div><dt>Tienda de recogida</dt><dd>' + html(pickup.name) + '<br>' + html(pickup.address) + '<br>' + html(pickup.hours) + '</dd></div>' +
        '<div><dt>Estado</dt><dd>' + html(bata.statuses[data.status]) + '</dd></div>' +
        '<div><dt>' + (pending ? 'Recoger antes del' : 'Límite de recogida') + '</dt><dd>' + bata.date(data.expiresAt) + '</dd></div>' +
        '<div><dt>' + amountLabel + '</dt><dd>' + bata.money(data.total) + '</dd></div></dl>' +
      (pending ? '<figure class="qr-card" aria-label="Código QR de recogida ' + html(data.qr) + '">' +
        '<div aria-hidden="true">' + qrMarkup(data.qr) + '</div><figcaption>' + html(data.ref) + '</figcaption></figure>' : '') +
      '<ul class="cart-lines">' + data.items.map(item => '<li class="cart-line"><div><p><strong>' + html(item.name) +
        '</strong></p><small>' + item.quantity + ' × ' + html(item.color) + ' / ' + html(item.size) +
        '</small></div><strong class="price">' + bata.money(item.subtotal) + '</strong></li>').join('') + '</ul>' +
      (data.refundAmount != null ? '<p class="notice">Devolución simulada de ' + bata.money(data.refundAmount) + '.</p>' : '') +
      error +
      '<div class="dialog-actions">' +
      (pending ? '<button class="button secondary" type="button" data-action="resend">Reenviar confirmación</button>' +
        '<button class="button text-button" type="button" data-action="cancel">Cancelar reserva</button>' :
        '<button class="button secondary" type="button" data-action="lookup">Consultar otra reserva</button>') +
      '</div></div>');
  }

  function askCancel() {
    showDialog('¿Cancelar la reserva?', '<div class="dialog-form"><p>Se liberarán todas las prendas de la reserva ' +
      html(reservation.ref) + ' y el QR dejará de ser válido.' +
      (reservation.payment === 'online' ? ' Se simulará la devolución de ' + bata.money(reservation.total) + '.' : '') + '</p>' +
      error + '<div class="dialog-actions"><button class="button secondary" type="button" data-action="keep">Mantener reserva</button>' +
      '<button class="button primary" type="button" data-action="confirm-cancel">Sí, cancelar reserva</button></div></div>');
  }

  function browse() {
    opener = null;
    dialog.close();
    if (location.hash === '#catalogo') get('catalog-title').focus();
    else location.hash = 'catalogo';
  }

  const actions = {
    browse, cart: showCart, checkout: () => showCheckout(), pay: () => finishPayment(true), fail: () => finishPayment(false),
    'fill-demo': () => { get('nombre').value = 'Alicia Demo'; get('correo').value = bata.demoEmail; },
    lookup: showLookup,
    'lookup-demo': () => { get('referencia').value = 'BATA-0001'; get('correo-reserva').value = bata.demoEmail; },
    resend: () => {
      const result = bata.resendReservation(reservation);
      showReservation(result, false, 'Reenvío simulado al correo original.');
    },
    cancel: askCancel,
    keep: () => showReservation(reservation),
    'confirm-cancel': () => {
      const result = bata.cancelReservation(reservation);
      renderCatalog();
      showReservation(result, false, 'Reserva cancelada.');
    },
  };

  const submissions = {
    product: addToCart,
    coupon: fields => { coupon = fields.coupon.trim().toUpperCase(); showCart(); },
    checkout: fields => {
      Object.assign(contact, fields);
      const data = { ...contact, storeId: cartStore, items: cart, coupon };
      if (fields.payment === 'online') {
        payment = bata.startOnlinePayment(data);
        renderCatalog();
        showPayment();
      } else confirm(bata.createReservation(data));
    },
    lookup: fields => showReservation(bata.getReservation(fields)),
  };

  storeField.innerHTML = bata.stores.map(item => '<option value="' + item.id + '">' + html(item.name) + '</option>').join('');
  categoryList.innerHTML = ['', ...bata.categories].map(item =>
    '<button type="button" data-category="' + html(item) + '" aria-pressed="false">' + html(item || 'Todo') + '</button>'
  ).join('');

  storeField.addEventListener('change', () => {
    storeId = storeField.value;
    renderCatalog();
  });
  categoryList.addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (button) {
      category = button.dataset.category;
      renderCatalog();
    }
  });
  search.addEventListener('input', renderCatalog);
  get('hero-search').addEventListener('submit', event => {
    event.preventDefault();
    category = '';
    renderCatalog();
    if (location.hash === '#catalogo') get('catalog-title').focus();
    else location.hash = 'catalogo';
  });
  products.addEventListener('click', event => {
    const productButton = event.target.closest('[data-product]');
    if (productButton) showProduct(bata.products.find(item => item.id === productButton.dataset.product));
    if (event.target.closest('[data-clear-search]')) {
      search.value = '';
      category = '';
      renderCatalog();
      get('catalog-title').focus();
    }
  });

  document.querySelector('[data-open-lookup]').addEventListener('click', showLookup);
  bag.addEventListener('click', showCart);
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    stopTimer();
    if (opener?.isConnected && document.body.dataset.role === 'cliente') opener.focus({ preventScroll: true });
  });
  content.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      cart.splice(Number(remove.dataset.remove), 1);
      if (!cart.length) { cartStore = ''; coupon = ''; }
      updateBag();
      showCart();
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const form = content.querySelector('[data-form="checkout"]');
    if (form) Object.assign(contact, Object.fromEntries(new FormData(form)));
    try { actions[button.dataset.action](); } catch (reason) {
      if (content.querySelector('[data-dialog-error]')) showError(reason.message);
      else flash(reason.message);
    }
  });
  content.addEventListener('change', event => {
    if (['detalle-color', 'detalle-talla'].includes(event.target.id)) updateVariant();
    if (event.target.name === 'payment') {
      content.querySelector('[data-confirm-reservation]').textContent = event.target.value === 'online'
        ? 'Continuar al pago de prueba' : 'Confirmar reserva';
    }
  });
  content.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    try { submissions[form.dataset.form](Object.fromEntries(new FormData(form))); }
    catch (reason) { showError(reason.message); }
  });
  window.addEventListener('hashchange', showRole);
  window.addEventListener('storage', event => {
    if (event.key === 'bata-prototipo-v1') {
      if (document.body.dataset.role === 'cliente') renderCatalog();
      else window.renderOperaciones(document.body.dataset.role);
    }
  });
  showRole();
})();
