// ==UserScript==
// @name         kkday product backend submit
// @namespace    https://www.kkday.com/
// @version      2024-08-18
// @description  kkday product backend submit
// @author       You
// @match        https://www.kkday.com/zh-hk/product/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kkday.com
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @grant        none
// ==/UserScript==

var $ = jQuery.noConflict(true);

// *************************
var mock_submit = true;
// *************************
var csrf_token = ''; // check and update before running the script
var product_url = window.location.href; //'https://www.kkday.com/zh-hk/product/185742';
var pkg_keyword_pattern = /1折|\$1瘋搶/;
var retry_delay = 3_000; //ms
var date_choices = [
  '2024-09-26',
  '2024-09-30',
  '2024-09-23',
  '2024-09-19',
  '2024-09-16',
  '2024-09-09',
  '2024-09-02',
  '2024-09-06'
];
var quantity_choices = {
  'adult': 2,
  'child': 1,
  'senior': 0,
  'infant': 0
};

//---

var csrf_token_msg_logged = false;
function wait_for_csrf_token() {
  if (!window.csrf_token) {
    if (!csrf_token_msg_logged) {
      console.log('Please configure variable csrf_token.');
      console.log('e.g. csrf_token = \'9fbb1a9519c8c29792b51f69225f2aa1\';');
      csrf_token_msg_logged = true;
    }
    setTimeout(wait_for_csrf_token, 1000);
  } else {
    csrf_token = window.csrf_token;
    load_init_data();
  }
}

function load_init_data() {
  console.log('Getting product page: ' + product_url);
  $.ajax({
    method: 'GET',
    dataType: 'html',
    url: product_url
  }).done(function(html){
    console.log('Parsing product page');
    var lines = html.split(/\r?\n|\r|\n/g);

    var script_line = lines.filter(line => line.includes('__INIT_STATE__ '))[0];
    var from_pos = script_line.indexOf('{');
    var to_pos = script_line.lastIndexOf('}') + 1;
    var script_obj = JSON.parse(script_line.substring(from_pos, to_pos));

    var product_info = script_obj.state.product.prodInfo;
    var product_version = product_info.version;
    var from_date = product_info.sale_time.earliest_sale_time.date;
    var to_date = product_info.sale_time.latest_sale_time.date;

    var ga_line = lines.filter(line => line.includes('dataLayer.push'))[0];
    from_pos = ga_line.indexOf('{');
    to_pos = ga_line.lastIndexOf('}') + 1;
    var ga_obj = JSON.parse(ga_line.substring(from_pos, to_pos));
    var prod_mid = ga_obj.prod_mid;

    load_package_data(prod_mid, from_date, to_date, product_version);
  });
}

function load_package_data(prod_mid, from_date, to_date, product_version) {
  var package_url = 'https://www.kkday.com/zh-hk/product/ajax_get_packages_data?prodMid=' + prod_mid + '&previewToken=&beginDate=' + from_date + '&endDate=' + to_date;
  console.log('Loading package details: ' + package_url);
  $.ajax({
    method: 'GET',
    dataType:'json',
    url: package_url
  }).done(function(res, status, xhr) {
    process_package_response(res, product_version);
  });
}

function process_package_response(res, product_version) {
  var packages = res.data.PACKAGE;
  var calendars = res.data.CALENDAR;
  var items = res.data.ITEM;
  var product_setting = res.data['PRODUCT-SETTING'];
  var prod_oid = product_setting.prod_oid;
  var prod_mid = product_setting.prod_mid;

  console.log('Finding package');
  var package_found = false;
  for (const [pkg_key, pkg] of Object.entries(packages)) {
    if (!package_found) {
      var pkg_id = pkg.pkg_oid;
      var pkg_name = pkg.name;
      if (pkg_name.match(pkg_keyword_pattern) !== null) {
        console.log('Package found: ' + pkg_name);
        if (!calendars.available_pkg.includes(pkg_id)) {
          console.log('No calendar for package, sold out');
        } else {
          var available_dates = Object.values(calendars.pkg_calendar).filter(cal => cal.available_pkg.includes(pkg_id)).map(cal => cal.date);
          //var filtered_items = get_items(items, pkg.items);
          var item = items[pkg.items[0]];
          var order_sent = check_package(pkg, available_dates, item, prod_oid, prod_mid, product_version);
          if (order_sent) {
            package_found = true;
          }
        }
      }
    } else {
      console.log('Order of other package has been sent, skipping package: ' + pkg.name);
    }
  }
  if (!package_found) {
    if (window.stoprun === true) {
      console.log('All packages scanned and no matching, stop running');
    } else {
      console.log('All packages scanned and no matching, retry in ' + retry_delay + 'ms');
      setTimeout(load_init_data, retry_delay);
    }
  }
}

