/* Forkly — a static food-delivery dashboard. No backend: localStorage is the database. */
(() => {
  'use strict';

  const { SPEED, ROUTE, STEPS, pointAt, routeD, state, clock, clamp, pill } = ForklyTrack;

  const LS = 'forkly.db.v1';
  const FEE = 2.9;
  const TILE = { z: 14, x: 8590, y: 5670 };   // OSM tile anchor, stitched into a 3x3 grid
  const QUICK = ['Leave it at the door', 'Ring the bell twice', 'Call me on arrival', 'No cutlery, please'];
  const AUTH_ART = ['🍕', '🍔', '🍣', '🥗', '🍜', '🍰', '🧋', '🥑'];

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Number(n).toFixed(2);
  const uid = p => p + Math.random().toString(36).slice(2, 7).toUpperCase();
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const round = (n, d = 2) => +Number(n).toFixed(d);
  const when = ts => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  /* ---------- seed ---------- */
  const P = (name, desc, price, cat, emoji, rating, time) => ({ id: uid('p'), name, desc, price, cat, emoji, rating, time, available: true });

  function seed() {
    return {
      // ponytail: plaintext passwords are fine here — there is no server and no real account behind them.
      users: [{ id: 'u_demo', name: 'Demo Diner', email: 'demo@forkly.app', password: 'demo123' }],
      products: [
        P('Smash Double Burger', 'Two aged beef patties, cheddar, house sauce', 12.9, 'Burgers', '🍔', 4.8, 15),
        P('Crispy Chicken Burger', 'Buttermilk chicken, slaw, brioche bun', 11.5, 'Burgers', '🍗', 4.7, 14),
        P('Beyond Veggie Burger', 'Plant patty, avocado, smoked mayo', 12.0, 'Burgers', '🥬', 4.5, 16),
        P('Margherita Napoletana', 'San Marzano, fior di latte, basil', 13.5, 'Pizza', '🍕', 4.9, 18),
        P('Pepperoni Inferno', 'Double pepperoni, chilli honey', 15.0, 'Pizza', '🍕', 4.8, 18),
        P('Truffle Funghi', 'Mushroom, truffle cream, thyme', 16.5, 'Pizza', '🍄', 4.6, 20),
        P('Salmon Nigiri Set', '12 pieces, wasabi and pickled ginger', 18.0, 'Sushi', '🍣', 4.9, 22),
        P('Rainbow Maki Platter', 'Chef selection, 24 pieces', 21.5, 'Sushi', '🍱', 4.7, 25),
        P('Caesar Crunch Bowl', 'Romaine, parmesan, sourdough croutons', 10.5, 'Salads', '🥗', 4.4, 10),
        P('Poke Bowl Deluxe', 'Ahi tuna, edamame, mango, sesame', 14.5, 'Salads', '🐟', 4.8, 12),
        P('Ramen Tonkotsu', '18-hour broth, chashu, soft egg', 14.9, 'Noodles', '🍜', 4.9, 20),
        P('Pad Thai Classic', 'Rice noodles, tamarind, peanuts', 13.2, 'Noodles', '🍤', 4.6, 18),
        P('Molten Choco Cake', 'Warm centre, vanilla cream', 7.5, 'Desserts', '🍫', 4.8, 8),
        P('New York Cheesecake', 'Baked, berry compote', 6.9, 'Desserts', '🍰', 4.7, 6),
        P('Iced Matcha Latte', 'Ceremonial grade, oat milk', 4.9, 'Drinks', '🧋', 4.6, 4),
        P('Fresh Orange Juice', 'Cold pressed, no added sugar', 3.9, 'Drinks', '🍊', 4.5, 3),
        P('Avocado Sourdough', 'Smashed avo, chilli flakes, lime', 9.5, 'Breakfast', '🥑', 4.6, 10),
        P('Pancake Stack', 'Buttermilk, maple syrup, berries', 8.9, 'Breakfast', '🥞', 4.7, 12)
      ],
      drivers: [
        { name: 'Marco Alvarez', emoji: '🧑‍🦱', phone: '+41 79 555 01 42', vehicle: 'Honda PCX · ZH 4412', rating: 4.9 },
        { name: 'Nadia Okafor', emoji: '👩‍🦰', phone: '+41 79 555 03 18', vehicle: 'E-Bike · B-2291', rating: 4.8 },
        { name: 'Tomas Berg', emoji: '🧔', phone: '+41 79 555 07 55', vehicle: 'Vespa GTS · GE 8830', rating: 5.0 },
        { name: 'Priya Raman', emoji: '👩', phone: '+41 79 555 02 77', vehicle: 'Toyota Yaris · SG 7741', rating: 4.7 }
      ],
      orders: [],
      carts: {},
      session: null
    };
  }

  /* ---------- store ---------- */
  let db = load();
  function load() {
    try { const raw = localStorage.getItem(LS); if (raw) return JSON.parse(raw); } catch (e) { /* corrupt -> reseed */ }
    const s = seed(); localStorage.setItem(LS, JSON.stringify(s)); return s;
  }
  const save = () => localStorage.setItem(LS, JSON.stringify(db));
  const me = () => db.users.find(u => u.id === db.session) || null;
  const cart = () => (db.session && (db.carts[db.session] ||= {})) || {};
  const cartLines = () => Object.entries(cart()).map(([id, q]) => ({ p: db.products.find(x => x.id === id), q })).filter(l => l.p);
  const cartCount = () => Object.values(cart()).reduce((a, b) => a + b, 0);
  const cartSub = () => cartLines().reduce((s, l) => s + l.p.price * l.q, 0);
  const myOrders = () => db.orders.filter(o => o.userId === db.session).sort((a, b) => b.placedAt - a.placedAt);

  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 1900);
  }

  /* ---------- routing ---------- */
  const OPEN = ['login', 'signup'];
  let route = ['shop', null], filters = { q: '', cat: 'All', max: 25, sort: 'popular' }, editingId = null, ticked = 0;

  function go(hash) { location.hash = hash; }
  function router() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'shop').split('/');
    const page = parts[0] || 'shop';
    route = [page, parts[1] || null];
    if (!me() && !OPEN.includes(page)) { location.hash = '#/login'; return; }
    if (me() && OPEN.includes(page)) { location.hash = '#/shop'; return; }

    const app = $('#app');
    let html, after = null;
    switch (page) {
      case 'login':    html = viewLogin(); break;
      case 'signup':   html = viewSignup(); break;
      case 'cart':     html = viewCart(); break;
      case 'orders':   html = viewOrders(); break;
      case 'track':    html = viewTrack(route[1]); break;
      case 'products': html = viewProducts(); break;
      default:         html = viewShop(); after = paintGrid;
    }
    app.innerHTML = html;
    if (after) after();
    if (page === 'track') paintTrack();
    window.scrollTo(0, 0);
  }

  /* ---------- shell ---------- */
  function layout(content) {
    const u = me(), n = cartCount(), page = route[0];
    const link = (href, label, key, badge) =>
      `<a href="${href}" class="${page === key ? 'active' : ''}">${label}${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
    return `
    <header class="topbar"><div class="inner">
      <a class="brand" href="#/shop"><span class="logo">🍽️</span>Forkly</a>
      <nav class="nav">
        ${link('#/shop', 'Shop', 'shop')}
        ${link('#/cart', 'Cart', 'cart', n || '')}
        ${link('#/orders', 'Orders', 'orders')}
        ${link('#/products', 'Products', 'products')}
      </nav>
      <span class="spacer"></span>
      <div class="userchip">
        <span class="av">${esc((u?.name || '?').trim().charAt(0).toUpperCase())}</span>
        <span class="small" style="font-weight:600">${esc(u?.name || '')}</span>
        <button class="btn ghost sm" data-act="logout" style="border-radius:999px">Log out</button>
      </div>
    </div></header>
    <main>${content}</main>
    <footer class="foot">Forkly is a front-end demo — accounts, orders and the delivery map are simulated in your browser. Map tiles © OpenStreetMap contributors.</footer>`;
  }

  /* ---------- auth ---------- */
  function authShell(active, body) {
    return `
    <div class="auth">
      <div class="art">
        <a class="brand" href="#/login" style="color:#fff"><span class="logo" style="background:rgba(255,255,255,.25)">🍽️</span>Forkly</a>
        <div>
          <h1>Your food, tracked door to door.</h1>
          <p style="margin-top:12px;opacity:.9;max-width:34ch">Order from local kitchens and watch your rider move across the map in real time.</p>
          <div class="grid-emojis">${AUTH_ART.map(e => `<span>${e}</span>`).join('')}</div>
        </div>
        <p class="small" style="opacity:.85">Demo account: demo@forkly.app / demo123</p>
      </div>
      <div class="panel"><div class="box">
        <div class="tabs">
          <a href="#/login" class="${active === 'login' ? 'active' : ''}">Log in</a>
          <a href="#/signup" class="${active === 'signup' ? 'active' : ''}">Sign up</a>
        </div>
        ${body}
      </div></div>
    </div>`;
  }

  function viewLogin() {
    return authShell('login', `
      <h2>Welcome back</h2>
      <p class="help" style="margin:6px 0 20px">Log in to see your cart and live orders.</p>
      <form id="loginForm" novalidate>
        <div class="field"><label for="lemail">Email</label>
          <input class="input" id="lemail" name="email" type="email" placeholder="you@example.com" autocomplete="email" required></div>
        <div class="field"><label for="lpass">Password</label>
          <input class="input" id="lpass" name="password" type="password" placeholder="••••••" autocomplete="current-password" required></div>
        <p class="error" id="lerr" hidden></p>
        <button class="btn block" type="submit">Log in</button>
      </form>
      <button class="btn ghost block" style="margin-top:10px" data-act="fill-demo">Use demo account</button>`);
  }

  function viewSignup() {
    return authShell('signup', `
      <h2>Create your account</h2>
      <p class="help" style="margin:6px 0 20px">Takes a few seconds. No card, no email confirmation.</p>
      <form id="signupForm" novalidate>
        <div class="field"><label for="sname">Full name</label>
          <input class="input" id="sname" name="name" placeholder="Ada Lovelace" autocomplete="name" required></div>
        <div class="field"><label for="semail">Email</label>
          <input class="input" id="semail" name="email" type="email" placeholder="you@example.com" autocomplete="email" required></div>
        <div class="field"><label for="spass">Password</label>
          <input class="input" id="spass" name="password" type="password" placeholder="At least 6 characters" autocomplete="new-password" required></div>
        <p class="error" id="serr" hidden></p>
        <button class="btn block" type="submit">Sign up</button>
      </form>`);
  }

  /* ---------- shop ---------- */
  const CATS = () => ['All', ...new Set(db.products.map(p => p.cat))];

  function viewShop() {
    const cats = CATS().map(c => `<button class="chip ${filters.cat === c ? 'active' : ''}" data-act="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    const u = me();
    return layout(`
      <section class="hero">
        <div class="spacer">
          <h1>Hungry, ${esc((u?.name || 'friend').split(' ')[0])}?</h1>
          <p style="opacity:.8;margin-top:6px">${db.products.filter(p => p.available).length} dishes from kitchens near you · delivery ${money(FEE)}</p>
        </div>
        <div class="emoji">🛵</div>
      </section>

      <div class="filters">
        <div class="f search"><label class="small muted" for="q">Search</label>
          <input class="input" id="q" placeholder="Burger, sushi, ramen…" value="${esc(filters.q)}"></div>
        <div class="f"><label class="small muted" for="maxp">Max price <span class="rangeval" id="maxpv">${money(filters.max)}</span></label>
          <input type="range" id="maxp" min="3" max="25" step="0.5" value="${filters.max}"></div>
        <div class="f"><label class="small muted" for="sort">Sort by</label>
          <select id="sort">
            <option value="popular" ${filters.sort === 'popular' ? 'selected' : ''}>Most popular</option>
            <option value="price-asc" ${filters.sort === 'price-asc' ? 'selected' : ''}>Price: low to high</option>
            <option value="price-desc" ${filters.sort === 'price-desc' ? 'selected' : ''}>Price: high to low</option>
            <option value="rating" ${filters.sort === 'rating' ? 'selected' : ''}>Top rated</option>
            <option value="fast" ${filters.sort === 'fast' ? 'selected' : ''}>Fastest</option>
          </select></div>
        <div class="f"><label class="small muted">Category</label><div class="chips" id="cats">${cats}</div></div>
      </div>

      <div id="grid" class="grid"></div>`);
  }

  function filtered() {
    const q = filters.q.trim().toLowerCase();
    let out = db.products.filter(p =>
      p.price <= filters.max &&
      (filters.cat === 'All' || p.cat === filters.cat) &&
      (!q || (p.name + ' ' + p.desc + ' ' + p.cat).toLowerCase().includes(q)));
    const by = {
      'popular': (a, b) => b.rating - a.rating,
      'rating': (a, b) => b.rating - a.rating,
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      'fast': (a, b) => a.time - b.time
    }[filters.sort];
    return out.sort(by);
  }

  function paintGrid() {
    const g = $('#grid'); if (!g) return;
    const list = filtered();
    if (!list.length) { g.innerHTML = `<p class="empty" style="grid-column:1/-1">No dishes match those filters. Try widening the price range.</p>`; return; }
    g.innerHTML = list.map(p => `
      <article class="card food ${p.available ? '' : 'sold'}">
        <div class="thumb">
          ${p.emoji}
          <span class="pill time">${p.time} min</span>
          <span class="rate">★ ${p.rating.toFixed(1)}</span>
          ${p.available ? '' : '<span class="sold-out">Sold out</span>'}
        </div>
        <div class="body">
          <div class="name">${esc(p.name)}</div>
          <div class="desc">${esc(p.desc)}</div>
          <div class="between">
            <span class="price">${money(p.price)}</span>
            <button class="btn sm" data-act="add" data-id="${p.id}" ${p.available ? '' : 'disabled'}>
              ${p.available ? '+ Add' : 'Unavailable'}
            </button>
          </div>
        </div>
      </article>`).join('');
  }

  /* ---------- cart ---------- */
  function viewCart() {
    const lines = cartLines();
    if (!lines.length) {
      return layout(`
        <h1>Your cart</h1>
        <div class="card empty" style="margin-top:18px">
          <p style="font-size:40px;margin-bottom:10px">🛒</p>
          <p>Your cart is empty.</p>
          <a class="btn" href="#/shop" style="margin-top:16px">Browse the menu</a>
        </div>`);
    }
    const sub = cartSub(), total = sub + FEE;
    const rows = lines.map(l => `
      <div class="line">
        <span class="ico">${l.p.emoji}</span>
        <span>
          <div style="font-weight:700">${esc(l.p.name)}</div>
          <div class="small muted">${money(l.p.price)} each · ${l.p.time} min</div>
        </span>
        <span class="qty">
          <button data-act="dec" data-id="${l.p.id}" aria-label="Decrease">−</button>
          <span>${l.q}</span>
          <button data-act="inc" data-id="${l.p.id}" aria-label="Increase">+</button>
        </span>
        <span class="lnprice" style="font-weight:700;min-width:70px;text-align:right">${money(l.p.price * l.q)}</span>
        <button class="btn danger sm" data-act="remove" data-id="${l.p.id}">Remove</button>
      </div>`).join('');

    return layout(`
      <div class="between" style="margin-bottom:18px">
        <h1>Your cart <span class="muted" style="font-weight:400;font-size:16px">· ${cartCount()} item${cartCount() === 1 ? '' : 's'}</span></h1>
        <a class="btn ghost sm" href="#/shop">← Keep shopping</a>
      </div>
      <div class="split">
        <div>
          <div class="card lines">${rows}</div>
        </div>
        <div class="card summary">
          <h3 style="margin-bottom:10px">Order summary</h3>
          <div class="sumrow"><span class="muted">Subtotal</span><span>${money(sub)}</span></div>
          <div class="sumrow"><span class="muted">Delivery fee</span><span>${money(FEE)}</span></div>
          <div class="sumrow total"><span>Total</span><span>${money(total)}</span></div>
          <form id="checkoutForm" style="margin-top:16px">
            <div class="field"><label for="addr">Delivery address</label>
              <input class="input" id="addr" name="address" placeholder="Street, number, city" required></div>
            <div class="field"><label for="note">Note to the kitchen <span class="muted">(optional)</span></label>
              <input class="input" id="note" name="note" placeholder="Extra spicy, no onions…"></div>
            <p class="error" id="cerr" hidden></p>
            <button class="btn block" type="submit">Place order · ${money(total)}</button>
          </form>
          <p class="help" style="margin-top:10px">Payment is simulated. Nothing is charged.</p>
        </div>
      </div>`);
  }

  function placeOrder(form) {
    const el = form.elements;
    const address = el.address.value.trim(), note = el.note.value.trim();
    if (address.length < 5) { const e = $('#cerr'); e.textContent = 'Please enter a full delivery address.'; e.hidden = false; return; }
    const lines = cartLines();
    if (!lines.length) return;
    const order = {
      id: uid('ORD-'), userId: db.session, placedAt: Date.now(),
      items: lines.map(l => ({ id: l.p.id, name: l.p.name, emoji: l.p.emoji, price: l.p.price, qty: l.q })),
      subtotal: round(cartSub(), 2), fee: FEE, total: round(cartSub() + FEE, 2),
      address, note, etaMins: 22 + Math.floor(Math.random() * 14),
      driver: pick(db.drivers), instructions: '', cancelled: false
    };
    db.orders.push(order);
    db.carts[db.session] = {};
    save();
    toast('Order placed — tracking your rider');
    location.hash = '#/track/' + order.id;
  }

  /* ---------- orders ---------- */
  function viewOrders() {
    const list = myOrders();
    if (!list.length) {
      return layout(`
        <h1>Orders</h1>
        <div class="card empty" style="margin-top:18px">
          <p style="font-size:40px;margin-bottom:10px">🧾</p>
          <p>No orders yet.</p>
          <a class="btn" href="#/shop" style="margin-top:16px">Order something</a>
        </div>`);
    }
    return layout(`
      <h1 style="margin-bottom:18px">Orders</h1>
      <div id="orderList">${list.map(orderCard).join('')}</div>`);
  }

  function orderCard(o) {
    const s = state(o);
    const meta = { confirmed: '', prep: '', onway: 'info', delivered: 'ok', cancelled: 'red' }[s.key];
    return `
      <article class="card order-card" data-order="${o.id}">
        <div class="between wrap">
          <div>
            <div class="row"><h3>${o.id}</h3><span class="pill ${meta}" data-status>${s.label}</span></div>
            <p class="small muted" style="margin-top:4px">${when(o.placedAt)} · ${o.items.length} item(s) · ${money(o.total)}</p>
          </div>
          <div class="row">
            ${s.key === 'delivered' || s.key === 'cancelled' ? '' : `<button class="btn ghost sm" data-act="cancel" data-id="${o.id}">Cancel</button>`}
            <a class="btn sm" href="#/track/${o.id}">${s.key === 'delivered' ? 'View receipt' : 'Track order'}</a>
          </div>
        </div>
        <div class="bar" style="margin:14px 0 8px"><i data-bar style="width:${Math.round(s.progress * 100)}%"></i></div>
        <div class="between small">
          <span class="muted">${esc(o.address)}</span>
          <span class="muted" data-eta>${s.key === 'delivered' ? 'Delivered' : s.key === 'cancelled' ? '—' : 'ETA ' + clock(s.remaining)}</span>
        </div>
      </article>`;
  }

  /* ---------- live tracking ---------- */
  function viewTrack(id) {
    const o = db.orders.find(x => x.id === id && x.userId === db.session);
    if (!o) return layout(`<div class="card empty">Order not found. <a href="#/orders" style="color:var(--accent);font-weight:600">Back to orders</a></div>`);
    const d = o.driver;
    const tiles = (() => {
      let h = '';
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        h += `<img src="https://tile.openstreetmap.org/${TILE.z}/${TILE.x + dx}/${TILE.y + dy}.png" alt="" referrerpolicy="no-referrer">`;
      return h;
    })();

    return layout(`
      <a class="small muted" href="#/orders" style="display:inline-block;margin-bottom:14px">← All orders</a>
      <div class="track-wrap">
        <div>
          <div class="map" id="map">
            <div class="tiles" id="tiles">${tiles}</div>
            <div class="wash"></div>
            <svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path class="trail" d="${routeD()}" vector-effect="non-scaling-stroke"></path>
              <path class="path" d="${routeD()}" vector-effect="non-scaling-stroke"></path>
            </svg>
            <div class="pin" style="left:${ROUTE[0][0]}%;top:${ROUTE[0][1]}%">🍽️<small>Kitchen</small></div>
            <div class="pin" style="left:${ROUTE.at(-1)[0]}%;top:${ROUTE.at(-1)[1]}%">🏠<small>You</small></div>
            <div class="courier" id="courier" style="left:${ROUTE[0][0]}%;top:${ROUTE[0][1]}%">🛵</div>
            <div class="bubble" id="bubble">Arriving in <b id="bubbleEta">--:--</b></div>
            <span class="attrib">© OpenStreetMap</span>
          </div>
          <div class="card box" style="margin-top:14px;padding:16px">
            <div class="between" style="margin-bottom:10px">
              <h3>Order progress</h3><span class="pill ${state(o).key === 'delivered' ? 'ok' : state(o).key === 'cancelled' ? 'red' : 'info'}" id="trackStatus">${state(o).label}</span>
            </div>
            <div class="steps">${STEPS.map((s, i) => `<div class="step ${i < state(o).idx ? 'done' : i === state(o).idx ? 'now' : ''}" data-step="${i}"><span class="dot"></span>${s}</div>`).join('')}</div>
          </div>
        </div>

        <aside class="panel">
          <div class="card box">
            <div class="between"><span class="live"><i></i>LIVE</span><span class="small muted">${o.etaMins} min estimate</span></div>
            <div class="row" style="align-items:flex-end;gap:10px;margin-top:8px">
              <span class="eta" id="etaBig">--:--</span><span class="muted small" style="padding-bottom:6px">remaining</span>
            </div>
            <p class="help" style="margin-top:6px">Rider moves in real time. Demo runs at ${SPEED}× speed.</p>
          </div>

          <div class="card box">
            <h3 style="margin-bottom:12px">Your delivery partner</h3>
            <div class="driver">
              <span class="av">${d.emoji}</span>
              <div class="spacer">
                <div style="font-weight:700">${esc(d.name)}</div>
                <div class="small muted">★ ${d.rating.toFixed(1)} · ${esc(d.vehicle)}</div>
              </div>
            </div>
            <div class="row" style="margin-top:14px">
              <a class="btn sm" href="tel:${d.phone.replace(/\s/g, '')}" style="flex:1">📞 Call</a>
              <button class="btn ghost sm" data-act="msg" data-id="${o.id}" style="flex:1">💬 Message</button>
            </div>
            <p class="small muted" style="margin-top:10px">${esc(d.phone)}</p>
          </div>

          <div class="card box">
            <h3 style="margin-bottom:8px">Delivery instructions</h3>
            <form id="instrForm">
              <textarea name="instructions" placeholder="Where should we leave it? Gate code, floor, buzzer…">${esc(o.instructions)}</textarea>
              <div class="quick">${QUICK.map(q => `<button type="button" data-act="quick" data-text="${esc(q)}">${esc(q)}</button>`).join('')}</div>
              <button class="btn block" type="submit" style="margin-top:12px">Save instructions</button>
            </form>
          </div>

          <div class="card box">
            <h3 style="margin-bottom:10px">Delivering to</h3>
            <p class="small">${esc(o.address)}</p>
            ${o.note ? `<p class="small muted" style="margin-top:8px">Kitchen note: ${esc(o.note)}</p>` : ''}
            <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
            ${o.items.map(i => `<div class="between small" style="padding:3px 0"><span>${i.emoji} ${esc(i.name)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
            <div class="between" style="margin-top:10px;font-weight:800"><span>Total paid</span><span>${money(o.total)}</span></div>
          </div>
        </aside>
      </div>`);
  }

  function paintTrack() {
    const o = db.orders.find(x => x.id === route[1]);
    if (!o || !$('#courier')) return;
    const s = state(o);
    const [x, y] = pointAt(s.progress);

    const cur = $('#courier'); cur.style.left = x + '%'; cur.style.top = y + '%';
    cur.style.display = s.key === 'cancelled' || s.key === 'delivered' ? (s.key === 'delivered' ? 'grid' : 'none') : 'grid';
    cur.textContent = s.key === 'delivered' ? '✅' : '🛵';

    const b = $('#bubble');
    b.style.left = clamp(x, 18, 82) + '%'; b.style.top = y + '%';
    $('#bubbleEta').textContent = clock(s.remaining);
    b.style.display = s.key === 'cancelled' ? 'none' : 'block';
    if (s.key === 'delivered') $('#bubble').innerHTML = 'Delivered 🎉';

    const big = $('#etaBig');
    big.textContent = s.key === 'delivered' ? 'Arrived' : s.key === 'cancelled' ? 'Cancelled' : clock(s.remaining);

    const st = $('#trackStatus');
    if (st) {
      st.textContent = s.label;
      st.className = 'pill ' + pill(s.key);
    }
    document.querySelectorAll('[data-step]').forEach(el => {
      const i = +el.dataset.step;
      el.className = 'step ' + (s.key === 'delivered' ? 'done' : i < s.idx ? 'done' : i === s.idx ? 'now' : '');
    });
  }

  /* ---------- products management ---------- */
  function viewProducts() {
    const edit = db.products.find(p => p.id === editingId);
    const rows = db.products.map(p => `
      <tr>
        <td style="width:44px"><span class="ico" style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-size:19px;background:linear-gradient(135deg,#fff4ec,#ffe8d6)">${p.emoji}</span></td>
        <td><div style="font-weight:600">${esc(p.name)}</div><div class="small muted">${esc(p.desc)}</div></td>
        <td><span class="catdot"></span>${esc(p.cat)}</td>
        <td>${money(p.price)}</td>
        <td class="small muted">${p.time} min · ★ ${p.rating.toFixed(1)}</td>
        <td><span class="pill ${p.available ? 'ok' : 'grey'}">${p.available ? 'Available' : 'Sold out'}</span></td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn ghost sm" data-act="edit" data-id="${p.id}">Edit</button>
          <button class="btn ghost sm" data-act="toggle" data-id="${p.id}">${p.available ? 'Hide' : 'Show'}</button>
          <button class="btn danger sm" data-act="delete" data-id="${p.id}">Delete</button>
        </td>
      </tr>`).join('');

    return layout(`
      <div class="between wrap" style="margin-bottom:18px">
        <div>
          <h1>Products</h1>
          <p class="muted small" style="margin-top:4px">${db.products.length} dishes · ${db.products.filter(p => !p.available).length} hidden</p>
        </div>
        ${editingId ? '<button class="btn ghost sm" data-act="new">Cancel edit</button>' : ''}
      </div>

      <div class="card" style="padding:18px;margin-bottom:20px">
        <h3 style="margin-bottom:14px">${edit ? 'Edit “' + esc(edit.name) + '”' : 'Add a dish'}</h3>
        <form id="productForm">
          <div class="formgrid">
            <div class="field"><label for="pname">Name</label><input class="input" id="pname" name="name" value="${edit ? esc(edit.name) : ''}" required></div>
            <div class="field"><label for="pcat">Category</label><input class="input" id="pcat" name="cat" list="cats-list" value="${edit ? esc(edit.cat) : ''}" required>
              <datalist id="cats-list">${CATS().filter(c => c !== 'All').map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
            <div class="field"><label for="pprice">Price ($)</label><input class="input" id="pprice" name="price" type="number" min="0.5" step="0.1" value="${edit ? edit.price : ''}" required></div>
            <div class="field"><label for="pemoji">Icon</label><input class="input" id="pemoji" name="emoji" maxlength="4" value="${edit ? esc(edit.emoji) : '🍽️'}"></div>
            <div class="field"><label for="ptime">Prep time (min)</label><input class="input" id="ptime" name="time" type="number" min="1" step="1" value="${edit ? edit.time : 15}" required></div>
            <div class="field"><label for="prating">Rating</label><input class="input" id="prating" name="rating" type="number" min="1" max="5" step="0.1" value="${edit ? edit.rating : 4.5}" required></div>
          </div>
          <div class="field"><label for="pdesc">Description</label><input class="input" id="pdesc" name="desc" value="${edit ? esc(edit.desc) : ''}" required></div>
          <button class="btn" type="submit">${edit ? 'Save changes' : 'Add dish'}</button>
        </form>
      </div>

      <div class="card" style="overflow-x:auto">
        <table class="table">
          <thead><tr><th></th><th>Dish</th><th>Category</th><th>Price</th><th>Details</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  }

  function saveProduct(form) {
    const f = form.elements;    const data = {
      name: f.name.value.trim(), cat: f.cat.value.trim(), desc: f.desc.value.trim(),
      price: Math.max(0.5, +f.price.value || 0), time: Math.max(1, +f.time.value || 1),
      rating: clamp(+f.rating.value || 4.5, 1, 5), emoji: f.emoji.value.trim() || '🍽️'
    };
    if (!data.name || !data.cat || !data.desc) return;
    const edit = db.products.find(p => p.id === editingId);
    if (edit) Object.assign(edit, data); else db.products.push({ id: uid('p'), available: true, ...data });
    editingId = null; save(); router();
    toast(edit ? 'Dish updated' : 'Dish added to the menu');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const { act, id } = el.dataset;
    if (act === 'noop') return;
    e.preventDefault();

    if (act === 'logout') { db.session = null; save(); toast('Logged out'); location.hash = '#/login'; router(); return; }
    if (act === 'fill-demo') { $('#lemail').value = 'demo@forkly.app'; $('#lpass').value = 'demo123'; return; }

    if (act === 'cat') { filters.cat = el.dataset.cat; document.querySelectorAll('#cats .chip').forEach(c => c.classList.toggle('active', c.dataset.cat === filters.cat)); paintGrid(); return; }

    if (act === 'add') {
      const c = cart(); c[id] = (c[id] || 0) + 1; save();
      toast('Added to cart'); router(); return;
    }
    if (act === 'inc' || act === 'dec' || act === 'remove') {
      const c = cart(), q = c[id] || 0;
      const next = act === 'inc' ? q + 1 : act === 'dec' ? q - 1 : 0;
      if (next <= 0) delete c[id]; else c[id] = next;
      save(); router();
      if (act === 'remove') toast('Removed from cart');
      return;
    }

    if (act === 'cancel') {
      const o = db.orders.find(x => x.id === id);
      if (o && !o.cancelled && state(o).key !== 'delivered') { o.cancelled = true; save(); router(); toast('Order cancelled'); }
      return;
    }
    if (act === 'msg') { toast('Message sent to your rider'); return; }
    if (act === 'quick') { const t = $('#instrForm [name=instructions]'); t.value = t.value ? t.value.replace(/[.\s]*$/, '') + '. ' + el.dataset.text : el.dataset.text; t.focus(); return; }

    if (act === 'edit') { editingId = id; router(); return; }
    if (act === 'new') { editingId = null; router(); return; }
    if (act === 'toggle') { const p = db.products.find(x => x.id === id); if (p) { p.available = !p.available; save(); router(); } return; }
    if (act === 'delete') {
      const p = db.products.find(x => x.id === id);
      if (p && confirm(`Delete “${p.name}” from the menu?`)) {
        db.products = db.products.filter(x => x.id !== id);
        Object.values(db.carts).forEach(c => delete c[id]);  // drop it from every cart too
        if (editingId === id) editingId = null;
        save(); router(); toast('Dish deleted');
      }
      return;
    }
  });

  document.addEventListener('submit', e => {
    const f = e.target;
    e.preventDefault();

    if (f.id === 'loginForm') {
      const el = f.elements;
      const email = el.email.value.trim().toLowerCase(), pass = el.password.value;
      const u = db.users.find(x => x.email.toLowerCase() === email && x.password === pass);
      const box = $('#lerr');
      if (!u) { box.textContent = 'Wrong email or password. Try the demo account.'; box.hidden = false; return; }
      db.session = u.id; save(); toast('Welcome back, ' + u.name.split(' ')[0]); location.hash = '#/shop'; router(); return;
    }

    if (f.id === 'signupForm') {
      const el = f.elements;
      const name = el.name.value.trim(), email = el.email.value.trim(), pass = el.password.value;
      const box = $('#serr');
      const bad = !name ? 'Please enter your name.' : !/^\S+@\S+\.\S+$/.test(email) ? 'Please enter a valid email address.' : pass.length < 6 ? 'Password needs at least 6 characters.' : db.users.some(x => x.email.toLowerCase() === email.toLowerCase()) ? 'That email is already registered.' : '';
      if (bad) { box.textContent = bad; box.hidden = false; return; }
      const u = { id: uid('u'), name, email, password: pass };
      db.users.push(u); db.session = u.id; save(); toast('Account created'); location.hash = '#/shop'; router(); return;
    }

    if (f.id === 'checkoutForm') { placeOrder(f); return; }
    if (f.id === 'productForm') { saveProduct(f); return; }
    if (f.id === 'instrForm') {
      const o = db.orders.find(x => x.id === route[1]);
      if (o) { o.instructions = f.elements.instructions.value.trim(); save(); toast('Instructions sent to ' + o.driver.name.split(' ')[0]); }
      return;
    }
  });

  /* filter inputs repaint only the grid, so typing keeps focus */
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'q') { filters.q = t.value; paintGrid(); }
    else if (t.id === 'maxp') { filters.max = +t.value; $('#maxpv').textContent = money(filters.max); paintGrid(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'sort') { filters.sort = e.target.value; paintGrid(); }
  });

  /* ---------- clock ---------- */
  setInterval(() => {
    ticked++;
    if (route[0] === 'track') paintTrack();
    else if (route[0] === 'orders' && ticked % 3 === 0) {
      myOrders().forEach(o => {
        const card = document.querySelector(`[data-order="${o.id}"]`); if (!card) return;
        const s = state(o);
        const bar = card.querySelector('[data-bar]'); if (bar) bar.style.width = Math.round(s.progress * 100) + '%';
        const eta = card.querySelector('[data-eta]');
        if (eta) eta.textContent = s.key === 'delivered' ? 'Delivered' : s.key === 'cancelled' ? '—' : 'ETA ' + clock(s.remaining);
        const st = card.querySelector('[data-status]');
        if (st) { st.textContent = s.label; st.className = 'pill ' + pill(s.key); }
      });
    }
  }, 1000);

  window.addEventListener('hashchange', router);
  router();
})();
