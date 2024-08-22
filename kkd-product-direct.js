// ==UserScript==
// @name         kkday product backend submit
// @namespace    https://www.kkday.com/
// @version      2024-08-22
// @description  kkday product backend submit
// @author       You
// @match        https://www.kkday.com/zh-hk/product/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kkday.com
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @grant        none
// @noframes
// ==/UserScript==

var $ = jQuery.noConflict(true);

// *************************
var mock_submit = true;
var runnow = true;
// *************************
var csrf_token = ''; // check and update before running the script
var csrf_token_name = 'csrf_token_name';
var product_url = window.location.href; //'https://www.kkday.com/zh-hk/product/185742';
var pkg_keyword_pattern = /1折|一折|\$1瘋搶/;
var retry_delay = -1; //ms
var date_choices = [
  '2024-08-29',
  '2024-09-02',
  '2024-09-06',
  '2024-09-03',
  '2024-09-05',
  '2024-09-16',
  '2024-09-19',
  '2024-09-30',
  '2024-09-27'
];
var num_of_room_choice = 2;
var quantity_choices = {
  'adult': 2,
  'child': 1,
  'senior': 1,
  'infant': 0
};
var event_prefs = [
  '18:00',
  '18:15',
  '18:30'
];
var spec_prefs = {
  '方案': [
    '1間2晚'
  ],
  '預期床型 (按供應盡量安排)': [
    '大床',
    '雙床'
  ],
  '房型': [
    '大床房',
    '雙床房'
  ],
  '出發地': [
    '香港上環'
  ],
  '目的地':[
    '澳門氹仔'
  ],
  '艙等':[
    '標準艙'
  ]
};

//---
var start_msg_logged = false;

function start_main() {
  if (runnow) {
    console.log('Start run now');
    load_init_data();
  } else {
    if (!window.runnow) {
      if (!start_msg_logged) {
        console.log('To start the script, use');
        console.log('> runnow=true');
        start_msg_logged = true;
      }
      setTimeout(start_main, 500);
    } else {
      runnow = window.runnow;
      start_main();
    }
  }
}

function load_init_data() {
  console.log('Getting product page: ' + product_url);
  $.ajax({
    method: 'GET',
    dataType: 'html',
    url: product_url
  }).done(function(html) {
    console.log('Parsing product page');
    var lines = html.split(/\r?\n|\r|\n/g);

    var script_line = lines.filter(line => line.includes('__INIT_STATE__ '))[0];
    var from_pos = script_line.indexOf('{');
    var to_pos = script_line.lastIndexOf('}') + 1;
    var script_obj = JSON.parse(script_line.substring(from_pos, to_pos));
    var script_state = script_obj.state;

    var product_info = script_state.product.prodInfo;
    var product_version = product_info.version;
    var from_date = product_info.sale_time.earliest_sale_time.date;
    var to_date = product_info.sale_time.latest_sale_time.date;
    csrf_token = script_state.security.CSRFHash;
    csrf_token_name = script_state.security.CSRFTokenName;
    console.log('Using csrf token: ' + csrf_token);

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
    console.log('Package details loaded');
    process_package_response(res, from_date, to_date, product_version);
  });
}

function process_package_response(res, from_date, to_date, product_version) {
  var packages = Object.values(res.data.PACKAGE);
  var package_calendars = res.data.CALENDAR;
  var package_items = res.data.ITEM;
  var product_setting = res.data['PRODUCT-SETTING'];
  var prod_oid = product_setting.prod_oid;
  var prod_mid = product_setting.prod_mid;

  console.log('Finding package');
  process_package(packages, 0, package_items, package_calendars, prod_oid, prod_mid, from_date, to_date, product_version);
}

function process_package(packages, pkg_idx, package_items, package_calendars, prod_oid, prod_mid, from_date, to_date, product_version) {
  var pkg = packages[pkg_idx];
  var pkg_oid = pkg.pkg_oid;
  var pkg_name = pkg.name;
  if (pkg_name.match(pkg_keyword_pattern) !== null) {
    console.log('Package found: ' + pkg_name);
    if (pkg.is_all_sold_out) {
      console.log('All sold out = TRUE: ' + pkg_name);
      check_next_package(packages, pkg_idx, package_items, package_calendars, prod_oid, prod_mid, from_date, to_date, product_version);
    } else {
      if (!package_calendars.available_pkg.includes(pkg_oid)) {
        console.log('No calendar for package, sold out');
        check_next_package(packages, pkg_idx, package_items, package_calendars, prod_oid, prod_mid, from_date, to_date, product_version);
      } else {
        load_items_data(packages, pkg_idx, package_items, package_calendars, from_date, to_date, prod_oid, prod_mid, product_version);
      }
    }
  } else {
    console.log('Skip package: ' + pkg_name);
    check_next_package(packages, pkg_idx, package_items, package_calendars, prod_oid, prod_mid, from_date, to_date, product_version);
  }
}

