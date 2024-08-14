// ==UserScript==
// @name         kkday select plan
// @namespace    https://www.kkday.com/
// @version      2024-08-14
// @description  kkday select plan
// @author       You
// @match        https://www.kkday.com/zh-hk/product/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kkday.com
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @grant        none
// ==/UserScript==

var $ = jQuery.noConflict(true);

function waitPlan() {
    var item = $('div.option-item');
    if ($(item).length == 0) {
      console.log('Waiting for plans');
      setTimeout(waitPlan, 500);
    } else {
        console.log('Plans: ' + $('div.option-item div.option-content__depiction span').text());
        selectPlan();
    }
}

function selectPlan() {
    var optionOneDollar = $('div#option-sec div.option-content:contains("$1瘋搶") button.kk-button.select-option');
    var optionTenPercent = $('div#option-sec div.option-content:contains("1折") button.kk-button.select-option');

    if ($(optionOneDollar).length > 0) {
        console.log('Selecting $1瘋搶');
        $(optionOneDollar).click();
    } else if ($(optionTenPercent).length > 0) {
        console.log('Selecting 1折');
        $(optionTenPercent).click();
    } else {
        console.log('No plan available, refreshing');
        setTimeout(function() {
            window.location.reload();
        }, 1000);
    }
}

$(document).ready(function () {
    console.log("Document ready");
    waitPlan();
    console.log('Document end');
});
