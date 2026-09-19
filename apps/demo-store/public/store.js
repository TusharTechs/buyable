/**
 * Fixture store behaviour.
 *
 * Deliberately plain: no framework, no build step, no bundler. A patch produced by
 * Buyable has to be legible to a human reviewer in a pull request, and that is far
 * easier to demonstrate against source that looks like the page it renders.
 *
 * State lives in sessionStorage so each browser session starts with an empty basket,
 * which matters because every persona run gets an isolated AgentCore session.
 */
var Store = (function () {
  var CATALOGUE = {
    harrier: {
      id: 'harrier',
      name: 'Harrier Trail',
      price: 89.0,
      blurb: 'A cushioned trail shoe for long distances on mixed ground. Cobalt blue.',
      swatch: '',
      alt: 'Harrier Trail shoe in cobalt blue'
    },
    fellrunner: {
      id: 'fellrunner',
      name: 'Fellrunner Lite',
      price: 74.0,
      blurb: 'A light, low-drop shoe for fast days on the fells. Slate grey.',
      swatch: 'slate',
      alt: 'Fellrunner Lite shoe in slate grey'
    },
    moorland: {
      id: 'moorland',
      name: 'Moorland Road',
      price: 96.0,
      blurb: 'A road shoe with a firm ride and a wide toe box. Moss green.',
      swatch: 'moss',
      alt: 'Moorland Road shoe in moss green'
    }
  };

  var KEY = 'northbound.basket';
  var ORDER_KEY = 'northbound.order';

  function money(n) {
    return '£' + n.toFixed(2);
  }

  function productId() {
    var params = new URLSearchParams(location.search);
    return params.get('id') || 'harrier';
  }

  function currentProduct() {
    return CATALOGUE[productId()] || CATALOGUE.harrier;
  }

  function readBasket() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function writeBasket(items) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(items));
    } catch (e) {
      /* Private mode. The page still works, the basket just does not persist. */
    }
  }

  function hydrateProduct() {
    var p = currentProduct();
    document.title = p.name + ' · Northbound Running';
    var set = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    set('crumb', p.name);
    set('product-name', p.name);
    set('product-price', money(p.price));
    set('product-blurb', p.blurb);
    var img = document.getElementById('product-image');
    if (img) {
      img.className = 'swatch' + (p.swatch ? ' ' + p.swatch : '');
      img.setAttribute('aria-label', p.alt);
    }
  }

  function addToBasket(size) {
    var p = currentProduct();
    var items = readBasket();
    items.push({ id: p.id, name: p.name, price: p.price, size: String(size) });
    writeBasket(items);
  }

  function renderBasket() {
    var items = readBasket();
    var rows = document.getElementById('basket-rows');
    var empty = document.getElementById('basket-empty');
    var table = document.getElementById('basket-table');
    var cta = document.getElementById('to-checkout');
    if (!rows) return;

    rows.innerHTML = '';
    items.forEach(function (item) {
      var tr = document.createElement('tr');
      var name = document.createElement('td');
      name.textContent = item.name;
      var size = document.createElement('td');
      size.textContent = 'UK ' + item.size;
      var price = document.createElement('td');
      price.className = 'num';
      price.textContent = money(item.price);
      tr.appendChild(name);
      tr.appendChild(size);
      tr.appendChild(price);
      rows.appendChild(tr);
    });

    var isEmpty = items.length === 0;
    if (empty) empty.hidden = !isEmpty;
    if (table) table.hidden = isEmpty;
    if (cta) cta.hidden = isEmpty;
  }

  function total() {
    return readBasket().reduce(function (sum, item) {
      return sum + item.price;
    }, 0);
  }

  function renderSummary() {
    var items = readBasket();
    var dl = document.getElementById('summary-lines');
    var totalEl = document.getElementById('summary-total');
    if (!dl) return;

    dl.innerHTML = '';
    items.forEach(function (item) {
      var dt = document.createElement('dt');
      dt.textContent = item.name + ', UK ' + item.size;
      var dd = document.createElement('dd');
      dd.textContent = money(item.price);
      dl.appendChild(dt);
      dl.appendChild(dd);
    });

    var dtShip = document.createElement('dt');
    dtShip.textContent = 'Delivery';
    var ddShip = document.createElement('dd');
    ddShip.textContent = 'Free';
    dl.appendChild(dtShip);
    dl.appendChild(ddShip);

    if (totalEl) totalEl.textContent = 'Total ' + money(total());
  }

  function placeOrder() {
    var items = readBasket();
    if (items.length === 0) {
      var status = document.getElementById('pay-status');
      if (status) status.textContent = 'Your basket is empty.';
      return;
    }
    var order = {
      number: 'NB-' + String(Math.floor(100000 + Math.random() * 899999)),
      items: items,
      total: total()
    };
    try {
      sessionStorage.setItem(ORDER_KEY, JSON.stringify(order));
      sessionStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
    location.href = 'confirmation.html';
  }

  function renderConfirmation() {
    var order;
    try {
      order = JSON.parse(sessionStorage.getItem(ORDER_KEY) || 'null');
    } catch (e) {
      order = null;
    }
    if (!order) return;
    var numberEl = document.getElementById('order-number');
    if (numberEl) numberEl.textContent = order.number;
    var detail = document.getElementById('order-detail');
    if (detail) {
      detail.textContent =
        order.items
          .map(function (i) {
            return i.name + ' (UK ' + i.size + ')';
          })
          .join(', ') +
        ', ' +
        money(order.total);
    }
  }

  return {
    hydrateProduct: hydrateProduct,
    currentProduct: currentProduct,
    addToBasket: addToBasket,
    renderBasket: renderBasket,
    renderSummary: renderSummary,
    placeOrder: placeOrder,
    renderConfirmation: renderConfirmation
  };
})();