function check_next_package(packages, pkg_idx, package_items, package_calendars, prod_oid, prod_mid, from_date, to_date, product_version) {
  if (packages.length > pkg_idx + 1) {
    process_package(packages, pkg_idx + 1, package_items, package_calendars, prod_oid, prod_mid, from_date, to_date, product_version);
  } else {
    console.log('Finished processing all packages');
    if (retry_delay >= 0) {
      console.log('Retry in ' + retry_delay + 'ms');
      setTimeout(load_init_data, retry_delay);
    }
  }
}

function load_items_data(packages, pkg_idx, package_items, package_calendars, from_date, to_date, prod_oid, prod_mid, product_version) {
  var pkg = packages[pkg_idx];
  var pkg_oid = pkg.pkg_oid;
  var pkg_item = package_items[pkg.items[0]];
  var item_oid = pkg_item.item_oid;
  var items_data_url = 'https://www.kkday.com/zh-hk/product/ajax_get_items_data?pkgOid=' + pkg_oid + '&itemOidList[]=' + item_oid + '&beginDate=' + from_date + '&endDate=' + to_date + '&previewToken=';
  console.log('Loading item data details: ' + items_data_url);
  $.ajax({
    method: 'GET',
    dataType:'json',
    url: items_data_url
  }).done(function(res, status, xhr) {
    if (res.status == "fail") {
      var from_date_obj = new Date(from_date);
      var shortened_to_date = new Date(from_date_obj.getFullYear(), from_date_obj.getMonth() + 3, 0).toISOString().substring(0, 10);
      if (to_date == shortened_to_date) {
        console.log('Failed to load item data details: ' + JSON.stringify(res));
      } else {
        console.log('Item data details failed to load, changing end date from ' + to_date + ' to ' + shortened_to_date);
        load_items_data(packages, pkg_idx, package_items, package_calendars, from_date, shortened_to_date, prod_oid, prod_mid, product_version);
      }
    } else {
      console.log('Item data details loaded');
      process_items_data_response(res, packages, pkg_idx, package_items, package_calendars, pkg_item, from_date, to_date, prod_oid, prod_mid, product_version);
    }
  });
}

function process_items_data_response(res, packages, pkg_idx, package_items, package_calendars, pkg_item, from_date, to_date, prod_oid, prod_mid, product_version) {
  var pkg = packages[pkg_idx];
  var item_data = res.data[pkg_item.item_oid];
  var item = item_data.item;
  var item_data_calendars = item_data.calendar;
  var skus_price_calendars = item_data.skusPriceCalendar;

  console.log('Finding available dates');
  var available_dates = Object.values(item_data_calendars).filter(cal => cal.is_saleable === true && cal.is_sold_out === false).map(cal => cal.date);
  console.log('Available dates: ' + available_dates);
  var matched_dates = date_choices.filter(date_choice => available_dates.includes(date_choice));
  if (matched_dates.length > 0) {
    var go_date = matched_dates[0];
    var calendar = item_data_calendars[go_date];
    console.log('Date matched: ' + matched_dates);
    console.log('Date selected: ' + go_date);
    console.log('Remain quantity ' + go_date + ': ' + (calendar.remain_qty ? JSON.stringify(calendar.remain_qty) : '--'));

    var event_name = null;
    if (item.has_event) {
      var available_events = calendar.events;
      if (calendar.remain_qty != null) {
        available_events = Object.entries(calendar.remain_qty).filter(([key, val]) => val > 0).map(([key, val]) => key);
      }
      var filtered_events = event_prefs.filter(ev => available_events.includes(ev));
      if (filtered_events.length > 0) {
        event_name = filtered_events[0];
      } else {
        event_name = item.sale_time.earliest_sale_time.event;
      }
      console.log('Event selected: ' + event_name + ' (all events: ' + available_events + ')');
    }

    var quantities = resolve_booking_quantities(item, go_date, skus_price_calendars, event_name);
    if (quantities.length == 0) {
      console.log('Failed to resolve booking quantities');
    } else {
      console.log('Quantity to submit: ' + JSON.stringify(quantities));
      //var has_date = (skus_price_calendars != null);
      var has_date = true;
      submit_order(pkg, item, has_date, go_date, event_name, quantities, prod_oid, prod_mid, product_version);
    }
  } else {
    console.log('No matched available date');
    check_next_package(packages, pkg_idx, package_items, package_calendars, prod_oid, prod_mid, from_date, to_date, product_version);
  }
}

