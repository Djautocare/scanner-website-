// Supplied InventoryOS product-family illustrations. Variant labels use live catalogue data.
export const illustrations=Object.freeze({
  "ps-hw38-handy-wrap-dispenser": "01_handheld_stretch_wrap_dispenser.webp",
  "ps-heavy-duty-bench-desktop-tape-dispenser": "02_desktop_tape_dispenser.webp",
  "ps-pro-series-pacplus-tape-gun-dispenser-robust-pistol-grip-heavy-duty-parcel-seal-packaging-": "03_packing_tape_gun.webp",
  "ps-jiffy-mono-bubbles-small-bubble-wrap-10mm": "04_small_bubble_wrap.webp",
  "ps-large-bubble-wrap": "05_large_bubble_wrap.webp",
  "ps-small-bubble-wrap": "04_small_bubble_wrap.webp",
  "ps-bubble-pouches": "06_bubble_wrap_pouches.webp",
  "ps-mini-handy-pallet-wrap-100mm-x-150m": "07_mini_pallet_wrap.webp",
  "ps-clear-pallet-wrap": "08_clear_pallet_wrap.webp",
  "ps-black-pallet-wrap": "09_black_pallet_wrap.webp",
  "ps-a4-sheet-labels": "10_a4_adhesive_labels.webp",
  "ps-warning-labels": "11_warning_labels.webp",
  "ps-fanfold-thermal-label-4x6-100-x-150mm": "12_fanfold_thermal_labels.webp",
  "ps-masking-tape-pack-of-6": "14_masking_tape.webp",
  "ps-thermal-labels-on-rolls": "13_thermal_label_rolls.webp",
  "ps-duct-tape-48mm-x-50m": "15_duct_tape.webp",
  "ps-kraft-paper-tape-pack-of-6": "16_kraft_paper_tape.webp",
  "ps-fragile-tape-pack-of-6": "17_fragile_tape.webp",
  "ps-brown-tape-pack-of-6": "18_brown_packing_tape.webp",
  "ps-clear-tape-pack-of-6": "19_clear_packing_tape.webp",
  "ps-crash-lock-boxes": "20_crash_lock_cardboard_boxes.webp",
  "ps-070502-die-cut-boxes-brown-pack-of-50": "21_die_cut_cardboard_boxes.webp",
  "ps-royal-mail-pip-large-letter-boxes-pack-of-50": "22_large_letter_postal_boxes.webp",
  "ps-double-wall-boxes": "23_double_wall_cardboard_boxes.webp",
  "ps-single-wall-boxes": "24_single_wall_cardboard_boxes.webp",
  "ps-grey-mailing-bags-pack-of-100": "25_grey_mailing_bags.webp",
  "ps-colour-mailing-bags": "26_coloured_mailing_bags.webp"
});
export const illustrationRights='Account owner supplied AI-generated product-family illustration; illustrative only, not a photograph of a specific variant.';
const base='https://inventoryos.co.uk/assets/shop-illustrations/';
export function productImage(product,variant){
 const src=variant?.image||product.image_url||(illustrations[product.id]?base+illustrations[product.id]:'');
 return {src,illustration:!!src&&(src.startsWith(base)||src.startsWith('/assets/shop-illustrations/'))};
}
export function variantAnnotation(variant){
 if(!variant)return '';
 return String(variant.name||'').replace(/\b1 boxes\b/g,'1 box').replace(/\b1 rolls\b/g,'1 roll');
}
