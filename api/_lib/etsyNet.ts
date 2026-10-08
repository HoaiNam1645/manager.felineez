// Estimate the ACTUAL per-order earnings ("You earned" in Etsy's shop panel).
//
// The Sold Orders CSV's "Order Net" only subtracts the card processing fee.
// Etsy additionally charges (verified cent-exact against the shop's Earnings
// panel on two real orders):
//   - Transaction fee   6.5% × (items after discount + shipping)
//   - Processing fee    VN shops: 4.5% × buyer-paid total + 9,500₫
//   - Regulatory fee    VN shops: 1.25% × (items after discount + shipping)
//   - VAT               VN shops: 10% on each fee
//   - Buyer tax is withheld by Etsy (observed quirk: withheld = tax − $0.08)
//
// VND-shop detection: the CSV's cardFees/orderNet columns are in the SHOP's
// currency; for VND shops Etsy exports them as VND/100, which makes
// orderNet > orderTotal — impossible for USD shops.

export interface EstNetInput {
  orderValue: number;       // item price before discount (USD)
  discount: number;
  shipping: number;
  shippingDiscount: number;
  csvTax: number;           // CSV "Sales Tax" (0 for VN shops)
  emailTax: number;         // tax parsed from the sale email (real buyer tax)
  orderTotal: number;       // buyer paid, incl. tax for VN shops
  cardFees: number;         // raw CSV value (VND/100 for VN shops, USD otherwise)
  orderNet: number;         // raw CSV value (VND/100 for VN shops, USD otherwise)
}

export interface EstNetResult {
  shopCurrency: 'VND' | 'USD';
  exchangeRate: number | null;   // VND per USD (VN shops only)
  cardFeesUsd: number;           // processing fee in USD
  orderNetUsd: number;           // CSV-style net (total − tax − processing) in USD
  estBreakdown: {
    taxWithheld: number;
    transactionFee: number;
    processingFee: number;
    regulatoryFee: number;
    vat: number;
  };
  estActualNet: number;          // ≈ Etsy "You earned"
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function computeEstActualNet(input: EstNetInput): EstNetResult {
  const {
    orderValue, discount, shipping, shippingDiscount,
    csvTax, emailTax, orderTotal, cardFees, orderNet,
  } = input;

  const isVnd = orderNet > orderTotal && orderTotal > 0;
  const buyerPaid = orderTotal;
  const taxBuyer = csvTax > 0 ? csvTax : emailTax;
  const itemAfterDiscount = Math.max(orderValue - discount, 0);
  const shipNet = Math.max(shipping - shippingDiscount, 0);
  const feeBase = itemAfterDiscount + shipNet;

  // Etsy withholds the buyer tax it collected ($0.08 constant quirk observed).
  const taxWithheld = taxBuyer > 0 ? r2(Math.max(taxBuyer - 0.08, 0)) : 0;

  const transactionFee = r2(0.065 * feeBase);

  if (isVnd) {
    // Exchange rate implied by the CSV itself: fees+net (×100 → VND) ≈ buyerPaid in VND.
    const rate = buyerPaid > 0 ? ((cardFees + orderNet) * 100) / buyerPaid : 25000;
    const processingFee = r2(0.045 * buyerPaid + 9500 / rate);
    const regulatoryFee = r2(0.0125 * feeBase);
    const vat = r2(0.10 * (transactionFee + processingFee + regulatoryFee));
    const estActualNet = r2(buyerPaid - taxWithheld - transactionFee - processingFee - regulatoryFee - vat);
    return {
      shopCurrency: 'VND',
      exchangeRate: Math.round(rate),
      cardFeesUsd: processingFee,
      orderNetUsd: r2(buyerPaid - taxWithheld - processingFee),
      estBreakdown: { taxWithheld, transactionFee, processingFee, regulatoryFee, vat },
      estActualNet,
    };
  }

  // USD shop: CSV values are already USD; no VN regulatory fee / VAT.
  const processingFee = r2(cardFees);
  const estActualNet = r2(buyerPaid - taxWithheld - processingFee - transactionFee);
  return {
    shopCurrency: 'USD',
    exchangeRate: null,
    cardFeesUsd: processingFee,
    orderNetUsd: r2(orderNet),
    estBreakdown: { taxWithheld, transactionFee, processingFee, regulatoryFee: 0, vat: 0 },
    estActualNet,
  };
}

/** Enrich a stored etsyFees JSON blob with normalized + estimated fields. */
export function enrichEtsyFees(fees: any, emailTax: number): any {
  const n = (v: unknown) => {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return isNaN(x) ? 0 : x;
  };
  const result = computeEstActualNet({
    orderValue: n(fees.orderValue),
    discount: n(fees.discount),
    shipping: n(fees.shipping),
    shippingDiscount: n(fees.shippingDiscount),
    csvTax: n(fees.tax),
    emailTax: n(emailTax),
    orderTotal: n(fees.orderTotal),
    cardFees: n(fees.cardFees),
    orderNet: n(fees.orderNet),
  });
  return {
    ...fees,
    shopCurrency: result.shopCurrency,
    exchangeRate: result.exchangeRate,
    cardFeesUsd: result.cardFeesUsd,
    orderNetUsd: result.orderNetUsd,
    estBreakdown: result.estBreakdown,
    estActualNet: result.estActualNet,
  };
}

/** Extract the buyer tax from a record's parsed email details (financials.tax). */
export function emailTaxOf(details: any): number {
  const t = details?.financials?.tax;
  const x = typeof t === 'number' ? t : parseFloat(String(t ?? ''));
  return isNaN(x) ? 0 : x;
}