function resolve_booking_quantities_spec_single(item, min_qty, max_qty, remain_qty, skus_price_calendars, go_date, event_name) {
  var skus = item.skus;
  var sku = skus[0];
  var sku_oid = sku.sku_oid;
  var total_wanted_qty = Object.values(quantity_choices).reduce((a,b) => a+b, 0);
  var qty_upper_bound = [total_wanted_qty, max_qty];
  if (remain_qty) {
    qty_upper_bound.push(remain_qty);
  }
  var final_qty = Math.max(min_qty, Math.min(...qty_upper_bound));
  console.log('Quantity => wanted: ' + total_wanted_qty + ', min: ' + min_qty + ', max: ' + (max_qty == Number.MAX_SAFE_INTEGER ? '--' : max_qty) + ', remain: ' + (remain_qty == Number.MAX_SAFE_INTEGER ? '--' : remain_qty) + ', FIANL: ' + final_qty);
  var price = resolve_price(item, sku, skus_price_calendars, go_date, event_name);
  console.log('Price => ' + price);
  
  return [{
    quantity: final_qty,
    price: price,
    sku_oid: sku_oid,
    specs: sku.spec
  }];
}

function resolve_booking_quantities_spec_ticket(item, spec_tickets, max_qty, skus_price_calendars, go_date, event_name) {
  var qty = [];
  var skus = item.skus;
  var spec_ticket_items = spec_tickets[0].spec_items;
  var has_child = spec_ticket_items.filter(spec_item => spec_item.spec_item_oid == 'child').length > 0;
  var has_senior = spec_ticket_items.filter(spec_item => spec_item.spec_item_oid == 'senior').length > 0;
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
      var sku_oid = sku.sku_oid;
      var wanted_qty = quantity_choices[type];
      var resolved_qty = Math.max(type_min_qty, Math.min(wanted_qty, type_max_qty));
      console.log('Quantity ' + type + ' => wanted: ' + wanted_qty + ', min: ' + type_min_qty + ', max: ' + (type_max_qty == Number.MAX_SAFE_INTEGER ? '--' : type_max_qty) + ', resolved: ' + resolved_qty);
      var price = resolve_price(item, sku, skus_price_calendars, go_date, event_name);
      console.log('Price ' + type + ' => ' + price);

      if (accumulated_qty + resolved_qty <= max_qty) {
        qty.push({
          quantity: resolved_qty,
          price: price,
          sku_oid: sku_oid,
          specs: sku.spec
        });
      } else {
        var reduced_qty = max_qty - accumulated_qty;
        console.log('Exceeding total maximum ' + max_qty + ', reducing ' + type + ' to ' + reduced_qty);
        qty.push({
          quantity: reduced_qty,
          price: price,
          sku_oid: sku_oid,
          specs: sku.spec
        });
      }
    }
  });
  return qty;
}

function resolve_booking_quantities_spec_multi(item, min_qty, max_qty, remain_qty, skus_price_calendars, go_date, event_name) {
  var qty = [];
  var selected_specs = [];
  var skus = item.skus;
  var specs = item.specs;
  var spec_pref_titles = Object.keys(spec_prefs);

  spec_pref_titles.forEach(spec_pref_title => {
    var matched_specs = specs.filter(spec => spec.spec_title == spec_pref_title);
    if (matched_specs.length > 0) {
      var matched_spec = matched_specs[0];
      var spec_item_prefs = spec_prefs[matched_spec.spec_title]
      var matched_spec_items = matched_spec.spec_items.filter(spec_item => spec_item_prefs.includes(spec_item.name));
      if (matched_spec_items.length > 0) {
        selected_spec_item_oid = matched_spec_items[0].spec_item_oid;
      } else {
        // choose default (first) spec item
        selected_spec_item_oid = matched_spec.spec_items[0].spec_item_oid
      }
      selected_specs.push({
        spec_oid: matched_spec.spec_oid,
        spec_item_oid: selected_spec_item_oid
      });
    }          
  });

  var filtered_skus = skus;
  selected_specs.forEach(selected_spec => {
    filtered_skus = filtered_skus.filter(sku => sku.spec[selected_spec.spec_oid] && sku.spec[selected_spec.spec_oid] == selected_spec.spec_item_oid);
  });
  
  if (filtered_skus.length > 0) {
    var sku = filtered_skus[0];
    var sku_oid = sku.sku_oid;

    Object.entries(sku.spec).forEach(([spec_oid, spec_item_oid]) => {
      var spec = specs.filter(spec => spec.spec_oid == spec_oid)[0];
      var spec_item = spec.spec_items.filter(spec_item => spec_item.spec_item_oid == spec_item_oid)[0];
      console.log('Selected option: ' + spec.spec_title + '=' + spec_item.name);
    });

    var wanted_qty = num_of_room_choice;
    var qty_upper_bound = [wanted_qty, max_qty];
    if (remain_qty) {
      qty_upper_bound.push(remain_qty);
    }
    var final_qty = Math.max(min_qty, Math.min(...qty_upper_bound));
    console.log('Quantity => wanted: ' + wanted_qty + ', min: ' + min_qty + ', max: ' + (max_qty == Number.MAX_SAFE_INTEGER ? '--' : max_qty) + ', FINAL: ' + final_qty);
    var price = resolve_price(item, sku, skus_price_calendars, go_date, event_name);
    console.log('Price => ' + price);

    qty.push({
      quantity: final_qty,
      price: price,
      sku_oid: sku_oid,
      specs: sku.spec
    });
  }
  return qty;
}