function get_items(items, item_ids) {
  return Object.values(items).filter(item => item_ids.includes(item.item_oid));
}

function check_package(pkg, available_dates, item, prod_oid, prod_mid, product_version) {
  var pkg_name = pkg.name;
  if (pkg.is_all_sold_out) {
    console.log('All sold out = TRUE: ' + pkg_name);
  } else {
    console.log('Available dates: ' + available_dates);
    var matched_dates = date_choices.filter(date_choice => available_dates.includes(date_choice));
    if (matched_dates.length > 0) {
      var go_date = matched_dates[0];
      console.log('Date matched: ' + matched_dates);
      console.log('Date selected: ' + go_date);

      var quantities = get_quantity_to_book(item);
      console.log(JSON.stringify(quantities));
      submit_order(pkg, item, go_date, quantities, prod_oid, prod_mid, product_version);

      /*
      var wanted_qty = 2;
      var max_qty = item.unit_quantity_rule.total_rule.max_quantity;
      var remain_qty = item.remain_qty;
      var qty_to_book = Math.min(max_qty, wanted_qty, remain_qty);
      console.log('Quantity => wanted: ' + wanted_qty + ', max: ' + max_qty + ', remain: ' + remain_qty + ', ACTUAL: ' + qty_to_book);
      submit_single_order(pkg, item, go_date, qty_to_book, prod_oid, prod_mid, product_version);
      */
      return true;
    } else {
      console.log('No matched available date');
    }
  }
  return false;
}

function get_quantity_to_book(item) {
  var qty = [];
  var max_qty = item.unit_quantity_rule.total_rule.max_quantity;
  var min_qty = item.unit_quantity_rule.total_rule.min_quantity;
  var remain_qty = item.remain_qty || Number.MAX_SAFE_INTEGER;

  var total_wanted_qty = Object.values(quantity_choices).reduce((a,b) => a+b, 0);
  var skus = item.skus;
  var specs = item.specs;
  if (specs[0].spec_oid == 'spec-single') {
    var sku = skus[0];
    var price = sku.single_price.fullday;
    var sku_oid = sku.sku_oid;
    var spec_item_oid = sku.spec['spec-single'];
    var final_qty = Math.max(min_qty, Math.min(max_qty, total_wanted_qty, remain_qty));
    console.log('Quantity => wanted: ' + total_wanted_qty + ', min: ' + min_qty + ', max: ' + max_qty + ', remain: ' + (remain_qty == Number.MAX_SAFE_INTEGER ? 'unlimited' : remain_qty) + ', FIANL: ' + final_qty);
    qty.push({
      quantity: final_qty,
      price: price,
      sku_oid: sku_oid,
      spec_item_oid: spec_item_oid
    });
  } else {
    var spec_items = item.specs.filter(spec => spec.spec_oid == 'spec-ticket')[0].spec_items;
    var has_child = spec_items.filter(spec_item => spec_item.spec_item_oid == 'child').length > 0;
    var has_senior = spec_items.filter(spec_item => spec_item.spec_item_oid == 'senior').length > 0;
    if (!has_senior) {
      quantity_choices.adult += quantity_choices.senior;
      quantity_choices.senior = 0;
      console.log('No senior, grouping senior to adult: ' + JSON.stringify(quantity_choices));
    }
    if (!has_child) {
      quantity_choices.adult += quantity_choices.child;
      quantity_choices.child = 0;
      console.log('No child, grouping senior to adult: ' + JSON.stringify(quantity_choices));
    }

    var accumulated_qty = 0;
    Object.keys(quantity_choices).filter(type => quantity_choices[type] > 0).forEach(type => {
      var matched_rulesets = item.unit_quantity_rule.ticket_rule.rulesets.filter(ruleset => ruleset.spec_items.includes(type));
      var type_min_qty = 0;
      var type_max_qty = Number.MAX_SAFE_INTEGER;
      if (matched_rulesets.length > 0) {
        var ruleset = matched_rulesets[0];
        type_min_qty = ruleset.min_quantity || 0;
        type_max_qty = ruleset.max_quantity || Number.MAX_SAFE_INTEGER;
      }

      var filtered_skus = skus.filter(sku => sku.spec['spec-ticket'] == type);
      if (filtered_skus.length > 0) {
        var sku = filtered_skus[0];
        var wanted_qty = quantity_choices[type];
        var resolved_qty = Math.max(type_min_qty, Math.min(wanted_qty, type_max_qty));
        console.log('Quantity ' + type + ' => wanted: ' + wanted_qty + ', min: ' + type_min_qty + ', max: ' + type_max_qty + ', resolved: ' + resolved_qty);
        var price;
        if (sku.single_price && sku.single_price.fullday) {
          price = sku.single_price.fullday;
        } else {
          price = item.sale_price.min_price;
        }

        if (accumulated_qty + resolved_qty <= max_qty) {
          qty.push({
            quantity: resolved_qty,
            price: price,
            sku_oid: sku.sku_oid,
            spec_item_oid: type
          });
        } else {
          var reduced_qty = max_qty - accumulated_qty;
          console.log('Exceeding total maximum ' + max_qty + ', reducing ' + type + ' to ' + reduced_qty);
          qty.push({
            quantity: reduced_qty,
            price: price,
            sku_oid: sku.sku_oid,
            spec_item_oid: type
          });
        }
      }
    });
  }
  return qty;
}

