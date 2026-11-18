(() => {
  'use strict';

  const storageKey = 'bata-prototipo-v1';
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const paymentWindow = 15 * 60 * 1000;
  const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const spanishDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  const iso = timestamp => new Date(timestamp).toISOString();

  const stores = [
    { id: 'centro', name: 'Albacete Centro', address: 'Calle Ancha, 24', hours: 'Lun–sáb · 10:00–20:30' },
    { id: 'campus', name: 'Albacete Campus', address: 'Avenida de España, 62', hours: 'Lun–sáb · 10:00–20:00' },
    { id: 'ciudad-real', name: 'Ciudad Real', address: 'Calle General Aguilera, 8', hours: 'Lun–sáb · 10:00–20:30' },
  ];

  const sizes = ['S', 'M', 'L'];
  const products = [
    { id: 'americana', name: 'Americana Siena', category: 'Chaquetas', description: 'Corte recto, solapa clásica y tejido suave con cuerpo.', price: 79.90, tone: '#d2b49d', colors: ['Cacao', 'Arena'], sizes },
    { id: 'camisa', name: 'Camisa Niebla', category: 'Camisas', description: 'Popelín de algodón, puño abotonado y silueta holgada.', price: 39.90, tone: '#e3d9c7', colors: ['Marfil', 'Azul'], sizes },
    { id: 'pantalon', name: 'Pantalón Olmo', category: 'Pantalones', description: 'Pantalón recto de tiro alto con pinzas y bolsillos laterales.', price: 49.90, tone: '#c9b9a7', colors: ['Negro', 'Arena'], sizes: ['36', '38', '40', '42'] },
    { id: 'jersey', name: 'Jersey Bruma', category: 'Punto', description: 'Punto acanalado, cuello redondo y manga larga.', price: 45.90, tone: '#c99c99', colors: ['Burdeos', 'Avena'], sizes },
    { id: 'gabardina', name: 'Gabardina Alba', category: 'Abrigos', description: 'Gabardina cruzada de largo medio con cinturón ajustable.', price: 99.90, tone: '#d6bea3', colors: ['Camel', 'Oliva'], sizes },
    { id: 'bolso', name: 'Bolso Lúa', category: 'Accesorios', description: 'Bolso al hombro con cierre de cremallera y bolsillo interior.', price: 34.90, tone: '#d6c5af', colors: ['Negro', 'Cacao'], sizes: ['Única'] },
  ].map((product, productIndex) => ({
    ...product,
    image: `img/${product.id}.webp?v=fondo-azul`,
    variants: product.colors.flatMap((color, colorIndex) => product.sizes.map((size, sizeIndex) => ({
      color,
      size,
      stock: Object.fromEntries(stores.map(({ id }, storeIndex) => {
        const quantity = (productIndex * 3 + colorIndex * 5 + sizeIndex * 2 + storeIndex * 3 + 5) % 9;
        return [id, quantity];
      })),
    }))),
  }));

  const categories = [...new Set(products.map(({ category }) => category))];
  const statuses = { pending: 'Pendiente', collected: 'Recogida', cancelled: 'Cancelada', expired: 'Vencida' };
  const demoEmail = 'demo@example.com';
  let memory;
  let storageAvailable = true;

  function seed(now) {
    const examples = [
      ['centro', 'online', 'pending', 'americana', 'Cacao', 'M', 'Andrea Demo', 3 * hour],
      ['centro', 'store', 'pending', 'camisa', 'Marfil', 'S', 'Álex Demo', 12 * hour],
      ['campus', 'online', 'pending', 'jersey', 'Burdeos', 'M', 'Nuria Demo', 27 * hour],
      ['ciudad-real', 'online', 'collected', 'bolso', 'Negro', 'Única', 'Dani Demo', 3 * day],
      ['centro', 'online', 'cancelled', 'pantalon', 'Negro', '38', 'Mar Demo', 5 * day],
      ['campus', 'store', 'expired', 'gabardina', 'Camel', 'S', 'Luz Demo', 4 * day],
    ];

    return {
      sequence: examples.length,
      payments: [],
      reservations: examples.map(([storeId, payment, status, productId, color, size, name, age], index) => {
        const product = products.find(({ id }) => id === productId);
        const ref = `BATA-${String(index + 1).padStart(4, '0')}`;
        const created = now - age;
        const price = product.price;
        const discount = productId === 'jersey' ? Math.round(price * 15) / 100 : 0;
        const total = Math.round((price - discount) * 100) / 100;
        return {
          ref, qr: ref, storeId, name, email: demoEmail, payment, status,
          items: [{ productId, name: product.name, color, size, quantity: 1, price, baseSubtotal: price, discount, subtotal: total }],
          subtotal: price, discount, total,
          paid: payment === 'online' && status !== 'cancelled',
          createdAt: iso(created), expiresAt: iso(created + (payment === 'online' ? 7 * day : 2 * day)),
          ...(status === 'collected' && { collectedAt: iso(created + day) }),
          ...(status === 'cancelled' && { cancelledAt: iso(created + hour), refundedAt: iso(created + hour), refundAmount: total }),
        };
      }),
      discounts: [
        { id: 'DS-01', type: 'promo', name: 'Temporada de punto', code: '', percent: 15, category: 'Punto', start: '', end: '', active: true },
        { id: 'DS-02', type: 'coupon', name: 'Bienvenida', code: 'HOLA10', percent: 10, category: '', start: '', end: '', active: true },
      ],
    };
  }

  function save(state) {
    memory = JSON.stringify(state);
    if (!storageAvailable) return;
    try {
      localStorage.setItem(storageKey, memory);
    } catch {
      storageAvailable = false;
    }
  }

  function release(reservation, status, timestamp) {
    reservation.status = status;
    reservation.cancelledAt = iso(timestamp);
    if (reservation.paid) {
      reservation.paid = false;
      reservation.refundedAt = iso(timestamp);
      reservation.refundAmount = reservation.total;
    }
  }

  function read() {
    let stored = memory;
    if (storageAvailable) {
      try {
        stored = localStorage.getItem(storageKey);
      } catch {
        storageAvailable = false;
      }
    }
    const now = Date.now();
    let state;
    try {
      state = JSON.parse(stored ?? 'null');
    } catch {
      // Replace an unreadable demo state with the sample data.
    }
    let changed = !Array.isArray(state?.reservations) || !Array.isArray(state.discounts) || !Array.isArray(state.payments);
    if (changed) state = seed(now);
    for (const reservation of state.reservations) {
      const expires = Date.parse(reservation.expiresAt);
      if (reservation.status === 'pending' && expires <= now) {
        release(reservation, 'expired', expires);
        changed = true;
      }
    }
    for (const payment of state.payments) {
      if (payment.status === 'waiting' && Date.parse(payment.expiresAt) <= now) {
        payment.status = 'expired';
        changed = true;
      }
    }
    if (changed) save(state);
    return state;
  }

  function localDay(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${dayOfMonth}`;
  }

  function isCurrent(discount, today = localDay()) {
    return discount.active && (!discount.start || today >= discount.start) && (!discount.end || today <= discount.end);
  }

  function applies(discount, product) {
    return !discount.category || discount.category === product.category;
  }

  function promotionFor(discounts, product) {
    return discounts.reduce((best, discount) => {
      const appliesToday = discount.type === 'promo' && isCurrent(discount) && applies(discount, product);
      return appliesToday && discount.percent > (best?.percent ?? 0) ? discount : best;
    }, null);
  }

  function availableStock(state, productId, color, size, storeId) {
    const product = products.find(({ id }) => id === productId);
    const variant = product?.variants.find(item => item.color === color && item.size === size);
    const base = variant?.stock[storeId] ?? 0;
    const reservations = state.reservations.filter(item => item.status === 'pending' || item.status === 'collected');
    const holds = state.payments.filter(item => item.status === 'waiting');
    const used = [...reservations, ...holds].reduce((quantity, reservation) => {
      if (reservation.storeId !== storeId) return quantity;
      const item = reservation.items.find(line => line.productId === productId && line.color === color && line.size === size);
      return quantity + (item?.quantity ?? 0);
    }, 0);
    return Math.max(0, base - used);
  }

  function requireStore(storeId) {
    if (!stores.some(({ id }) => id === storeId)) throw new Error('Selecciona una tienda.');
  }

  function getQuote(state, { storeId, items, coupon = '' }) {
    requireStore(storeId);
    if (!Array.isArray(items) || !items.length) throw new Error('Añade al menos un producto a la reserva.');
    const grouped = new Map();
    for (const { productId, color, size, quantity, storeId: lineStoreId } of items) {
      if (lineStoreId && lineStoreId !== storeId) throw new Error('Todos los productos deben recogerse en la misma tienda.');
      if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Indica una cantidad válida.');
      const key = [productId, color, size].join('\n');
      const previous = grouped.get(key);
      grouped.set(key, { productId, color, size, quantity: (previous?.quantity ?? 0) + quantity });
    }

    const code = String(coupon).trim().toUpperCase();
    const activeCoupon = code && state.discounts.find(item => item.type === 'coupon' && item.code === code && isCurrent(item));
    let couponApplied = false;
    let subtotal = 0;
    let discount = 0;
    const lines = Array.from(grouped.values(), item => {
      const product = products.find(({ id }) => id === item.productId);
      if (!product?.variants.some(variant => variant.color === item.color && variant.size === item.size)) {
        throw new Error('Selecciona una talla y un color disponibles.');
      }
      if (item.quantity > availableStock(state, item.productId, item.color, item.size, storeId)) {
        throw new Error(`No quedan suficientes unidades de ${product.name} en esta tienda.`);
      }
      const promotion = promotionFor(state.discounts, product);
      const couponMatches = !promotion && activeCoupon && applies(activeCoupon, product);
      const applied = promotion || (couponMatches && activeCoupon);
      if (couponMatches) couponApplied = true;
      const unitPrice = Math.round(product.price * 100);
      const base = unitPrice * item.quantity;
      const savings = Math.round(unitPrice * (applied?.percent ?? 0) / 100) * item.quantity;
      subtotal += base;
      discount += savings;
      return {
        ...item, name: product.name, price: product.price, baseSubtotal: base / 100,
        discount: savings / 100, subtotal: (base - savings) / 100, discountName: applied?.name ?? '',
      };
    });

    let couponMessage = '';
    if (code) {
      if (couponApplied) couponMessage = 'Cupón aplicado a los productos elegibles.';
      else if (activeCoupon) couponMessage = 'El cupón no se aplica a los productos de esta reserva.';
      else couponMessage = 'El cupón no existe o ya no está vigente.';
    }
    return { items: lines, subtotal: subtotal / 100, discount: discount / 100, total: (subtotal - discount) / 100, couponApplied, couponMessage };
  }

  function contact(data) {
    const name = String(data.name ?? '').trim();
    const email = String(data.email ?? '').trim().toLowerCase();
    if (!name || name.length > 80) throw new Error('Introduce un nombre válido.');
    if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Introduce un correo válido.');
    return { name, email };
  }

  function reference(sequence) {
    return `BATA-${String(sequence).padStart(4, '0')}`;
  }

  function addReservation(state, data, payment, ref) {
    const now = Date.now();
    const reservation = {
      ...data, ref, qr: ref, payment, status: 'pending', paid: payment === 'online',
      createdAt: iso(now), expiresAt: iso(now + (payment === 'online' ? 7 * day : 2 * day)),
    };
    state.reservations.unshift(reservation);
    return reservation;
  }

  function createReservation(data) {
    if (data.payment !== 'online' && data.payment !== 'store') throw new Error('Selecciona una forma de pago.');
    const state = read();
    const details = { storeId: data.storeId, ...contact(data), ...getQuote(state, data) };
    const reservation = addReservation(state, details, data.payment, reference(++state.sequence));
    save(state);
    return reservation;
  }

  function startOnlinePayment(data) {
    const state = read();
    const details = { storeId: data.storeId, ...contact(data), ...getQuote(state, data) };
    const payment = {
      ...details, id: `PAGO-${++state.sequence}`, ref: reference(state.sequence),
      status: 'waiting', expiresAt: iso(Date.now() + paymentWindow),
    };
    state.payments.unshift(payment);
    save(state);
    return payment;
  }

  function finishOnlinePayment({ id, approved }) {
    const state = read();
    const payment = state.payments.find(item => item.id === id);
    if (!payment) throw new Error('No se ha encontrado el intento de pago.');
    if (payment.status === 'approved') return state.reservations.find(item => item.ref === payment.ref);
    if (payment.status === 'expired' || payment.status === 'refunded') {
      if (approved && payment.status === 'expired') {
        payment.status = 'refunded';
        payment.refundedAt = iso(Date.now());
        save(state);
      }
      const message = payment.status === 'refunded'
        ? 'El pago llegó fuera de plazo. Se ha simulado la devolución íntegra.'
        : 'El plazo de 15 minutos ha terminado. Empieza una nueva reserva.';
      throw new Error(message);
    }
    if (payment.status !== 'waiting') throw new Error('Este intento ya se cerró. Empieza un nuevo pago.');
    payment.status = approved ? 'approved' : 'declined';
    if (!approved) {
      save(state);
      throw new Error('Pago rechazado. Las unidades se han liberado.');
    }
    const { storeId, name, email, items, subtotal, discount, total, couponApplied, couponMessage, ref } = payment;
    const reservation = addReservation(state, { storeId, name, email, items, subtotal, discount, total, couponApplied, couponMessage }, 'online', ref);
    save(state);
    return reservation;
  }

  function lookup(state, ref, { email, storeId }) {
    const code = String(ref ?? '').trim().toUpperCase();
    const reservation = state.reservations.find(item => item.ref === code);
    if (storeId) {
      requireStore(storeId);
      if (reservation && reservation.storeId !== storeId) throw new Error('La reserva pertenece a otra tienda.');
      if (reservation) return reservation;
      throw new Error('No se ha encontrado ninguna reserva con ese código.');
    }
    if (reservation && reservation.email === String(email ?? '').trim().toLowerCase()) return reservation;
    throw new Error('Revisa la referencia y el correo de la reserva.');
  }

  function requirePending(reservation) {
    if (reservation.status === 'collected') throw new Error('Esta reserva ya se ha recogido.');
    if (reservation.status === 'cancelled') throw new Error('Esta reserva está cancelada.');
    if (reservation.status === 'expired') throw new Error('El plazo de recogida ha terminado.');
  }

  function cancelReservation({ ref, email }) {
    const state = read();
    const reservation = lookup(state, ref, { email });
    requirePending(reservation);
    release(reservation, 'cancelled', Date.now());
    save(state);
    return reservation;
  }

  function resendReservation({ ref, email, storeId }) {
    const state = read();
    const reservation = lookup(state, ref, { email, storeId });
    requirePending(reservation);
    reservation.emailResentAt = iso(Date.now());
    save(state);
    return reservation;
  }

  function checkPickup(state, code, storeId) {
    requireStore(storeId);
    const reservation = lookup(state, code, { storeId });
    requirePending(reservation);
    if (reservation.payment === 'online' && !reservation.paid) throw new Error('El pago online está pendiente.');
    return reservation;
  }

  function completePickup({ code, storeId, paid = false }) {
    const state = read();
    const reservation = checkPickup(state, code, storeId);
    if (reservation.payment === 'store' && !paid) throw new Error('Confirma el cobro antes de registrar la entrega.');
    reservation.paid = true;
    reservation.status = 'collected';
    reservation.collectedAt = iso(Date.now());
    save(state);
    return reservation;
  }

  function listReservations({ storeId = '', status = '', date = '' } = {}) {
    return read().reservations.filter(item =>
      (!storeId || item.storeId === storeId)
      && (!status || item.status === status)
      && (!date || localDay(item.createdAt) === date));
  }

  function dateInputValid(value) {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && iso(timestamp).startsWith(`${value}T`);
  }

  function createDiscount({ type, name, code = '', percent, category = '', start = '', end = '' }) {
    const state = read();
    const label = String(name ?? '').trim();
    const normalizedCode = type === 'coupon' ? String(code).trim().toUpperCase() : '';
    const amount = Number(percent);
    if (type !== 'promo' && type !== 'coupon') throw new Error('Selecciona un tipo de descuento.');
    if (!label || label.length > 60) throw new Error('Introduce un nombre de hasta 60 caracteres.');
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) throw new Error('Indica un porcentaje entero entre 1 y 100.');
    if (category && !categories.includes(category)) throw new Error('Selecciona una categoría válida.');
    if (!dateInputValid(start) || !dateInputValid(end) || (start && end && end < start)) {
      throw new Error('Revisa las fechas de vigencia.');
    }
    if (type === 'coupon') {
      if (!/^[A-Z0-9-]{3,20}$/.test(normalizedCode)) throw new Error('Usa un código de 3 a 20 caracteres con letras, números o guiones.');
      if (state.discounts.some(item => item.code === normalizedCode)) throw new Error('Ya hay un cupón con ese código.');
    }
    const discount = { id: `DS-${String(state.discounts.length + 1).padStart(2, '0')}`, type, name: label, code: normalizedCode, percent: amount, category, start, end, active: true };
    state.discounts.unshift(discount);
    save(state);
    return { ...discount, current: isCurrent(discount) };
  }

  function toggleDiscount(id) {
    const state = read();
    const discount = state.discounts.find(item => item.id === id);
    if (!discount) throw new Error('No se ha encontrado el descuento.');
    discount.active = !discount.active;
    save(state);
    return { ...discount, current: isCurrent(discount) };
  }

  function productPrice(productId) {
    const product = products.find(({ id }) => id === productId);
    const promotion = promotionFor(read().discounts, product);
    const base = Math.round(product.price * 100);
    const savings = Math.round(base * (promotion?.percent ?? 0) / 100);
    return { price: (base - savings) / 100, originalPrice: product.price, discountPercent: promotion?.percent ?? 0, promotion };
  }

  window.Bata = {
    stores, products, categories, statuses, demoEmail,
    money: value => euros.format(value),
    date: value => spanishDate.format(new Date(value)),
    stock: (productId, color, size, storeId) => availableStock(read(), productId, color, size, storeId),
    productPrice,
    quote: data => getQuote(read(), data),
    createReservation, startOnlinePayment, finishOnlinePayment,
    getReservation: ({ ref, email }) => lookup(read(), ref, { email }),
    cancelReservation, resendReservation, listReservations,
    validatePickup: ({ code, storeId }) => checkPickup(read(), code, storeId),
    completePickup,
    listDiscounts: () => read().discounts.map(item => ({ ...item, current: isCurrent(item) })),
    createDiscount, toggleDiscount,
  };
})();