function resolve_booking_quantities(item, go_date, skus_price_calendars, event_name) {
  var qty = [];
  var max_qty = item.unit_quantity_rule.total_rule.max_quantity || Number.MAX_SAFE_INTEGER;
  var min_qty = item.unit_quantity_rule.total_rule.min_quantity || 0;
  var remain_qty = item.remain_qty || Number.MAX_SAFE_INTEGER;
  var specs = item.specs;

  if (specs[0].spec_oid == 'spec-single') {
    return resolve_booking_quantities_spec_single(item, min_qty, max_qty, remain_qty, skus_price_calendars, go_date, event_name);
  }

  var spec_tickets = specs.filter(spec => spec.spec_oid == 'spec-ticket');
  if (spec_tickets.length > 0) {
    return resolve_booking_quantities_spec_ticket(item, spec_tickets, max_qty, skus_price_calendars, go_date, event_name);
  }

  return resolve_booking_quantities_spec_multi(item, min_qty, max_qty, remain_qty, skus_price_calendars, go_date, event_name);
}

function resolve_price(item, sku, skus_price_calendars, go_date, event_name) {
  if (sku.single_price && sku.single_price.fullday) {
    return sku.single_price.fullday;
  } else {
    var sku_oid = sku.sku_oid;
    var price_obj = skus_price_calendars[sku_oid][go_date].price;
    if (price_obj.fullday) {
      return price_obj.fullday;
    } else if (item.has_event && price_obj[event_name]) {
      return price_obj[event_name];
    } else {
      return item.sale_price.min_price;
    }
  }
}

function submit_order(pkg, item, has_date, go_date, event_name, quantities, prod_oid, prod_mid, product_version) {
  var purchase_url = 'https://www.kkday.com/zh-hk/booking/ajax_direct_purchase';
  var pkg_oid = pkg.pkg_oid;
  var item_oid = item.item_oid;
  var refund_policy_policy_type = pkg.refund_policy.policy_type;
  var refund_policy_refund_type = pkg.refund_policy.refund_type;

  var order_skus = [];
  var single_choice_spec = null;
  var multi_choice_spec = null;
  var generated_id = prod_oid + '_' + item_oid + '_' + go_date;

  if (item.has_event) {
    generated_id += '_' + event_name;
  }

  if (item.specs[0].spec_oid == 'spec-single') {
    var qty = quantities[0];
    var spec_item_oid = qty.specs['spec-single'];
    generated_id += '_' + spec_item_oid;
    single_choice_spec = {
      'spec-single': spec_item_oid
    };
    order_skus.push({
      skuOid: qty.sku_oid,
      amount: qty.quantity,
      price: qty.price,
      spec: {
        'spec-single': spec_item_oid
      }
    });
  } else if (item.specs.filter(spec => spec.spec_oid == 'spec-ticket').length > 0) {
    multi_choice_spec = {};
    quantities.forEach(qty => {
      var spec_item_oid = qty.specs['spec-ticket'];
      multi_choice_spec[spec_item_oid] = qty.quantity;
      order_skus.push({
        skuOid: qty.sku_oid,
        amount: qty.quantity,
        price: qty.price,
        spec: {
          'spec-ticket': spec_item_oid
        }
      });
    });
  } else {
    single_choice_spec = {};
    var qty = quantities[0];
    Object.entries(qty.specs).forEach(([spec_oid, spec_item_oid]) => {
      single_choice_spec[spec_oid] = spec_item_oid;
      generated_id += '_' + spec_item_oid;
    });
    order_skus.push({
      skuOid: qty.sku_oid,
      amount: qty.quantity,
      price: qty.price,
      spec: single_choice_spec
    });
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
      policy_type: refund_policy_policy_type,
      refund_type: refund_policy_refund_type,
      refund_deadline: null
    },
    verticalInfo: {
      vertical: 'DEFAULT'
    },
    id: generated_id,
    isOpenDateProduct: false
  }
]
};
  if (has_date) {
    var data_item = data.items[0];
    var confirm_time = pkg.order_process_setting.confirm_time;
    var unit_to_hours = {
      h: 1,
      d: 24
    };
    var confirm_hours = confirm_time == null ? 0 : (unit_to_hours[confirm_time.unit] * confirm_time.value);
    data_item.confirmHours = confirm_hours;
    data_item.goDate = go_date;
    data_item.backDate = null;
  }
  data[csrf_token_name] = csrf_token;

  log_as_form_data(data);
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