function process_direct_purchase_response(res) {
  if (res.isSuccess) {
    var redirect_url = res.data.redirect;
    console.log('Success for creating direct purchase, redirecting to ' + redirect_url);
    window.location.href = redirect_url;
  } else {
    console.log('Direct purchase not success: ' + JSON.stringify(res));
  }
}

function submit_order(pkg, item, go_date, quantities, prod_oid, prod_mid, product_version) {
  var purchase_url = 'https://www.kkday.com/zh-hk/booking/ajax_direct_purchase';
  var pkg_oid = pkg.pkg_oid;
  var item_oid = item.item_oid;

  var order_skus = [];
  var single_choice_spec = null;
  var multi_choice_spec = null;
  var generated_id = null;
  var event_name = null;

  if (item.skus.length == 1) {
    var qty = quantities[0];
    generated_id = prod_oid + '_' + item_oid + '_' + go_date + '_' + qty.spec_item_oid;
    single_choice_spec = {
      'spec-single': qty.spec_item_oid
    };
    order_skus.push({
      skuOid: qty.sku_oid,
      amount: qty.quantity,
      price: qty.price,
      spec: {
        'spec-single': qty.spec_item_oid
      }
    });
  } else {
    generated_id = prod_oid + '_' + item_oid + '_' + go_date;
    multi_choice_spec = {};
    quantities.forEach(qty => {
      multi_choice_spec[qty.spec_item_oid] = qty.quantity;
    });
    quantities.forEach(qty => {
      order_skus.push({
        skuOid: qty.sku_oid,
        amount: qty.quantity,
        price: qty.price,
        spec: {
          'spec-ticket': qty.spec_item_oid
        }
      });
    });
  }

  if (item.has_event) {
    event_name = item.sale_time.earliest_sale_time.event;
    generated_id += '_' + event_name;
  }

  var total_quantity = quantities.map(qty => qty.quantity).reduce((a,b) => a+b, 0);
  var total_price = quantities.map(qty => qty.quantity * qty.price).reduce((a,b) => a+b, 0);

  var data = {
isCartBooking: false,
isPriorityBooking: false,
items: [
  {
    prodOid: prod_oid,
    prodMid: prod_mid,
    productVersion: product_version,
    pkgOid: pkg_oid,
    itemOid: item_oid,
    isZeroPrice: false,
    goDate: go_date,
    backDate: null,
    event: event_name,
    singleChoiceSpecs: single_choice_spec,
    multiChoiceSpecAmount: multi_choice_spec,
    skus: order_skus,
    amountTotal: total_quantity,
    priceTotal: total_price,
    isMarketplace: false,
    supplierName: null,
    supplierLogo: null,
    cancelPolicy: {
      module_title: '取消政策',
      content: {
        type: 'properties',
        title: null,
        property_keys: {
          '0':'policy_type',
          '1':'partial_refund'
        },
        properties: {
          policy_type: {
            type: 'content',
            desc: '商品一經訂購完成後，即不可取消、更改訂單，亦不得請求退款',
            use_global: false,
            use_html: false,
            title: '手續費收取方式'
          },
          partial_refund: null
        }
      }
    },
    refundPolicy: {
      policy_type: 2,
      refund_type: 1,
      refund_deadline: null
    },
    verticalInfo: {
      vertical: 'DEFAULT'
    },
    id: generated_id,
    isOpenDateProduct: false,
    confirmHours: 0
  }
],
csrf_token_name: csrf_token
};
  console.log(JSON.stringify(data));
  if (!mock_submit) {
    console.log('Submitting order');
    $.ajax({
      method: 'POST',
      dataType: 'json',
      url: purchase_url,
      data: data
    }).done(process_direct_purchase_response);
  } else {
    console.log('Mock submit order');
  }
}

