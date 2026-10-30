import test from 'node:test';
import assert from 'node:assert/strict';
import { decideNotification, isRelevantDeal } from './deal-evaluator';
import { parseAppDetails } from './steam.service';
import { buildDealMessage } from './telegram.service';

const filters = { minimumDiscount: 50, maximumPrice: 10_000 };
const price = (discountPercent: number, finalPrice: number) => ({
  originalPrice: 19_990,
  finalPrice,
  discountPercent,
  currency: 'BRL',
});

test('filtros: desconto e preço', () => {
  assert.equal(isRelevantDeal(price(50, 9_995), filters), true);
  assert.equal(isRelevantDeal(price(49, 9_995), filters), false);
  assert.equal(isRelevantDeal(price(60, 10_001), filters), false);
  assert.equal(isRelevantDeal(price(0, 5_000), { minimumDiscount: 0, maximumPrice: 0 }), false);
  assert.equal(isRelevantDeal(price(60, 99_999), { minimumDiscount: 50, maximumPrice: 0 }), true);
});

test('anti-duplicidade: notifica uma vez, de novo só se o preço cair', () => {
  assert.equal(decideNotification(true, 9_995, null), 'notify');
  assert.equal(decideNotification(true, 9_995, 9_995), 'none');
  assert.equal(decideNotification(true, 9_995, 8_000), 'none');
  assert.equal(decideNotification(true, 7_000, 9_995), 'notify');
});

test('promoção que termina e volta é notificada novamente', () => {
  assert.equal(decideNotification(false, 19_990, 9_995), 'reset');
  assert.equal(decideNotification(false, 19_990, null), 'none');
  assert.equal(decideNotification(true, 9_995, null), 'notify');
});

test('parse da Steam: preço válido', () => {
  const info = parseAppDetails(1, {
    '1': { success: true, data: { name: 'Jogo', is_free: false, price_overview: { currency: 'BRL', initial: 19990, final: 9995, discount_percent: 50 } } },
  });
  assert.equal(info.name, 'Jogo');
  assert.deepEqual(info.price, { originalPrice: 19990, finalPrice: 9995, discountPercent: 50, currency: 'BRL' });
});

test('parse da Steam: sem preço, gratuito e inválidos', () => {
  assert.equal(parseAppDetails(1, { '1': { success: true, data: { name: 'Free', is_free: true } } }).price, null);
  assert.throws(() => parseAppDetails(1, { '1': { success: false } }), /indispon/);
  assert.throws(() => parseAppDetails(1, { '1': { success: true, data: [] } }), /incompletos/);
  assert.throws(() => parseAppDetails(1, null), /não é um objeto/);
  assert.throws(() => parseAppDetails(1, {}), /sem dados/);
  assert.throws(
    () => parseAppDetails(1, { '1': { success: true, data: { name: 'X', price_overview: { currency: 'BRL', initial: 'a' } } } }),
    /formato inesperado/,
  );
});

test('mensagem do Telegram escapa HTML e inclui link', () => {
  const msg = buildDealMessage({ appId: 1245620, name: 'A & <B>', price: price(50, 9_995) });
  assert.match(msg, /A &amp; &lt;B&gt;/);
  assert.match(msg, /-50%/);
  assert.match(msg, /R\$ 99,95/);
  assert.match(msg, /store\.steampowered\.com\/app\/1245620/);
});
