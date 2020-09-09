// ==UserScript==
// @name        
// @namespace   ncsflab.monkey
// @match       https:///brand?*
// @match       https:///cart
// @match       https:///login
// @match       https:///index
// @match       https://js.stripe.com/v3/elements-inner-card*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @grant       none
// @version     1.3
// ==/UserScript==

PHONE_NUM = "";
CARD_NUMBER = "";
EXP_DATE = "";
CVC = "";

BRAND_ID_LIST = [];
CART_DELAY_MILLIS = 300;
PAYMENT_DELAY_MILLIS = 500;
CHECK_OPENING_RELOAD_MILLIS = 5000;


var bodyText = document.body.innerText;
if (bodyText.match(/Parse error/) != null) {
  log("Parse error, reloading...");
  location.reload();
}

function goLogin() {
  $('input.mobile').val(PHONE_NUM).change();
  //$('div.get_verify_btn').click();
  
  var tncBox = $('div.tc_wra div.checkbox');
  if (!tncBox.hasClass('active')) {
    log("Ticking T&C box");
    tncBox.click();
  }
  
  var promoBox = $('div.pm_wra div.pm_checkbox');
  if (promoBox.hasClass('active')) {
    log("Unticking promo box");
    promoBox.click();
  }
}

function goPurchase() {
  addToCart(BRAND_ID_LIST);
}

function addToCart(brand_ids) {
  if (brand_ids.length == 0) {
    log("No item to add");
  } else {
    var url = "/actions/addtocart";
    var data = "brand=" + brand_ids[0][0] + "&product=" + brand_ids[0][2] + "&type=" + brand_ids[0][1] + "&qty=1";

    log("Adding brand " + brand_ids[0] + " to cart");
    $.ajax({
      url: url,
      method: 'POST',
      data: data,
      cache: false,
      dataType: 'json'
    }).done(function( data, textStatus, jqXHR ) {
      log("Server responsed: " + data.msg);
      brand_ids.shift();
      if (brand_ids.length > 0) {
        log("Adding the remaining " + brand_ids.length + " items");
        setTimeout(function() {
          addToCart(brand_ids);
        }, CART_DELAY_MILLIS);
      } else {
        log("All items added to cart, going to cart page");
        window.location.href="/cart";
      }
    }).fail(function( jqXHR, textStatus, errorThrown ) {
      log("Failed adding to cart: " + errorThrown);
    });
  }
}

function goCart() {
  var tncBox = $('div.tc_wra div.checkbox');
  if (!tncBox.hasClass('active')) {
    log("Ticking T&C box");
    tncBox.click();
  }
  log("Click Pay Now");
  $('div.cart_payout_btn').click();
  monitorCartSoldOut();
}

function monitorCartSoldOut() {
  if ($('div.alert_text').html().match(/數量不足/) != null) {
    log("Some items sold out");
    $('div.alert_pop_close_btn').click();
  }
  var soldOutItems = $('div.no_quota').closest('div.cart_group').find('div.cart_delete_btn').toArray();
  if (soldOutItems.length > 0) {
    log("Removing " + soldOutItems.length + " sold out items");
    removeFromCart(soldOutItems);
  } else {
    setTimeout(monitorCartSoldOut, CART_DELAY_MILLIS);
  }
}

function removeFromCart(soldOutItems) {
  var soldOutItem = soldOutItems[0];
  var brand = $(soldOutItem).attr('brand');
  var product = $(soldOutItem).attr('product');
  var type = $(soldOutItem).attr('type');
  var url = "/actions/subtocart";
  var data = "brand=" + brand + "&product=" + product + "&type=" + type;

  log("Removing from cart: " + data);
  $.ajax({
    url: url,
    method: 'POST',
    data: data,
    cache: false,
    dataType: 'json'
  }).done(function( data, textStatus, jqXHR ) {
    log("Server responsed: " + data.msg);
    soldOutItems.shift();
    if (soldOutItems.length > 0) {
      log("Removing the remaining " + soldOutItems.length + " items");
      setTimeout(function() {
        removeFromCart(soldOutItems);
      }, CART_DELAY_MILLIS);
    } else {
      log("All sold out items removed from cart, reloading cart page");
      window.location.href="/cart";
    }
  }).fail(function( jqXHR, textStatus, errorThrown ) {
    log("Failed removing from cart: " + errorThrown);
  });
}

function goPayment() {
  if ($('span.CardField-number input:visible').length == 0 ||
      $('span.CardField-expiry input:visible').length == 0 ||
      $('span.CardField-cvc input:visible').length == 0) {
    log("Waiting for payment box");
    setTimeout(goPayment, PAYMENT_DELAY_MILLIS);
  } else {
    setTimeout(fillPaymentInfo, PAYMENT_DELAY_MILLIS);
  }
}

function fillPaymentInfo() {
  log("Filling payment info");
  $('span.CardField-number input').focus().val(CARD_NUMBER).change();
  $('span.CardField-expiry input').focus().val(EXP_DATE).change();
  $('span.CardField-cvc input').focus().val(CVC).change();
  log("Ready to pay!");
}

function checkOpening() {
  if ($('div#index img').attr('src').match(/develop.*\.jpg/) != null) {
    var sleep_time = Math.floor(Math.random()*5001) + CHECK_OPENING_RELOAD_MILLIS;
    log('Not open yet, reloading in ' + sleep_time + 'ms');
    setTimeout(function() {
      location.reload();
    }, sleep_time);
  } else {
    log("Open now.");
    if (BRAND_ID_LIST.length == 0) {
      log("Brand list is empty");
    } else {
      log("Redirecting to product page");
      window.location.href="/brand?id=" + BRAND_ID_LIST[0][0] + "&t=" + BRAND_ID_LIST[0][1] + "&p=" + BRAND_ID_LIST[0][2];
    }
  }
}

function log(msg) {
  var tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
  var localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
  console.log("[" + localISOTime + "] " + msg);
}

$(document).ready(function() {
  var url = window.location.href;
  log("Loaded " + url);
  if (url.match(/\/brand/) != null) {
    log('Product page detected. Initiate purchase process');
    goPurchase();
  } else if (url.match(/\/cart/) != null) {
    log('Cart page detected. Initiate cart handling process');
    goCart();
  } else if (url.match(/stripe.com/) != null) {
    log('Payment box detected.');
    goPayment();
  } else if (url.match(/\/login/) != null) {
    log('Login page detected');
    goLogin();
  } else if (url.match(/\/index$/) != null) {
    log('Index page detected');
    checkOpening();
  }
});