function process_direct_purchase_response(res) {
  if (res.isSuccess) {
    var redirect_url = res.data.redirect;
    console.log('Success for creating direct purchase, redirecting to ' + redirect_url);
    window.location.href = redirect_url;
  } else {
    console.log('Direct purchase not success: ' + JSON.stringify(res));
  }
}

function log_as_form_data(data) {
  var form_data = convert_json_to_formdata(data);
  for (let [key, val] of form_data.entries()) {
    console.log(key + '="' + val + '"');
  }
  //console.log(JSON.stringify(data));
}

function mergeObjects(object1, object2) {
  return [object1, object2].reduce(function (carry, objectToMerge) {
    Object.keys(objectToMerge).forEach(function (objectKey) {
      carry[objectKey] = objectToMerge[objectKey];
    });
    return carry;
  }, {});
}

function isArray(val) {
  return ({}).toString.call(val) === '[object Array]';
}

function isJsonObject(val) {
  return !isArray(val) && typeof val === 'object' && !!val && !(val instanceof Blob) && !(val instanceof Date);
}

function isAppendFunctionPresent(formData) {
  return typeof formData.append === 'function';
}

function isGlobalFormDataPresent() {
  return typeof FormData === 'function';
}

function getDefaultFormData() {
  if (isGlobalFormDataPresent()) {
    return new FormData();
  }
}

function convert_json_to_formdata(jsonObject, options) {
  if (options && options.initialFormData) {
    if (!isAppendFunctionPresent(options.initialFormData)) {
      throw 'initialFormData must have an append function.';
    }
  } else if (!isGlobalFormDataPresent()) {
    throw 'This environment does not have global form data. options.initialFormData must be specified.';
  }
  var defaultOptions = {
    initialFormData: getDefaultFormData(),
    showLeafArrayIndexes: true,
    includeNullValues: true,
    mapping: function(value) {
      if (typeof value === 'boolean') {
          return +value ? 'true': 'false';
      }
      return value;
    }
  };
  var mergedOptions = mergeObjects(defaultOptions, options || {});
  return convertRecursively(jsonObject, mergedOptions, mergedOptions.initialFormData);
}

function convertRecursively(jsonObject, options, formData, parentKey) {
  var index = 0;
  for (var key in jsonObject) {
    if (jsonObject.hasOwnProperty(key)) {
      var propName = parentKey || key;
      var value = options.mapping(jsonObject[key]);
      if (parentKey && isJsonObject(jsonObject)) {
        propName = parentKey + '[' + key + ']';
      }
      if (parentKey && isArray(jsonObject)) {
        if (isArray(value) || options.showLeafArrayIndexes) {
          propName = parentKey + '[' + index + ']';
        } else {
          propName = parentKey + '[]';
        }
      }
      if (isArray(value) || isJsonObject(value)) {
        convertRecursively(value, options, formData, propName);
      } else if (value instanceof FileList) {
        for (var j = 0; j < value.length; j++) {
          formData.append(propName + '[' + j + ']', value.item(j));
        }
      } else if (value instanceof Blob) {
        formData.append(propName, value, value.name);
      } else if (value instanceof Date) {
        formData.append(propName, value.toISOString());
      } else if ((value === null && options.includeNullValues) && value !== undefined) {
        formData.append(propName, "");
      } else if (value !== null && value !== undefined) {
        formData.append(propName, value);
      }
    }
    index++;
  }
  return formData;
}

start_main();