function submit_sinlge_order(pkg, item, go_date, qty, prod_oid, prod_mid, product_version) {
  var purchase_url = 'https://www.kkday.com/zh-hk/booking/ajax_direct_purchase';
  var pkg_oid = pkg.pkg_oid;
  var item_oid = item.item_oid;
  var single_choice_spec = item.specs[0].spec_items[0].spec_item_oid;

  var sku = item.skus[0];
  var skus_sku_oid = sku.sku_oid;
  var skus_spec_single = sku.spec['spec-single'];
  var single_price = sku.single_price.fullday;

  var total_price = single_price * qty;
  var generated_id = prod_oid + '_' + item_oid + '_' + go_date + '_' + skus_spec_single;

  var data = {
isCartBooking: false,
isPriorityBooking: false,
items: [
  {
    prodOid: prod_oid,
    prodMid: prod_mid,
    productVersion: product_version,
    pkgOid: pkg_oid,
    itemOid: item_oid,
    isZeroPrice: false,
    goDate: go_date,
    backDate: null,
    event: null,
    singleChoiceSpecs: {
      'spec-single': single_choice_spec
    },
    multiChoiceSpecAmount: null,
    skus: [
      {
        skuOid: skus_sku_oid,
        amount: qty,
        price: single_price,
        spec: {
          'spec-single': skus_spec_single
        }
      }
    ],
    amountTotal: qty,
    priceTotal: total_price,
    isMarketplace: false,
    supplierName: null,
    supplierLogo: null,
    cancelPolicy: {
      module_title: '取消政策',
      content: {
        type: 'properties',
        title: null,
        property_keys: {
          '0':'policy_type',
          '1':'partial_refund'
        },
        properties: {
          policy_type: {
            type: 'content',
            desc: '商品一經訂購完成後，即不可取消、更改訂單，亦不得請求退款',
            use_global: false,
            use_html: false,
            title: '手續費收取方式'
          },
          partial_refund: null
        }
      }
    },
    refundPolicy: {
      policy_type: 2,
      refund_type: 1,
      refund_deadline: null
    },
    verticalInfo: {
      vertical: 'DEFAULT'
    },
    id: generated_id,
    isOpenDateProduct: false,
    confirmHours: 0
  }
],
csrf_token_name: csrf_token
};
  console.log(JSON.stringify(data));
  if (!mock_submit) {
    console.log('Submitting order');
    $.ajax({
      method: 'POST',
      dataType: 'json',
      url: purchase_url,
      data: data
    }).done(process_direct_purchase_response);
  } else {
    console.log('Mock submit order');
  }
}

wait_for_csrf_token();
